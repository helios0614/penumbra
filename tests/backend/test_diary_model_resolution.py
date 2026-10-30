"""Isolated source contracts. Run with AionHome's venv Python and aion-chat path.

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
    if case in ("explicit-missing", "legacy-missing"):
        settings["api_configs"][0]["url"] = ""
    if case in ("bootstrap-configured", "legacy-missing"):
        settings["gemini_url"] = "https://gemini.test/v1beta/models"
    with sqlite3.connect(diary.path) as db:
        db.execute("UPDATE diary_entries SET model=?", (selection if case.startswith("explicit") else None,))
        db.execute("CREATE TABLE IF NOT EXISTS conversations(model TEXT, updated_at REAL)")
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
        if case in ("explicit-missing", "legacy-missing"):
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
        frames = await diary.consume(await ns["regenerate_diary_message"]("entry", "a0"))
        assert calls[0][1:] == calls[1][1:]
        assert frames[-1]["type"] == "done" and frames[-1]["message"]["id"] != "a0"
        assert "a0" not in await diary.ids()
    asyncio.run(scenario())



def test_entry_settings_read_write_and_two_entry_runtime_isolation(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from model_registry import MODEL_REGISTRY
    from main_configuration import MainSelection
    from registry_configuration import RegistryConfigurationService
    from test_diary_message_order import Diary
    import config
    config.DEFAULT_API_URLS = {}
    monkeypatch.setattr(config, "DEFAULT_MODEL", "gemini-3-flash", raising=False)
    diary = Diary(tmp_path / "settings.db", [], monkeypatch)
    diary.seed_suffix()
    settings = {"api_configs": [
        {"id": "a", "name": "A", "url": "https://a.test/v1", "key": "synthetic-only-a", "model": "compat-a"},
        {"id": "b", "name": "B", "url": "https://b.test/v1", "key": "synthetic-only-b", "model": "compat-b"}],
        "selected_api_config_id": "a", "chat_format": "anthropic"}
    with sqlite3.connect(diary.path) as db:
        db.execute("UPDATE diary_entries SET model=NULL")
        db.execute("INSERT INTO conversations VALUES ('自定义', 1)")
        db.execute("INSERT INTO diary_entries(id,date,created_at,updated_at) VALUES('other','2026-10-02',1,1)")
        db.execute("INSERT INTO diary_messages(id,entry_id,role,content,created_at) VALUES('other-u','other','user','synthetic',1)")
        db.execute("INSERT INTO diary_messages(id,entry_id,role,content,created_at) VALUES('other-ai','other','assistant','synthetic',2)")
    monkeypatch.setitem(sys.modules, "database", SimpleNamespace(get_db=diary.db))
    source = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location("entry_settings_contract", source / "registry_selection_settings.py")
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    service = RegistryConfigurationService(settings, {})
    ns = diary.ns
    ns.update(SETTINGS=settings, MODELS=MODEL_REGISTRY, DEFAULT_MODEL="gemini-3-flash")
    for node in ast.parse((source / "routes/diary.py").read_text()).body:
        if getattr(node, "name", None) in {"_legacy_diary_model", "_resolve_diary_request"}:
            exec(compile(ast.Module(body=[node], type_ignores=[]), "<actual-diary-resolution>", "exec"), ns)
    calls = []
    async def stream(_history, _model, **kwargs):
        binding = kwargs["binding"]
        calls.append((binding.connection_id, binding.protocol, binding.backend_model, binding.endpoint))
        yield "synthetic reply"
    ns["stream_ai"] = stream
    async def scoped_broadcast(event):
        if event["type"] == "diary_msg_created":
            with sqlite3.connect(diary.path) as db:
                assert db.execute("SELECT 1 FROM diary_messages WHERE entry_id=? AND id=?", (event["data"]["entry_id"], event["data"]["id"])).fetchone()
    ns["manager"] = SimpleNamespace(broadcast=scoped_broadcast)
    async def scenario():
        initial = await module.read_selection("diary", "entry", service)
        assert initial["source"] == "legacy_unselected" and initial["selection"] is None
        assert initial["effective_selection"]["model"] == "compat-a"
        assert initial["effective_diagnostic"] is None
        for choice in initial["connections"]:
            assert set(choice) == {"id", "name", "enabled", "transport", "default_model", "credential_configured"}
        assert "synthetic-only" not in json.dumps(initial)
        a = MainSelection(connection_id="connection-api-config:a", protocol="anthropic_messages", model="entry-a")
        b = MainSelection(connection_id="connection-api-config:b", protocol="openai_chat_completions", model="entry-b")
        saved = await module.write_selection("diary", "entry", a, service)
        assert saved["source"] == "explicit" and saved["effective_selection"] == a.storage()
        await module.write_selection("diary", "other", b, service)
        for entry, target in [("entry", "a0"), ("other", "other-ai")]:
            # A request-local catalog hint cannot replace either persisted Entry binding.
            await diary.consume(await ns["post_message"](entry, ns["MsgCreate"](content="synthetic", model="GLM-5")))
            await diary.consume(await ns["regenerate_diary_message"](entry, target))
        assert calls[0] == calls[1] and calls[2] == calls[3]
        assert calls[0][:3] == ("connection-api-config:a", "anthropic_messages", "entry-a")
        assert calls[2][:3] == ("connection-api-config:b", "openai_chat_completions", "entry-b")
        assert (await module.read_selection("diary", "entry", service))["selection"] == a.storage()
        assert (await module.read_selection("diary", "other", service))["selection"] == b.storage()
    asyncio.run(scenario())

def pytest_generate_tests(metafunc):
    if "case" in metafunc.fixturenames:
        metafunc.parametrize("case", ["legacy-null", "explicit", "explicit-missing", "bootstrap-configured", "legacy-missing"])


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
        if (source / "diary_model_selection.py").exists():
            shutil.copyfile(source / "diary_model_selection.py", target / "diary_model_selection.py")
        shutil.copyfile(source / "registry_selection_settings.py", target / "registry_selection_settings.py")
        test = target / "tests/contract/test_diary_model_resolution.py"
        shutil.copyfile(__file__, test)
        env = {"PATH": os.environ.get("PATH", os.defpath), "PYTHONPATH": str(target), "PYTHONDONTWRITEBYTECODE": "1", "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1", "TZ": "Asia/Shanghai"}
        return subprocess.run([sys.executable, "-B", "-c", runner.BOOTSTRAP, str(test)], cwd=target, env=env).returncode


if __name__ == "__main__":
    raise SystemExit(main())
