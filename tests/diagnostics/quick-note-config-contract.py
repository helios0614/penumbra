"""Isolated HTTP check of the existing backend route; no live settings or DB.

Run with a Python environment containing FastAPI/httpx:
  python tests/diagnostics/quick-note-config-contract.py /path/to/aion-chat
"""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


root = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(root))
settings = {"qn_trigger_hours": [5, 12, 20], "qn_period_labels": {5: "夜晚", 12: "上午", 20: "下午"}}
saves = []


def forbidden_db():
    raise AssertionError("Configuration PUT must not enter record CRUD")


with tempfile.TemporaryDirectory(prefix="penumbra-qn-contract-") as temp:
    target = Path(temp) / "settings.json"

    def save(value):
        saves.append(json.loads(json.dumps(value)))
        target.write_text(json.dumps(value))

    stubs = {
        "config": types.SimpleNamespace(SETTINGS=settings, save_settings=save, load_worldbook=lambda: {}),
        "database": types.SimpleNamespace(get_db=forbidden_db),
        "sse_log": types.SimpleNamespace(stream=None, clear=lambda: None, emit=lambda *args: None),
    }
    with patch.dict(sys.modules, stubs), patch.dict(os.environ, {"TZ": "Asia/Shanghai"}):
        spec = importlib.util.spec_from_file_location("isolated_quick_note_route", root / "routes/quick_notes.py")
        route = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(route)
        app = FastAPI()
        app.include_router(route.router)
        with TestClient(app) as client:
            initial = client.get("/api/quick-notes/trigger-config").json()
            assert initial["hours"] == [5, 12, 20] and initial["day_boundary_hour"] == 5
            assert initial["time_zone"] == "Asia/Shanghai" and initial["date_contract_error"] is None
            payload = {"hours": [6, 13, 21], "labels": {"6": "记录", "13": "记录", "21": ""}}
            result = client.put("/api/quick-notes/trigger-config", json=payload)
            assert result.status_code == 200 and result.json() == payload
            assert len(saves) == 1
            readback = client.get("/api/quick-notes/trigger-config").json()
            assert readback["hours"] == payload["hours"] and readback["labels"] == payload["labels"]
            assert readback["day_boundary_hour"] == 6
            # Recreate in-memory settings from the isolated persistence file.
            settings.clear()
            settings.update(json.loads(target.read_text()))
            assert client.get("/api/quick-notes/trigger-config").json() == readback
            for invalid in [
                {"hours": [6], "labels": {"6": "夜"}},
                {"hours": [6, 6], "labels": {"6": "夜"}},
                {"hours": [6, 24], "labels": {"6": "夜", "24": "日"}},
                {"hours": [6, 13], "labels": {"6": "夜", "14": "日"}},
            ]:
                rejected = client.put("/api/quick-notes/trigger-config", json=invalid)
                assert rejected.status_code == 400, rejected.text
                assert len(saves) == 1
                assert client.get("/api/quick-notes/trigger-config").json() == readback
print("PASS: real config GET/PUT routing, duplicate/empty labels, readback, isolated persistence reload, 4 invalid writes; record CRUD untouched")
