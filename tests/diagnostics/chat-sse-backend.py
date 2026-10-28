"""Run real send/regenerate routes in a source-only temporary copy, with fake Provider.
Usage: <backend-venv>/bin/python tests/diagnostics/chat-sse-backend.py <backend-repo> [port]
No real config, data, credentials, startup jobs or upstream calls are loaded.
"""
import asyncio
import contextvars
import json
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

repo = Path(sys.argv[1]).resolve()
port = int(sys.argv[2]) if len(sys.argv) > 2 else 45366
copy = tempfile.TemporaryDirectory(prefix="penumbra-sse-source-")
root = Path(copy.name) / "aion-chat"
for name in subprocess.check_output(["git", "-C", str(repo), "ls-files", "aion-chat"], text=True).splitlines():
    source = repo / name
    if source.suffix == ".py" or name == "aion-chat/static/chat.html" or "/tests/fixtures/" in name and source.suffix == ".json":
        target = Path(copy.name) / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
sys.path[:0] = [str(root), str(root / "tests" / "contract")]
import aiosqlite
import pytest
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from test_chat_context_defaults import runtime
import database
import config
import auth

patch = pytest.MonkeyPatch()
chat, settings, dbpath, _ = runtime.__wrapped__(Path(copy.name), patch)
patch.setattr(database, "DB_PATH", dbpath)
patch.setattr(config, "DB_PATH", dbpath)
patch.setattr(auth, "_load_auth_config_readonly", lambda: {"session_secret": "synthetic-timing-signing-key"})
with sqlite3.connect(dbpath) as db:
    db.row_factory = sqlite3.Row
    seed = {table: [dict(row) for row in db.execute(f"SELECT * FROM {table}")] for table in ("conversations", "messages")}
for identity in ("a", "b"):
    seed["conversations"].append({**seed["conversations"][0], "id": identity})
dbpath.rename(Path(copy.name) / "seed.sqlite")
asyncio.run(database.init_db())
with sqlite3.connect(dbpath) as db:
    for table, rows in seed.items():
        for row in rows:
            db.execute(f"INSERT INTO {table} ({','.join(row)}) VALUES ({','.join('?' for _ in row)})", tuple(row.values()))

with sqlite3.connect(dbpath) as db:
    for identity in ("a", "b"):
        db.execute("INSERT INTO messages (id,conv_id,role,content,created_at) VALUES (?,?,?,?,?)",
                   (f"{identity}-initial", identity, "assistant", f"合成回复 {identity}", 11 if identity == "a" else 12))

run = contextvars.ContextVar("timing_run", default="none")
facts = []
scenario = {"delays": [5.5, 1, 3], "buffer": False}
def mark(stage, event="", size=0):
    facts.append({"run": run.get(), "stage": stage, "event": event, "size": size, "wall": time.time() * 1000})
    del facts[:-2000]

Queue = asyncio.Queue
class TimedQueue(Queue):
    async def put(self, value):
        if isinstance(value, dict) and value.get("type"):
            mark("backend.queue", value["type"], len(value.get("content", "")))
        return await super().put(value)
patch.setattr(chat.asyncio, "Queue", TimedQueue)
async def stream(*args, **kwargs):
    for delay, text in zip(scenario["delays"], ["SSE_ONE", "_TWO", "_THREE"]):
        await asyncio.sleep(delay)
        mark("backend.provider", "chunk", len(text))
        yield text
patch.setattr(chat, "stream_ai", stream)
async def broadcast(value):
    if value.get("type") in ("msg_created", "msg_updated"):
        mark("backend.ws.after_commit", value["type"])
patch.setattr(chat.manager, "broadcast", broadcast)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(chat.router)
@app.post("/api/synthetic/scenario")
async def configure(value: dict):
    scenario.update(value)
    return {"ok": True}
@app.get("/api/synthetic/timeline")
async def timeline(): return facts

class WireTiming:
    def __init__(self, app): self.app = app
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http": return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        token = run.set(headers.get(b"x-penumbra-debug-execution", b"synthetic").decode())
        delayed = scenario["buffer"] and (scope["path"].endswith("/send") or scope["path"].endswith("/regenerate"))
        pending = []
        async def observe(message):
            if message["type"] == "http.response.body" and message.get("body"):
                mark("backend.asgi.body", size=len(message["body"]))
            if delayed: pending.append(message)
            else: await send(message)
        try:
            await self.app(scope, receive, observe)
            if delayed:
                await asyncio.sleep(1)
                mark("synthetic.buffer.release")
                for message in pending: await send(message)
        finally: run.reset(token)

try:
    print(f"Synthetic real-route backend: http://127.0.0.1:{port}", flush=True)
    uvicorn.run(WireTiming(app), host="127.0.0.1", port=port, log_level="warning")
finally:
    patch.undo()
    copy.cleanup()
