"""Read-only source contracts. Run with AionHome's venv Python and aion-chat path.

Copies the existing backend runner's source whitelist into a temporary directory;
never imports the application, real config/database or a Provider. No backend edits.
"""
import ast
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile


def test_diary_runtime_selection(tmp_path, monkeypatch, case):
    from fastapi import HTTPException
    from model_registry import MODEL_REGISTRY
    from test_diary_message_order import Diary
    import config
    config.DEFAULT_API_URLS = {}
    diary = Diary(tmp_path / "synthetic.db", [], monkeypatch)
    diary.seed_suffix()
    selected_id = "connection-api-config:fixture-selected"
    selection = json.dumps({"connection_id": selected_id, "protocol": "anthropic_messages", "model": "literal/entry-model"})
    settings = {"api_configs": [{"id": "fixture-selected", "name": "fixture connection", "url": "https://configured.test/v1", "model": "fixture-model", "key": "synthetic-only"}],
                "selected_api_config_id": "fixture-selected", "chat_format": "anthropic", "gemini_url": "", "gemini_key": "synthetic-only"}
    if case == "explicit-missing":
        settings["api_configs"][0]["url"] = ""
    if case == "bootstrap-configured":
        settings["gemini_url"] = "https://gemini.test/v1beta/models"
    with sqlite3.connect(diary.path) as db:
        db.execute("UPDATE diary_entries SET model=?", (selection if case.startswith("explicit") else None,))
        db.execute("CREATE TABLE conversations(model TEXT, updated_at REAL)")
        db.execute("INSERT INTO conversations VALUES ('自定义',1)")
    ns = diary.ns
    ns.update(SETTINGS=settings, MODELS=MODEL_REGISTRY, DEFAULT_MODEL="gemini-3-flash")
    tree = ast.parse((Path(__file__).resolve().parents[2] / "routes/diary.py").read_text())
    for node in tree.body:
        if getattr(node, "name", None) in {"_legacy_diary_model", "_resolve_diary_request"}:
            exec(compile(ast.Module(body=[node], type_ignores=[]), "<actual-diary-resolution>", "exec"), ns)
    calls = []

    async def stream(_history, model, **kwargs):
        binding = kwargs["binding"]
        calls.append((model, binding.connection_id, binding.protocol, binding.backend_model, binding.endpoint))
        yield "synthetic answer"
    ns["stream_ai"] = stream

    async def scenario():
        initial = await diary.rows()
        if case == "explicit-missing":
            for operation in (lambda: diary.response("synthetic question"), lambda: ns["regenerate_diary_message"]("entry", "a0")):
                try:
                    await operation()
                except HTTPException as error:
                    assert error.status_code == 422 and error.detail == {"code": "missing_base_url"}
                else:
                    raise AssertionError("missing URL must reject before generation")
                assert await diary.rows() == initial
            assert not calls
            return
        await diary.send("synthetic question")
        assert calls[0][1:4] == (selected_id, "anthropic_messages", "literal/entry-model" if case == "explicit" else "fixture-model")
        assert calls[0][4].startswith("https://configured.test/")
        before = await diary.rows()
        if case == "legacy-null":
            try:
                await ns["regenerate_diary_message"]("entry", "a0")
            except HTTPException as error:
                assert error.status_code == 422 and error.detail == {"code": "missing_base_url"}
            else:
                raise AssertionError("unconfigured bootstrap connection must reject")
            assert await diary.rows() == before and len(calls) == 1
            return
        frames = await diary.consume(await ns["regenerate_diary_message"]("entry", "a0"))
        if case == "explicit":
            assert calls[0][1:] == calls[1][1:]
        else:
            assert calls[1][1:4] == ("connection-legacy-gemini", "gemini_stream_generate_content", "gemini-3-flash-preview")
            assert calls[1][4].startswith("https://gemini.test/")
        assert frames[-1]["type"] == "done" and frames[-1]["message"]["id"] != "a0"
        assert "a0" not in await diary.ids()
    asyncio.run(scenario())


def pytest_generate_tests(metafunc):
    if "case" in metafunc.fixturenames:
        metafunc.parametrize("case", ["legacy-null", "explicit", "explicit-missing", "bootstrap-configured"])


def main():
    source = Path(sys.argv[1]).resolve()
    runner_path = source / "tests/contract/run_diary_pr1_isolated.py"
    spec = importlib.util.spec_from_file_location("isolated_diary_runner", runner_path)
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    with tempfile.TemporaryDirectory(prefix="diary-pr4a1-contract-") as folder:
        target = Path(folder) / "aion-chat"
        for name in (*runner.SOURCES, *(f"tests/contract/{name}" for name in runner.TESTS)):
            output = target / name
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source / name, output)
        test = target / "tests/contract/test_diary_model_resolution.py"
        shutil.copyfile(__file__, test)
        env = {"PATH": os.environ.get("PATH", os.defpath), "PYTHONPATH": str(target), "PYTHONDONTWRITEBYTECODE": "1", "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1", "TZ": "Asia/Shanghai"}
        return subprocess.run([sys.executable, "-B", "-c", runner.BOOTSTRAP, str(test)], cwd=target, env=env).returncode


if __name__ == "__main__":
    raise SystemExit(main())
