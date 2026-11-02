"""Stdlib isolation tests. Every mutation is under TemporaryDirectory.

python3.12 -B -m unittest discover -s tests/deploy -p 'test_install.py' -v
No SSH, production remote, production artifact, or backend imports.
"""

import contextlib
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
import select
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock


PROJECT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("penumbra_install", PROJECT / "scripts/deploy/install.py")
deploy = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = deploy
spec.loader.exec_module(deploy)


def git(root, *args, data=None):
    return subprocess.run(["git", "-C", str(root), *args], input=data, check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


class Crash(BaseException):
    """Like process termination: bypass the installer's exception rollback."""


class GitProcessTests(unittest.TestCase):
    """Real POSIX processes; only deadlines are shortened for these fixtures."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="penumbra-git-process-test-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.pids = self.base / "pids.json"
        self.script = self.base / "git-fixture.py"
        self.addCleanup(self.cleanup_group)

    def cleanup_group(self):
        if self.pids.exists():
            pid = json.loads(self.pids.read_text())["parent"]
            try:
                os.killpg(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                os.waitpid(pid, 0)
            except ChildProcessError:
                pass

    def assert_gone(self, pid):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                return
            time.sleep(.02)
        self.fail(f"Fixture process {pid} survived group cleanup")

    def run_fixture(self, source, timeout=.8, env=None):
        self.script.write_text(source)
        with mock.patch.object(deploy, "GIT_TERM_GRACE", .25), mock.patch.object(deploy, "GIT_KILL_GRACE", 2):
            return deploy.run_git([sys.executable, "-B", str(self.script)], cwd=str(self.base), pass_fds=(),
                                  env=dict(os.environ) if env is None else env, operation="fetch", timeout=timeout)

    def tree_source(self, *, ignore_parent=False, ignore_child=False, close_child_pipes=False):
        child_ready = self.base / "child-ready"
        child = (
            "import os,signal,time,pathlib\n"
            f"signal.signal(signal.SIGTERM, signal.{'SIG_IGN' if ignore_child else 'SIG_DFL'})\n"
            f"pathlib.Path({str(child_ready)!r}).write_text('ready')\n"
            + ("os.close(1);os.close(2)\n" if close_child_pipes else "")
            + "while True:time.sleep(.05)\n"
        )
        return (
            "import json,os,pathlib,signal,subprocess,sys,time\n"
            f"signal.signal(signal.SIGTERM, signal.{'SIG_IGN' if ignore_parent else 'SIG_DFL'})\n"
            f"child=subprocess.Popen([sys.executable,'-B','-c',{child!r},'git-remote-https-fixture'])\n"
            f"pathlib.Path({str(self.pids)!r}).write_text(json.dumps({{'parent':os.getpid(),'child':child.pid,'group':os.getpgrp(),'session':os.getsid(0)}}))\n"
            f"while not pathlib.Path({str(child_ready)!r}).exists():time.sleep(.01)\n"
            "sys.stderr.write('Receiving objects: 20% (fixture)\\n');sys.stderr.flush()\n"
            "while True:time.sleep(.05)\n"
        )

    def assert_tree_reaped(self):
        pids = json.loads(self.pids.read_text())
        self.assertEqual(pids["parent"], pids["group"])
        self.assertEqual(pids["parent"], pids["session"])
        for key in ("parent", "child"):
            self.assert_gone(pids[key])
        with self.assertRaises(ChildProcessError):
            os.waitpid(pids["parent"], os.WNOHANG)
        with self.assertRaises(ProcessLookupError):
            os.killpg(pids["group"], 0)

    def test_timeout_terms_leader_and_real_descendant_and_reaps_child(self):
        with mock.patch.object(deploy.os, "killpg", wraps=os.killpg) as sent:
            with self.assertRaisesRegex(deploy.DeployError, r"Git fetch total timeout.*limit 0.8s") as caught:
                self.run_fixture(self.tree_source())
        self.assertTrue(any(c.args[1] == signal.SIGTERM for c in sent.call_args_list))
        self.assertFalse(any(c.args[1] == signal.SIGKILL for c in sent.call_args_list))
        self.assertIn("Receiving objects: 20%", str(caught.exception))
        self.assertNotIn("cleanup failed", str(caught.exception))
        self.assert_tree_reaped()

    def test_successful_leader_cannot_leave_a_detached_pipe_descendant(self):
        source = self.tree_source(ignore_child=True, close_child_pipes=True)
        source = source.rsplit("while True:time.sleep(.05)", 1)[0] + "sys.exit(0)\n"
        with self.assertRaisesRegex(deploy.DeployError, "left descendant processes after exit"):
            self.run_fixture(source, timeout=2)
        self.assert_tree_reaped()

    def test_ignored_term_escalates_to_kill_for_leader_and_descendant(self):
        real_popen = subprocess.Popen
        processes = []
        def observe(*args, **kwargs):
            process = real_popen(*args, **kwargs)
            processes.append(process)
            return process
        with mock.patch.object(deploy.subprocess, "Popen", observe):
            with self.assertRaisesRegex(deploy.DeployError, "total timeout"):
                self.run_fixture(self.tree_source(ignore_parent=True, ignore_child=True))
        self.assertEqual(processes[0].returncode, -signal.SIGKILL)
        self.assert_tree_reaped()

    def test_leader_exit_and_pipe_eof_do_not_hide_term_ignoring_descendant(self):
        with self.assertRaisesRegex(deploy.DeployError, "total timeout"):
            self.run_fixture(self.tree_source(ignore_child=True, close_child_pipes=True))
        self.assert_tree_reaped()

    def test_timeout_retains_stderr_and_redacts_credentials_before_truncation(self):
        secrets = ["bearer-fixture-123", "basic-fixture-456", "cookie-fixture-789", "setcookie-fixture-abc",
                   "proxy-user", "proxy-pass", "query-fixture-def", "env-fixture-ghi", "password-fixture-jkl",
                   "ghp_fixtureABCDEFGHIJKLMNOP", "github_pat_fixtureABCDEFGHIJKLMNOP"]
        diagnostic = (
            "Receiving objects: 20%\n"
            "Authorization: Bearer bearer-fixture-123\n"
            "Proxy-Authorization: Basic basic-fixture-456\n"
            "Cookie: session=cookie-fixture-789\nSet-Cookie: session=setcookie-fixture-abc; Secure\n"
            "https://proxy-user:proxy-pass@example.invalid/path\n"
            "https://example.invalid/path?access_token=query-fixture-def&x=1\n"
            "remote: env-fixture-ghi\npassword=password-fixture-jkl\n"
            "remote: ghp_fixtureABCDEFGHIJKLMNOP github_pat_fixtureABCDEFGHIJKLMNOP\n"
        )
        source = f"import sys,time\nsys.stderr.write({diagnostic!r});sys.stderr.flush()\ntime.sleep(10)\n"
        with self.assertRaises(deploy.DeployError) as caught:
            self.run_fixture(source, env=dict(os.environ, EXAMPLE_API_TOKEN="env-fixture-ghi"))
        message = str(caught.exception)
        self.assertIn("Receiving objects: 20%", message)
        self.assertIn("[REDACTED]", message)
        for secret in secrets:
            self.assertNotIn(secret, message)
        # Truncation inside a sensitive line must not expose its tail.
        self.assertNotIn("tail-secret", deploy.git_stderr(("Authorization: " + "x" * 20000 + "tail-secret").encode(), {}))
        boundary = ('Authorization: Bearer header-secret\n'
                    'Cookie: cookie-secret\n{"token": "json-secret"}\n'
                    'proxy: proxyuser:proxypass@host.invalid:8080\n')
        redacted = deploy.git_stderr(boundary, {"EXAMPLE_TOKEN": "or"})
        for secret in ("header-secret", "cookie-secret", "json-secret", "proxyuser", "proxypass"):
            self.assertNotIn(secret, redacted)

    def test_nonzero_exit_is_distinct_from_timeout_and_reaped(self):
        source = ("import os,pathlib,json,sys\n"
                  f"pathlib.Path({str(self.pids)!r}).write_text(json.dumps({{'parent':os.getpid()}}))\n"
                  "sys.stderr.write('fatal: transport rejected\\n');sys.exit(23)\n")
        with self.assertRaisesRegex(deploy.DeployError, r"Git fetch exited with status 23.*limit 0.8s") as caught:
            self.run_fixture(source)
        self.assertNotIn("total timeout", str(caught.exception))
        self.assertIn("fatal: transport rejected", str(caught.exception))
        with self.assertRaises(ChildProcessError):
            os.waitpid(json.loads(self.pids.read_text())["parent"], os.WNOHANG)

    def test_system_launch_error_is_distinct(self):
        with self.assertRaisesRegex(deploy.DeployError, "Git fetch system error") as caught:
            deploy.run_git([str(self.base / "absent")], cwd=str(self.base), pass_fds=(),
                           env=dict(os.environ), operation="fetch", timeout=1)
        self.assertNotIn("total timeout", str(caught.exception))
        self.assertNotIn("exited with status", str(caught.exception))

    def test_termination_failure_is_reported_even_if_kill_later_succeeds(self):
        killpg = os.killpg
        def refuse_term(pid, sig):
            if sig == signal.SIGTERM:
                raise PermissionError(1, "synthetic TERM denial")
            return killpg(pid, sig)
        with mock.patch.object(deploy.os, "killpg", refuse_term):
            with self.assertRaisesRegex(deploy.DeployError, "process-group cleanup failed") as caught:
                self.run_fixture(self.tree_source(ignore_parent=True, ignore_child=True))
        self.assertIn("synthetic TERM denial", str(caught.exception))
        self.assert_tree_reaped()

    def test_transient_group_probe_failure_is_rechecked_within_grace(self):
        killpg = os.killpg
        injected = False
        def transient_probe(pid, sig):
            nonlocal injected
            if sig == 0 and not injected:
                injected = True
                raise PermissionError(1, "synthetic transient group probe failure")
            return killpg(pid, sig)
        with mock.patch.object(deploy.os, "killpg", transient_probe):
            with self.assertRaisesRegex(deploy.DeployError, "total timeout") as caught:
                self.run_fixture(self.tree_source())
        self.assertTrue(injected)
        self.assertNotIn("cleanup failed", str(caught.exception))
        self.assert_tree_reaped()

    def test_normal_process_returns_stdout(self):
        self.assertEqual(self.run_fixture("print('normal completion')\n"), b"normal completion\n")


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="penumbra-installer-test-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.remote = self.base / "remote"
        self.remote.mkdir()
        git(self.remote, "init", "--quiet")
        git(self.remote, "config", "user.email", "fixture@example.invalid")
        git(self.remote, "config", "user.name", "fixture")
        self.root = self.base / "deployment"

    def tool(self, checkpoint=None):
        return deploy.Installer(self.root, transport=self.remote, checkpoint=checkpoint)

    def artifact(self, version="one", font=b"unchanged font", change=None):
        for child in self.remote.iterdir():
            if child.name != ".git":
                shutil.rmtree(child) if child.is_dir() else child.unlink()
        dist = self.base / ("dist-" + version)
        if dist.exists():
            shutil.rmtree(dist)
        (dist / "assets").mkdir(parents=True)
        (dist / ".vite").mkdir()
        (dist / "fonts/cormorant-garamond").mkdir(parents=True)
        js = f"assets/main-{version}-ABCD1234.js"
        (dist / "index.html").write_text(f'<script src="/penumbra/{js}"></script><link rel="stylesheet" href="/penumbra/assets/shared-ABCD1234.css">')
        (dist / js).write_text(f'console.log("{version}")')
        (dist / "assets/shared-ABCD1234.css").write_text("body{color:black}")
        (dist / "fonts/cormorant-garamond/CormorantGaramond-Regular-latin.woff2").write_bytes(font)
        (dist / "fonts/cormorant-garamond/OFL.txt").write_text("fixture license")
        (dist / ".vite/manifest.json").write_text(json.dumps({"index.html": {
            "file": js, "isEntry": True, "css": ["assets/shared-ABCD1234.css"]}}))
        identity = {"sourceSha": "a" * 40, "workflowSha": "b" * 40, "repository": deploy.REPOSITORY,
                    "buildId": "actions-123-1", "runId": "123", "runNumber": "1", "runAttempt": "1",
                    "runUrl": "https://github.com/helios0614/penumbra/actions/runs/123"}
        packed = self.base / ("packed-" + version)
        if packed.exists():
            shutil.rmtree(packed)
        # Reuse the REAL publisher to create our fixtures. Python cannot pass
        # by merely agreeing with a second Python copy of the schema/algorithm.
        subprocess.run(["node", "-e",
                        "require(process.argv[1]).packageRelease(process.argv[2],process.argv[3],JSON.parse(process.argv[4]))",
                        str(PROJECT / "scripts/deploy/artifact.cjs"), str(dist), str(packed), json.dumps(identity)],
                       check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        shutil.copytree(packed, self.remote, dirs_exist_ok=True)
        if change:
            change(self.remote)
        git(self.remote, "add", "-A")
        git(self.remote, "commit", "--quiet", "--allow-empty", "-m", version)
        sha = git(self.remote, "rev-parse", "HEAD").decode().strip()
        return deploy.Expected(sha, identity["sourceSha"], identity["workflowSha"], identity["buildId"])

    def metadata(self, payload):
        return json.loads((payload / "release.json").read_bytes())

    def change_metadata(self, edit):
        def change(payload):
            m = self.metadata(payload)
            edit(m)
            (payload / "release.json").write_bytes(deploy.encoded(m))
            # Keep the metadata checksum valid so identity checks are exercised.
            lines = (payload / "SHA256SUMS").read_text().splitlines(keepends=True)
            lines[-1] = f"{deploy.digest((payload / 'release.json').read_bytes())}  release.json\n"
            (payload / "SHA256SUMS").write_text("".join(lines))
        return change

    def index(self):
        p = self.root / "site/index.html"
        return p.read_bytes() if p.exists() else None

    def status(self):
        return self.tool().execute("status")

    def installed(self):
        first = self.artifact()
        self.tool().execute("install", first)
        return first, self.index()

    def assert_active(self, expected):
        status = self.status()
        self.assertTrue(status["ready"], status)
        self.assertEqual(status["active"]["artifactSha"] if status["active"] else None,
                         expected.artifact if expected else None)

    def test_packager_parity_and_pinned_commit_not_branch_head(self):
        first = self.artifact()
        self.artifact("two")
        result = self.tool().execute("verify", first)
        self.assertEqual(result["fileCount"], 5)
        self.assertEqual(set(p.name for p in (self.root / "releases" / first.artifact).iterdir()), {"dist", "release.json", "SHA256SUMS"})
        self.assertIsNone(self.index())
        self.assertEqual(git(self.remote, "status", "--porcelain"), b"")
        self.assertEqual(git(self.root / "repository.git", "rev-parse", "--is-bare-repository").strip(), b"true")
        self.assertEqual(git(self.root / "repository.git", "rev-parse", "refs/penumbra/artifacts/" + first.artifact).decode().strip(), first.artifact)

    def test_fetch_timeout_configuration_leaves_other_git_limits_unchanged(self):
        expected = self.artifact()
        self.assertEqual(self.tool().fetch_timeout, 1200)
        tool = deploy.Installer(self.root, transport=self.remote, fetch_timeout=42)
        with mock.patch.object(deploy, "run_git", wraps=deploy.run_git) as observed:
            result = tool.execute("verify", expected)  # Real Git and publisher fixture.
        self.assertEqual(result["verified"], expected.artifact)
        calls = observed.call_args_list
        self.assertTrue(any(c.kwargs["operation"] == "fetch" for c in calls))
        self.assertTrue(any(c.kwargs["operation"] != "fetch" for c in calls))
        for call in calls:
            self.assertEqual(call.kwargs["timeout"], 42 if call.kwargs["operation"] == "fetch" else 300)
        self.assertIsNone(self.index())

    def test_invalid_fetch_timeout_and_cli_option(self):
        for value in (0, -1, True, "1200", float("nan"), float("inf"), 10 ** 1000):
            with self.subTest(value=value), self.assertRaises(deploy.DeployError):
                deploy.Installer(self.root, fetch_timeout=value)
        help_result = subprocess.run([sys.executable, "-B", str(PROJECT / "scripts/deploy/install.py"),
                                      "verify", "--help"], capture_output=True, check=True)
        self.assertIn(b"--fetch-timeout", help_result.stdout)
        result = subprocess.run([sys.executable, "-B", str(PROJECT / "scripts/deploy/install.py"), "verify",
                                 "--root", str(self.root), "--artifact-sha", "a" * 40,
                                 "--source-sha", "b" * 40, "--workflow-sha", "c" * 40,
                                 "--build-id", "actions-123-1", "--fetch-timeout", "0"], capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn(b"--fetch-timeout", result.stderr)
        self.assertFalse(self.root.exists())

    def test_real_git_fetch_timeout_keeps_pack_and_refuses_retry_without_touching_index(self):
        first, old = self.installed()
        second = self.artifact("two")
        pack = self.root / "repository.git/objects/pack/tmp_pack_interrupted"
        helper_pid = self.base / "upload-pid"
        upload = self.base / "paused-upload-pack"
        upload.write_text(
            f"#!{sys.executable}\nimport os,pathlib,time\n"
            f"pathlib.Path({str(pack)!r}).write_bytes(b'PACK synthetic incomplete fixture')\n"
            f"pathlib.Path({str(helper_pid)!r}).write_text(str(os.getpid()))\n"
            "while True:time.sleep(.05)\n")
        upload.chmod(0o700)
        tool = deploy.Installer(self.root, transport=self.remote, fetch_timeout=.8)
        original = tool.git
        def paused(*args):
            if args[0] == "fetch":
                return original("fetch", "--upload-pack=" + str(upload), *args[1:])
            return original(*args)
        tool.git = paused
        with mock.patch.object(deploy, "GIT_TERM_GRACE", .25):
            with self.assertRaisesRegex(deploy.DeployError, "Git fetch total timeout"):
                tool.execute("install", second)
        self.assertTrue(helper_pid.exists(), "Real Git must have started its upload-pack child")
        with self.assertRaises(ProcessLookupError):
            os.kill(int(helper_pid.read_text()), 0)
        snapshot = (pack.read_bytes(), pack.stat().st_ino, pack.stat().st_mtime_ns)
        self.assertEqual(self.index(), old)
        self.assertFalse(self.status()["ready"])
        for command in ("verify", "recover"):
            with self.subTest(command=command), self.assertRaisesRegex(deploy.DeployError, "manual investigation"):
                self.tool().execute(command, second if command == "verify" else None)
            self.assertEqual((pack.read_bytes(), pack.stat().st_ino, pack.stat().st_mtime_ns), snapshot)
            self.assertEqual(self.index(), old)
        self.assertEqual(json.loads((self.root / "current.json").read_text())["active"]["artifactSha"], first.artifact)

    def test_nonexistent_commit_preserves_active(self):
        _, old = self.installed()
        expected = deploy.Expected("f" * 40, "a" * 40, "b" * 40, "actions-123-1")
        with self.assertRaises(deploy.DeployError):
            self.tool().execute("install", expected)
        self.assertEqual(self.index(), old)
        self.assertTrue(self.status()["ready"])

    def test_identity_flags_reject_non_full_sha_and_first_release_override(self):
        for sha in ["latest", "deploy", "abc1234", "A" * 40, "a" * 39, "-" + "a" * 39]:
            with self.subTest(sha=sha), self.assertRaises(deploy.DeployError):
                deploy.Expected(sha, "a" * 40, "b" * 40, "actions-123-1")
        with self.assertRaises(deploy.DeployError):
            deploy.Expected(deploy.FIRST_SHA, "a" * 40, "b" * 40, "actions-123-1")

    def test_metadata_rejections_preserve_old_index(self):
        _, old = self.installed()
        cases = {
            "schema": lambda m: m.update(schemaVersion=2),
            "source": lambda m: m.update(sourceSha="c" * 40),
            "workflow": lambda m: m.update(workflowSha="c" * 40),
            "repository": lambda m: m.update(repository="attacker/repo"),
            "build": lambda m: m.update(buildId="actions-999-1"),
            "base": lambda m: m.update(basePath="/"),
            "count": lambda m: m.update(fileCount=99),
            "bytes": lambda m: m.update(sizeBytes=99),
            "hash": lambda m: m["files"][0].update(sha256="0" * 64),
            "size": lambda m: m["files"][0].update(sizeBytes=1),
            "dist": lambda m: m.update(distSha256="0" * 64),
            "traversal": lambda m: m["files"][0].update(path="dist/../../outside"),
            "file_order": lambda m: m["files"].reverse(),
            "run": lambda m: m.update(runId="999"),
            "url": lambda m: m.update(runUrl="https://example.invalid/"),
            "validation": lambda m: m["productionValidation"].update(developmentPagesExcluded=False),
        }
        for label, edit in cases.items():
            with self.subTest(label=label):
                bad = self.artifact(label, change=self.change_metadata(edit))
                with self.assertRaises(deploy.DeployError):
                    self.tool().execute("install", bad)
                self.assertEqual(self.index(), old)
        self.assertTrue(self.status()["ready"])

    def test_missing_extra_and_modified_files(self):
        _, old = self.installed()
        cases = {
            "missing": lambda p: (p / "dist/assets/shared-ABCD1234.css").unlink(),
            "extra": lambda p: (p / "dist/assets/extra.js").write_text("unexpected"),
            "modified": lambda p: (p / "dist/assets/shared-ABCD1234.css").write_text("changed"),
            "invalid_json": lambda p: (p / "release.json").write_text("{broken"),
            "sums": lambda p: (p / "SHA256SUMS").write_text("wrong"),
            "map": lambda p: (p / "dist/assets/source.js.map").write_text("not public"),
            "dotfile": lambda p: (p / "dist/.env").write_text("synthetic"),
            "duplicate_json": lambda p: (p / "release.json").write_text('{"schemaVersion":1,"schemaVersion":1}'),
        }
        for label, change in cases.items():
            with self.subTest(label=label):
                bad = self.artifact(label, change=change)
                with self.assertRaises(deploy.DeployError):
                    self.tool().execute("install", bad)
                self.assertEqual(self.index(), old)

    def test_git_symlink_and_submodule(self):
        first = self.artifact()
        for mode, oid in [("120000", git(self.remote, "hash-object", "-w", "--stdin", data=b"../../outside").decode().strip()),
                          ("160000", first.artifact)]:
            with self.subTest(mode=mode):
                git(self.remote, "read-tree", first.artifact)
                git(self.remote, "update-index", "--add", "--cacheinfo", f"{mode},{oid},dist/assets/link.js")
                tree = git(self.remote, "write-tree").decode().strip()
                sha = git(self.remote, "commit-tree", tree, "-p", first.artifact, "-m", "malformed mode").decode().strip()
                expected = deploy.Expected(sha, first.source, first.workflow, first.build)
                with self.assertRaises(deploy.DeployError):
                    self.tool().execute("verify", expected)
                self.assertIsNone(self.index())

    def test_raw_git_tree_path_traversal(self):
        first = self.artifact()
        blob = git(self.remote, "hash-object", "-w", "--stdin", data=b"x").decode().strip()
        for name in [b"..", b"/absolute", b"bad\nname", b"back\\slash"]:
            with self.subTest(name=name):
                raw = b"100644 " + name + b"\0" + bytes.fromhex(blob)
                tree = git(self.remote, "hash-object", "--literally", "-t", "tree", "-w", "--stdin", data=raw).decode().strip()
                commit = (f"tree {tree}\nauthor fixture <fixture@example.invalid> 1 +0000\n"
                          "committer fixture <fixture@example.invalid> 1 +0000\n\nunsafe tree\n").encode()
                sha = git(self.remote, "hash-object", "--literally", "-t", "commit", "-w", "--stdin", data=commit).decode().strip()
                expected = deploy.Expected(sha, first.source, first.workflow, first.build)
                with self.assertRaises(deploy.DeployError):
                    self.tool().execute("verify", expected)
                self.assertIsNone(self.index())

    def test_first_repeat_and_upgrade_resources_coexist(self):
        first, _ = self.installed()
        self.assertEqual(self.tool().execute("install", first)["result"], "already-active")
        second = self.artifact("two")
        self.tool().execute("install", second)
        self.assert_active(second)
        self.assertTrue((self.root / "site/assets/main-one-ABCD1234.js").exists())
        self.assertTrue((self.root / "site/assets/main-two-ABCD1234.js").exists())
        self.assertEqual(len(list((self.root / "releases").iterdir())), 2)
        self.assertFalse((self.root / "site/release.json").exists())
        self.assertFalse((self.root / "site/SHA256SUMS").exists())
        self.assertFalse((self.root / "site/.git").exists())

    def test_font_conflict_keeps_index(self):
        first, old = self.installed()
        second = self.artifact("two", font=b"different font")
        with self.assertRaisesRegex(deploy.DeployError, "conflict"):
            self.tool().execute("install", second)
        self.assertEqual(self.index(), old)
        self.assert_active(first)

    def test_other_fixed_resource_conflict(self):
        first, old = self.installed()
        # Repackage with an intentionally changed resource at the same CSS URL.
        def change(p):
            (p / "dist/assets/shared-ABCD1234.css").write_text("body{color:red}")
            self.reseal(p)
        second = self.artifact("two", change=change)
        with self.assertRaisesRegex(deploy.DeployError, "conflict"):
            self.tool().execute("install", second)
        self.assertEqual(self.index(), old)
        self.assert_active(first)

    def reseal(self, payload):
        m = self.metadata(payload)
        files = []
        for p in sorted((payload / "dist").rglob("*")):
            if p.is_file():
                data = p.read_bytes()
                files.append({"path": p.relative_to(payload).as_posix(), "sizeBytes": len(data), "sha256": deploy.digest(data)})
        sums = "".join(f"{x['sha256']}  {x['path']}\n" for x in files).encode()
        m.update(files=files, fileCount=len(files), sizeBytes=sum(x["sizeBytes"] for x in files), distSha256=deploy.digest(sums))
        m["productionValidation"].update(fileCount=m["fileCount"], sizeBytes=m["sizeBytes"])
        data = deploy.encoded(m)
        (payload / "release.json").write_bytes(data)
        (payload / "SHA256SUMS").write_bytes(sums + f"{deploy.digest(data)}  release.json\n".encode())

    def test_unknown_site_file_stops_without_cleanup(self):
        _, old = self.installed()
        extra = self.root / "site/assets/unknown.js"
        extra.write_text("preserve me")
        second = self.artifact("two")
        with self.assertRaisesRegex(deploy.DeployError, "Unknown site"):
            self.tool().execute("install", second)
        self.assertEqual(extra.read_text(), "preserve me")
        self.assertEqual(self.index(), old)

    def test_symlinks_at_root_parent_site_release_record_and_lock(self):
        first, old = self.installed()
        outside = self.base / "outside"
        outside.mkdir()
        marker = outside / "marker"
        marker.write_text("untouched")
        parent_link = self.base / "link"
        parent_link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises((OSError, deploy.DeployError)):
            deploy.Installer(parent_link, transport=self.remote).execute("install", first)
        for relative in ["site", "releases/" + first.artifact, "records", "deploy.lock"]:
            with self.subTest(relative=relative):
                original = self.root / relative
                saved = self.base / ("saved-" + relative.replace("/", "-"))
                original.rename(saved)
                original.symlink_to(outside, target_is_directory=True)
                try:
                    with self.assertRaises((OSError, deploy.DeployError)):
                        self.tool().execute("install", first)
                finally:
                    original.unlink()
                    saved.rename(original)
        asset = self.root / "site/assets/main-one-ABCD1234.js"
        asset.unlink()
        asset.symlink_to(marker)
        with self.assertRaises((OSError, deploy.DeployError)):
            self.tool().execute("install", first)
        self.assertEqual(marker.read_text(), "untouched")
        self.assertEqual(self.index(), old)

    def test_writable_managed_directory_is_refused(self):
        first, old = self.installed()
        site = self.root / "site"
        site.chmod(0o777)
        with self.assertRaises(deploy.DeployError):
            self.tool().execute("install", first)
        self.assertEqual(self.index(), old)

    def test_concurrent_lock(self):
        first, old = self.installed()
        with (self.root / "deploy.lock").open("rb") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(deploy.DeployError, "lock is busy"):
                self.tool().execute("install", first)
            with self.assertRaisesRegex(deploy.DeployError, "lock is busy"):
                self.tool().execute("status")
        self.assertEqual(self.index(), old)

    def test_failures_restore_old_index_and_record(self):
        first, old = self.installed()
        second = self.artifact("two")
        self.tool().execute("verify", second)
        for point in ["after_resource", "before_index", "after_index", "after_current"]:
            with self.subTest(point=point):
                def fail(name):
                    if name == point:
                        raise OSError("synthetic failure")
                with self.assertRaises(deploy.DeployError):
                    self.tool(fail).execute("install", second)
                self.assertEqual(self.index(), old)
                self.assert_active(first)
                # Remove only test fixture resources so after_resource is
                # reached again; the actual installer never removes assets.
                new_asset = self.root / "site/assets/main-two-ABCD1234.js"
                if new_asset.exists():
                    new_asset.unlink()

    def test_index_replace_syscall_failure(self):
        first, old = self.installed()
        second = self.artifact("two")
        original = deploy.Store.move
        def fail(store, source, target, replace=False):
            if source.endswith("next-index.html"):
                raise OSError("synthetic rename failure")
            return original(store, source, target, replace)
        with mock.patch.object(deploy.Store, "move", fail), self.assertRaises(deploy.DeployError):
            self.tool().execute("install", second)
        self.assertEqual(self.index(), old)
        self.assert_active(first)

    def test_partial_resource_write_never_publishes_partial_bytes(self):
        first, old = self.installed()
        second = self.artifact("two")
        original = deploy.Store.write_new
        def fail(store, path, data):
            if path.startswith("staging/resource-"):
                original(store, path, b"partial")
                raise OSError("synthetic disk write failure")
            return original(store, path, data)
        with mock.patch.object(deploy.Store, "write_new", fail), self.assertRaises(deploy.DeployError):
            self.tool().execute("install", second)
        self.assertFalse((self.root / "site/assets/main-two-ABCD1234.js").exists())
        self.assertEqual(self.index(), old)
        self.assert_active(first)

    def test_interruption_between_resource_link_and_staging_unlink(self):
        first, old = self.installed()
        second = self.artifact("two")
        original = deploy.os.unlink
        def crash(path, *args, **kwargs):
            if str(path).startswith("resource-"):
                raise Crash()
            return original(path, *args, **kwargs)
        with mock.patch.object(deploy.os, "unlink", crash), self.assertRaises(Crash):
            self.tool().execute("install", second)
        resource = self.root / "site/assets/main-two-ABCD1234.js"
        self.assertEqual(resource.read_bytes(), (self.root / "releases" / second.artifact / "dist/assets/main-two-ABCD1234.js").read_bytes())
        self.assertEqual(self.index(), old)
        self.tool().execute("recover")
        self.assert_active(first)
        self.tool().execute("install", second)
        self.assert_active(second)

    def test_current_json_write_failure(self):
        first, old = self.installed()
        second = self.artifact("two")
        original = deploy.Installer.write_current
        failed = False
        def fail(tool, pointer):
            nonlocal failed
            if not failed:
                failed = True
                raise OSError("synthetic current.json failure")
            return original(tool, pointer)
        with mock.patch.object(deploy.Installer, "write_current", fail), self.assertRaises(deploy.DeployError):
            self.tool().execute("install", second)
        self.assertEqual(self.index(), old)
        self.assert_active(first)

    def test_record_write_failure_after_switch(self):
        first, old = self.installed()
        second = self.artifact("two")
        original = deploy.Installer.record
        def fail(tool, record, phase):
            if phase == "index_switched":
                raise OSError("synthetic record failure")
            return original(tool, record, phase)
        with mock.patch.object(deploy.Installer, "record", fail), self.assertRaises(deploy.DeployError):
            self.tool().execute("install", second)
        self.assertEqual(self.index(), old)
        self.assert_active(first)

    def test_retained_release_is_bound_to_git_not_self_signed_sums(self):
        first, old = self.installed()
        release = self.root / "releases" / first.artifact
        (release / "dist/assets/main-one-ABCD1234.js").write_text("tampered but resealed")
        self.reseal(release)
        with self.assertRaisesRegex(deploy.DeployError, "Git blob"):
            self.tool().execute("install", first)
        self.assertEqual(self.index(), old)

    def test_corrupted_cached_commit_and_tree_objects_are_rejected(self):
        first, old = self.installed()
        original = deploy.Installer.git
        # Model a corrupted cached object reader independently of whether Git
        # chose packed or loose storage. rev-parse still returns the right OID.
        for kind in ["commit", "tree"]:
            with self.subTest(kind=kind):
                def changed(tool, *args):
                    body = original(tool, *args)
                    return body + b"tampered" if args[:2] == ("cat-file", kind) else body
                with mock.patch.object(deploy.Installer, "git", changed), self.assertRaises(deploy.DeployError):
                    self.tool().execute("install", first)
                self.assertEqual(self.index(), old)
        self.assert_active(first)

    def test_approved_first_release_totals_cannot_be_overridden(self):
        first = self.artifact()
        approved = {**deploy.FIRST, "sourceSha": first.source, "workflowSha": first.workflow, "buildId": first.build}
        with mock.patch.object(deploy, "FIRST_SHA", first.artifact), mock.patch.object(deploy, "FIRST", approved):
            with self.assertRaisesRegex(deploy.DeployError, "first release differs"):
                self.tool().execute("verify", first)
        self.assertIsNone(self.index())

    def test_mid_fetch_failure_preserves_active(self):
        first, old = self.installed()
        second = self.artifact("two")
        original = deploy.Installer.git
        def fail(tool, *args):
            if args[0] == "fetch":
                raise deploy.DeployError("synthetic interrupted transport")
            return original(tool, *args)
        with mock.patch.object(deploy.Installer, "git", fail), self.assertRaises(deploy.DeployError):
            self.tool().execute("install", second)
        self.assertEqual(self.index(), old)
        self.assert_active(first)
        self.tool().execute("install", second)
        self.assert_active(second)

    def test_backup_corruption_refuses_recovery_overwrite(self):
        _, old = self.installed()
        second = self.artifact("two")
        def crash(name):
            if name == "before_index":
                raise Crash()
        with self.assertRaises(Crash):
            self.tool(crash).execute("install", second)
        backup = next((self.root / "staging").glob("*/old-index.html"))
        backup.write_text("damaged backup")
        with self.assertRaisesRegex(deploy.DeployError, "backup differs"):
            self.tool().execute("recover")
        self.assertEqual(self.index(), old)
        self.assertFalse(self.status()["ready"])

    def test_git_object_wrong_type(self):
        first = self.artifact()
        tree = git(self.remote, "rev-parse", "HEAD^{tree}").decode().strip()
        with self.assertRaises(deploy.DeployError):
            self.tool().execute("verify", deploy.Expected(tree, first.source, first.workflow, first.build))

    def test_returned_commit_must_equal_requested_sha(self):
        first = self.artifact()
        original = deploy.Installer.git
        def wrong(tool, *args):
            result = original(tool, *args)
            return b"0" * 40 + b"\n" if args[0] == "rev-parse" and "--verify" in args else result
        with mock.patch.object(deploy.Installer, "git", wrong), self.assertRaises(deploy.DeployError):
            self.tool().execute("verify", first)
        self.assertIsNone(self.index())

    def test_rollback_and_undeploy_retain_resources(self):
        first, old = self.installed()
        second = self.artifact("two")
        self.tool().execute("install", second)
        self.tool().execute("rollback", first)
        self.assertEqual(self.index(), old)
        self.assert_active(first)
        self.assertTrue((self.root / "site/assets/main-two-ABCD1234.js").exists())
        self.tool().execute("rollback", undeploy=True)
        self.assertIsNone(self.index())
        self.assert_active(None)
        self.assertTrue((self.root / "site/assets/main-one-ABCD1234.js").exists())
        self.tool().execute("install", second)
        self.assert_active(second)

    def test_rollback_missing_release_fetches_exact_commit(self):
        first, _ = self.installed()
        second = self.artifact("two")
        self.tool().execute("install", second)
        shutil.rmtree(self.root / "releases" / first.artifact)  # Test loss, never tool cleanup.
        self.tool().execute("rollback", first)
        self.assert_active(first)

    def test_rollback_missing_or_corrupted_resource_and_unknown_sha(self):
        first, _ = self.installed()
        second = self.artifact("two")
        self.tool().execute("install", second)
        old = self.index()
        unknown = deploy.Expected("f" * 40, first.source, first.workflow, first.build)
        with self.assertRaises(deploy.DeployError):
            self.tool().execute("rollback", unknown)
        resource = self.root / "site/assets/main-one-ABCD1234.js"
        data = resource.read_bytes()
        for content in [None, b"corrupt"]:
            with self.subTest(content=content):
                resource.unlink()
                if content is not None:
                    resource.write_bytes(content)
                with self.assertRaises(deploy.DeployError):
                    self.tool().execute("rollback", first)
                self.assertEqual(self.index(), old)
                if resource.exists():
                    resource.unlink()
                resource.write_bytes(data)
        self.assert_active(second)

    def test_interrupted_acquisition_is_abortable_and_reusable(self):
        first, old = self.installed()
        second = self.artifact("two")
        for point in ["after_fetch", "after_export_file", "after_validation"]:
            with self.subTest(point=point):
                def crash(name):
                    if name == point:
                        raise Crash()
                with self.assertRaises(Crash):
                    self.tool(crash).execute("verify", second)
                self.assertEqual(self.index(), old)
                with self.assertRaisesRegex(deploy.DeployError, "recover first"):
                    self.tool().execute("install", second)
                self.assertFalse(self.status()["ready"])
                with self.assertRaisesRegex(deploy.DeployError, "recover first"):
                    self.tool().execute("verify", second)
                self.tool().execute("recover")
                self.assert_active(first)
        self.tool().execute("install", second)
        self.assert_active(second)

    def test_interrupted_switch_recovers_to_before_at_every_boundary(self):
        first, old = self.installed()
        second = self.artifact("two")
        self.tool().execute("verify", second)
        for point in ["after_resource", "before_index", "after_index", "after_current"]:
            with self.subTest(point=point):
                def crash(name):
                    if name == point:
                        raise Crash()
                with self.assertRaises(Crash):
                    self.tool(crash).execute("install", second)
                self.assertFalse(self.status()["ready"])
                result = self.tool().execute("recover")
                self.assertEqual(result["strategy"], "restore-before-state")
                self.assertEqual(self.index(), old)
                self.assert_active(first)
                new_asset = self.root / "site/assets/main-two-ABCD1234.js"
                if new_asset.exists():
                    new_asset.unlink()
        self.assertEqual(self.tool().execute("recover")["recovered"], [])

    def test_actual_sigkill_after_index_before_current(self):
        first, old = self.installed()
        second = self.artifact("two")
        code = """
import importlib.util, sys, os, signal, json
spec=importlib.util.spec_from_file_location('installer',sys.argv[1]);m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
def checkpoint(name):
    if name=='after_index':os.kill(os.getpid(),signal.SIGKILL)
m.Installer(sys.argv[2],transport=sys.argv[3],checkpoint=checkpoint).execute('install',m.Expected(**json.loads(sys.argv[4])))
"""
        p = subprocess.run([sys.executable, "-B", "-c", code, str(PROJECT / "scripts/deploy/install.py"),
                            str(self.root), str(self.remote), json.dumps(second.json())], capture_output=True)
        self.assertEqual(p.returncode, -signal.SIGKILL, p.stderr)
        self.assertNotEqual(self.index(), old)
        self.assertFalse(self.status()["consistent"])
        self.tool().execute("recover")
        self.assertEqual(self.index(), old)
        self.assert_active(first)

    def test_interrupted_first_install_and_undeploy_recover(self):
        first = self.artifact()
        def crash(name):
            if name == "after_index":
                raise Crash()
        with self.assertRaises(Crash):
            self.tool(crash).execute("install", first)
        self.assertIsNotNone(self.index())
        self.tool().execute("recover")
        self.assertIsNone(self.index())
        self.assert_active(None)
        self.tool().execute("install", first)
        old = self.index()
        with self.assertRaises(Crash):
            self.tool(crash).execute("rollback", undeploy=True)
        self.assertIsNone(self.index())
        self.tool().execute("recover")
        self.assertEqual(self.index(), old)
        self.assert_active(first)

    def test_status_read_only_and_unexplained_mismatch_refused(self):
        first, old = self.installed()
        def snapshot():
            return {p.relative_to(self.root).as_posix(): (p.read_bytes(), p.stat().st_mtime_ns)
                    for p in self.root.rglob("*") if p.is_file()}
        before = snapshot()
        self.assert_active(first)
        self.assertEqual(snapshot(), before)
        (self.root / "site/index.html").write_text("unknown active page")
        self.assertFalse(self.status()["consistent"])
        with self.assertRaises(deploy.DeployError):
            self.tool().execute("recover")
        self.assertEqual(self.index(), b"unknown active page")

    def test_recovery_failure_stays_pending_and_can_retry(self):
        first, old = self.installed()
        second = self.artifact("two")
        original = deploy.Installer.write_current
        def fail(*args):
            raise OSError("persistent state storage failure")
        with mock.patch.object(deploy.Installer, "write_current", fail), self.assertRaisesRegex(deploy.DeployError, "recovery incomplete"):
            self.tool().execute("install", second)
        self.assertEqual(self.index(), old)
        self.assertFalse(self.status()["ready"])
        self.tool().execute("recover")
        self.assert_active(first)

    def test_cli_root_and_expectations_are_mandatory(self):
        for args in [["verify"], ["verify", "--root", str(self.root), "--artifact-sha", "latest"],
                     ["rollback", "--root", str(self.root)], ["status", "--root", "relative"]]:
            p = subprocess.run([sys.executable, "-B", str(PROJECT / "scripts/deploy/install.py"), *args], capture_output=True)
            self.assertEqual(p.returncode, 2, p.stderr)
        self.assertFalse(self.root.exists())

    def test_root_swap_at_real_git_initialization_fetch_and_object_reads(self):
        expected = self.artifact()
        for point in ("during-init", "initialization", "fetch", "object"):
            with self.subTest(point=point):
                self.root = self.base / ("deployment-" + point)
                parked = self.base / ("parked-" + point)
                outside = self.base / ("outside-" + point)
                outside.mkdir()
                (outside / "marker").write_bytes(b"untouched")
                original_path = self.root
                tool = self.tool()
                original = tool.git
                moved = False
                def move_root():
                    nonlocal moved
                    original_path.rename(parked)
                    original_path.symlink_to(outside, target_is_directory=True)
                    moved = True
                def checkpoint(name):
                    if point == "during-init" and name == "during_repository_init":
                        move_root()
                tool.checkpoint = checkpoint
                def swap(*args):
                    selected = ((point == "initialization" and tool.git_path.startswith("staging/"))
                                or (point == "fetch" and args[0] == "fetch")
                                or (point == "object" and args[:2] == ("cat-file", "-t")))
                    if selected and not moved:
                        move_root()
                    return original(*args)  # REAL Git, including fetch and reads.
                tool.git = swap
                result = tool.execute("install", expected)
                self.assertTrue(moved)
                self.assertEqual(result["active"]["artifactSha"], expected.artifact)
                self.assertEqual(sorted(p.name for p in outside.iterdir()), ["marker"])
                self.assertEqual((outside / "marker").read_bytes(), b"untouched")
                self.assertFalse((outside / "repository.git").exists())
                self.root = parked
                self.assert_active(expected)

    def test_root_swap_while_real_git_fetch_is_running(self):
        expected = self.artifact()
        ready, go = self.base / "upload-ready", self.base / "upload-go"
        upload = self.base / "upload-pack"
        upload.write_text(
            f"#!{sys.executable}\nimport pathlib,os,sys,time\n"
            f"pathlib.Path({str(ready)!r}).write_text('ready')\n"
            "deadline=time.monotonic()+10\n"
            f"while not pathlib.Path({str(go)!r}).exists():\n"
            " if time.monotonic()>deadline:sys.exit(1)\n"
            " time.sleep(.02)\n"
            f"os.execv({shutil.which('git')!r},['git','upload-pack',*sys.argv[1:]])\n")
        upload.chmod(0o700)
        original_root = self.root
        parked, outside = self.base / "parked", self.base / "outside"
        outside.mkdir()
        tool = self.tool()
        original_git = tool.git
        def paused_fetch(*args):
            if args[0] == "fetch":
                return original_git("fetch", "--upload-pack=" + str(upload), *args[1:])
            return original_git(*args)
        tool.git = paused_fetch
        results, errors = [], []
        def run():
            try:
                results.append(tool.execute("verify", expected))
            except Exception as exc:
                errors.append(exc)
        worker = threading.Thread(target=run, daemon=True)
        worker.start()
        try:
            deadline = time.monotonic() + 10
            while not ready.exists() and worker.is_alive() and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertTrue(ready.exists(), errors)
            original_root.rename(parked)
            original_root.symlink_to(outside, target_is_directory=True)
        finally:
            go.write_text("go")
            worker.join(15)
        self.assertFalse(worker.is_alive(), "Git fetch did not finish")
        self.assertEqual(list(outside.iterdir()), [])
        self.assertTrue(results or errors)
        if errors:
            self.assertIsInstance(errors[0], (deploy.DeployError, OSError))
        else:
            self.assertEqual(results[0]["verified"], expected.artifact)
        self.root = parked
        self.assertIsNone(self.index())

    def test_git_ambient_environment_cannot_redirect_repository_or_temp(self):
        expected = self.artifact()
        outside = self.base / "outside"
        outside.mkdir()
        with mock.patch.dict(os.environ, {
            "GIT_DIR": str(outside), "GIT_COMMON_DIR": str(outside),
            "GIT_OBJECT_DIRECTORY": str(outside), "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "core.worktree", "GIT_CONFIG_VALUE_0": str(outside),
            "GIT_TRACE": str(outside / "trace"), "GIT_INDEX_FILE": str(outside / "index"),
            "TMPDIR": str(outside), "TMP": str(outside), "TEMP": str(outside),
        }):
            self.tool().execute("install", expected)
        self.assertEqual(list(outside.iterdir()), [])
        self.assert_active(expected)

    def test_original_malformed_terminal_record_cannot_be_ready(self):
        _, old = self.installed()
        record = {"schemaVersion": 1, "id": "f" * 32, "kind": "switch", "phase": "verified"}
        path = self.root / "records" / (record["id"] + ".json")
        data = json.dumps(record).encode()
        path.write_bytes(data)
        self.assertFalse(self.status()["ready"])
        self.assertEqual(path.read_bytes(), data)
        self.assertEqual(self.index(), old)

    def test_transaction_schema_rejects_damage_for_every_command(self):
        first, old = self.installed()
        records = [json.loads(p.read_bytes()) for p in (self.root / "records").glob("*.json")]
        acquisition = next(r for r in records if r["kind"] == "acquire")
        switching = next(r for r in records if r["kind"] == "switch")
        cases = []
        def case(label, source, change):
            record = copy.deepcopy(source)
            record["id"] = "f" * 32
            change(record)
            cases.append((label, record))
        case("switch-fetch-phase", switching, lambda r: r.update(phase="fetching"))
        case("acquire-switch-phase", acquisition, lambda r: r.update(phase="prepared"))
        case("switch-verified-terminal", switching, lambda r: r.update(phase="verified"))
        case("acquire-committed-terminal", acquisition, lambda r: r.update(phase="committed"))
        for key in ("before", "target", "action"):
            case("missing-" + key, switching, lambda r, k=key: r.pop(k))
        for key in ("expected", "createdAt", "updatedAt"):
            case("missing-" + key, acquisition, lambda r, k=key: r.pop(k))
        case("missing-version", acquisition, lambda r: r["expected"].pop("artifact"))
        case("wrong-expectation-type", acquisition, lambda r: r.update(expected=[]))
        case("wrong-source-type", acquisition, lambda r: r["expected"].update(source=None))
        case("short-artifact", acquisition, lambda r: r["expected"].update(artifact="abcd"))
        case("wrong-pointer-type", switching, lambda r: r.update(target=[]))
        case("missing-pointer-hash", switching, lambda r: r["target"].pop("indexSha256"))
        case("invalid-pointer-hash", switching, lambda r: r["target"].update(indexSha256="0"))
        case("wrong-action", switching, lambda r: r.update(action="undeploy"))
        case("wrong-phase-type", acquisition, lambda r: r.update(phase=[]))
        case("boolean-schema", acquisition, lambda r: r.update(schemaVersion=True))
        case("non-utc-time", acquisition, lambda r: r.update(updatedAt="2026-11-02T12:00:00"))
        case("wrong-time-type", acquisition, lambda r: r.update(updatedAt=123))
        case("unknown-field", acquisition, lambda r: r.update(unrecognized=True))
        candidate = self.root / "records" / ("f" * 32 + ".json")
        for label, record in cases:
            with self.subTest(label=label):
                data = json.dumps(record).encode()
                candidate.write_bytes(data)
                self.assertFalse(self.status()["ready"])
                for command in ("verify", "install", "rollback", "recover"):
                    with self.subTest(command=command), self.assertRaises(deploy.DeployError):
                        self.tool().execute(command, first if command != "recover" else None)
                    self.assertEqual(self.index(), old)
                    self.assertEqual(candidate.read_bytes(), data)
                with self.assertRaises(deploy.DeployError):
                    self.tool().execute("rollback", undeploy=True)
                candidate.unlink()  # Only this test's corrupt fixture.
        self.assert_active(first)

    def test_valid_transaction_phases_and_legacy_generated_records(self):
        first, _ = self.installed()
        records = [json.loads(p.read_bytes()) for p in (self.root / "records").glob("*.json")]
        for record in records:
            phases = deploy.ACQUIRE_PHASES if record["kind"] == "acquire" else deploy.SWITCH_PHASES
            for phase in phases:
                with self.subTest(kind=record["kind"], phase=phase):
                    sample = {**record, "phase": phase}
                    deploy.validate_record(sample)
        self.assert_active(first)

    def test_initialization_interruptions_recover_and_retry_without_cleanup(self):
        expected = self.artifact()
        for point in ("during_repository_init", "before_repository_publish", "after_repository_publish"):
            with self.subTest(point=point):
                self.root = self.base / ("deployment-" + point)
                def crash(name):
                    if name == point:
                        raise Crash()
                with self.assertRaises(Crash):
                    self.tool(crash).execute("verify", expected)
                before = {p.relative_to(self.root).as_posix(): p.read_bytes()
                          for p in (self.root / "staging").rglob("*") if p.is_file()}
                self.assertFalse(self.status()["ready"])
                with self.assertRaisesRegex(deploy.DeployError, "recover first"):
                    self.tool().execute("verify", expected)
                self.tool().execute("recover")
                for path, data in before.items():
                    self.assertEqual((self.root / path).read_bytes(), data)
                self.assertIsNone(self.index())
                self.tool().execute("install", expected)
                self.assert_active(expected)

    def test_valid_bare_store_is_reused_without_reinitialization(self):
        first, _ = self.installed()
        repo = self.root / "repository.git"
        before = {n: ((repo / n).read_bytes(), (repo / n).stat().st_ino) for n in ("config", "HEAD")}
        second = self.artifact("two")
        def fail_init(name):
            if name in {"during_repository_init", "before_repository_publish"}:
                raise AssertionError("valid repository must not be initialized again")
        self.tool(fail_init).execute("install", second)
        for name, snapshot in before.items():
            self.assertEqual(((repo / name).read_bytes(), (repo / name).stat().st_ino), snapshot)
        self.assert_active(second)

    def test_repository_publication_never_overwrites_an_existing_store(self):
        expected = self.artifact()
        saved = None
        def contender(name):
            nonlocal saved
            if name == "before_repository_publish":
                git(self.root, "init", "--bare", "--template=", "--initial-branch=unused",
                    str(self.root / "repository.git"))
                config = self.root / "repository.git/config"
                saved = (config.read_bytes(), config.stat().st_ino)
        with self.assertRaisesRegex(deploy.DeployError, "Destination exists"):
            self.tool(contender).execute("verify", expected)
        config = self.root / "repository.git/config"
        self.assertEqual((config.read_bytes(), config.stat().st_ino), saved)
        self.assertIsNone(self.index())
        self.tool().execute("install", expected)
        self.assertEqual((config.read_bytes(), config.stat().st_ino), saved)
        self.assert_active(expected)

    def test_original_partial_formal_bare_is_not_misreported_as_recovered(self):
        expected = self.artifact()
        def crash(name):
            if name == "during_repository_init":
                raise Crash()
        with self.assertRaises(Crash):
            self.tool(crash).execute("verify", expected)
        # Reproduce the OLD installer's unowned/ambiguous formal residue.
        repo = self.root / "repository.git"
        repo.mkdir(mode=0o750)
        (repo / "unknown").write_bytes(b"preserve this evidence")
        self.assertFalse(self.status()["ready"])
        for command in ("recover", "verify", "install"):
            with self.subTest(command=command), self.assertRaises(deploy.DeployError):
                self.tool().execute(command, expected if command != "recover" else None)
            self.assertEqual((repo / "unknown").read_bytes(), b"preserve this evidence")
            self.assertEqual(sorted(p.name for p in repo.iterdir()), ["unknown"])
        self.assertIsNone(self.index())

    def test_real_git_child_sigkill_leaves_lock_and_requires_manual_investigation(self):
        first, old = self.installed()
        second = self.artifact("two")
        tool = self.tool()
        original = tool.git
        child_code = None
        def interrupt_fetch(*args):
            nonlocal child_code
            result = original(*args)
            if args[0] == "fetch":
                child = subprocess.Popen(["git", "--git-dir=" + str(self.root / "repository.git"),
                                          "update-ref", "--stdin"], stdin=subprocess.PIPE,
                                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    child.stdin.write(f"start\nupdate refs/penumbra/interrupted {second.artifact}\nprepare\n")
                    child.stdin.flush()
                    output = b""
                    deadline = time.monotonic() + 5
                    while b"prepare: ok\n" not in output:
                        remaining = deadline - time.monotonic()
                        self.assertGreater(remaining, 0, "Git did not prepare its lock transaction")
                        self.assertTrue(select.select([child.stdout], [], [], remaining)[0])
                        part = os.read(child.stdout.fileno(), 4096)
                        self.assertTrue(part, "Git exited before preparing refs")
                        output += part
                    self.assertIn(b"start: ok\n", output)
                    child.kill()
                    child.communicate(timeout=5)
                    child_code = child.returncode
                finally:
                    if child.poll() is None:
                        child.kill()
                        child.communicate(timeout=5)
                raise Crash()
            return result
        tool.git = interrupt_fetch
        with self.assertRaises(Crash):
            tool.execute("install", second)
        self.assertEqual(child_code, -signal.SIGKILL)
        locks = list((self.root / "repository.git").rglob("*.lock"))
        self.assertTrue(locks)
        self.assertFalse(self.status()["ready"])
        with self.assertRaisesRegex(deploy.DeployError, "manual investigation"):
            self.tool().execute("recover")
        self.assertEqual(self.index(), old)
        self.assertTrue(all(p.exists() for p in locks))


if __name__ == "__main__":
    unittest.main()
