"""Isolated coordinator tests. Git and subprocesses are real; SSH and gh are fixtures."""

import base64
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts" / "deploy"
sys.path.insert(0, str(SCRIPTS))
import release

ARTIFACT = "a" * 40
BUILD = "actions-123-1"
DIST = "c" * 64
SECRET = "synthetic-secret-do-not-print"
API = release.API
RUN = f"{API}/actions/runs/123/attempts/1"
RUNS = f"{API}/actions/workflows/45/runs"
DISPATCH = f"{API}/actions/workflows/45/dispatches"
STEP_LOG = f"{API}/actions/jobs/67/steps/9/logs"
JOB_LOG = f"{API}/actions/jobs/67/logs"


def receipt(source):
    return (f"Published {BUILD}\n\n- Source SHA: `{source}`\n- Workflow SHA: `{source}`\n"
            f"- Artifact commit (deploy): `{ARTIFACT}`\n- Static files: 12; bytes: 340\n- Dist SHA-256: `{DIST}`\n")


def http(status, body=b"", *, length=None):
    # gh prints the status with LF, and headers with CRLF.
    return f"HTTP/2 {status}\nContent-Length: {len(body) if length is None else length}\r\n\r\n".encode() + body


class FlowTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="penumbra release tests ")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        git = shutil.which("git")
        self.assertIsNotNone(git)
        self.git = str(Path(git).resolve())
        self.git_run("init", "-q", "-b", "main")
        (self.root / "file.txt").write_text("fixture\n")
        self.git_run("add", "file.txt")
        self.git_run("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false",
                     "-c", "core.hooksPath=" + str(self.root / "no-hooks"), "commit", "-qm", "test fixture")
        self.source = self.git_run("rev-parse", "HEAD")
        self.git_run("remote", "add", "origin", f"https://github.com/{release.REPO}.git")
        self.git_run("update-ref", "refs/remotes/origin/main", self.source)
        self.tools = self.root / "scripts" / "deploy"
        self.tools.mkdir(parents=True)
        for name in ("install.py", "release_remote.py"):
            shutil.copyfile(SCRIPTS / name, self.tools / name)
        self.git_run("add", "scripts")
        self.git_run("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false",
                     "-c", "core.hooksPath=" + str(self.root / "no-hooks"), "commit", "-qm", "tools")
        self.source = self.git_run("rev-parse", "HEAD")
        self.git_run("update-ref", "refs/remotes/origin/main", self.source)
        self.active = {"artifactSha": "b" * 40, "sourceSha": "d" * 40, "workflowSha": "d" * 40,
                       "buildId": "actions-99-1", "indexSha256": "e" * 64}
        self.calls = []
        self.reuse = self.ci_failure = self.mismatch = self.bad_status = self.interrupt = False
        self.dispatch_issue = self.deploy_issue = self.status_issue = self.log_issue = None
        self.step_status = 200
        self.run_overrides = {}
        self.network_failures = 0

    def git_run(self, *args):
        return subprocess.check_output([self.git, "-C", str(self.root), *args]).decode().strip()

    def dispatch_fake(self, argv, **kwargs):
        if argv[0] == self.git:
            return self.real_command(argv, **kwargs)
        if argv[0] == "ssh-fixture":
            self.assertIn("StrictHostKeyChecking=yes", argv)
            self.assertTrue(kwargs["keep_stdin"])
            request = json.loads(kwargs["data"])
            self.assertNotIn(SECRET, repr((argv, kwargs.get("env"), request)))
            action = request["action"]
            self.calls.append(action)
            services = {name: {"active": True, "pid": 22, "restarts": 0, "startMonotonic": 91}
                        for name in ("aion-chat.service", "cloudflared.service", "trojan.service")}
            target = {"artifactSha": ARTIFACT, "sourceSha": self.source, "workflowSha": self.source,
                      "buildId": BUILD, "indexSha256": "f" * 64}
            active = target if action == "status" and self.status_issue == "new-active" else self.active
            state = {"active": active, "consistent": not self.bad_status, "ready": not self.bad_status, "pending": [],
                     "actualIndexSha256": active["indexSha256"]}
            report = {"version": 1, "ok": not self.bad_status, "before": state, "servicesBefore": services, "secret": SECRET}
            if action == "status" and "deploy" in self.calls:
                self.assertEqual(kwargs["timeout"], 360)
                if self.status_issue == "timeout":
                    raise TimeoutError
                if self.status_issue == "incomplete":
                    del state["actualIndexSha256"]
            if action == "deploy":
                if self.interrupt:
                    raise release.Interrupted
                chosen = request["release"]
                self.assertEqual(chosen["previousActive"], self.active)
                self.assertEqual(release.identity(chosen), {"artifactSha": ARTIFACT, "sourceSha": self.source,
                    "workflowSha": self.source, "buildId": BUILD})
                report.update(after={**state, "active": target, "actualIndexSha256": target["indexSha256"]},
                              servicesAfter=services, proxyChecked=True, proxyCleaned=True,
                              installResult="committed", installState="acknowledged", operationId="a" * 32)
                if self.deploy_issue in ("disconnected", "broken-json"):
                    return (255 if self.deploy_issue == "disconnected" else 2), b"{invalid" + SECRET.encode(), b""
                if self.deploy_issue in ("known-failure", "missing-after", "partial-after", "internal"):
                    report.update(ok=False, error="internal" if self.deploy_issue == "internal" else "install",
                                  installState="unknown" if self.deploy_issue == "internal" else "refused")
                    del report["installResult"], report["operationId"]
                    report["after"] = state.copy()
                    if self.deploy_issue in ("missing-after", "internal"):
                        del report["after"]
                    if self.deploy_issue == "partial-after":
                        del report["after"]["actualIndexSha256"]
                if self.deploy_issue == "partial-success":
                    del report["after"]["actualIndexSha256"]
                if self.deploy_issue == "post-check-failed":
                    report["proxyCleaned"] = False
            if self.bad_status:
                report.update(error="status")
            return (0 if report["ok"] else 2), json.dumps(report).encode(), SECRET.encode()
        self.assertEqual(argv[0], "gh-fixture")
        if argv[1:3] == ["auth", "status"]:
            return 0, b"", SECRET.encode()
        endpoint = argv[argv.index("Accept: application/vnd.github+json") + 1]
        self.calls.append(endpoint)
        version = "2022-11-28" if endpoint == DISPATCH else "2026-03-10"
        expected = ["gh-fixture", "api", "--hostname", "github.com", "-H", f"X-GitHub-Api-Version: {version}",
                    "-H", "Accept: application/vnd.github+json", endpoint]
        if endpoint in (DISPATCH, STEP_LOG, JOB_LOG):
            expected.append("--include")
        if endpoint == JOB_LOG and self.log_issue == "escaped" and self.calls.count(JOB_LOG) == 2:
            expected.append("--allow-escape-sequences")
        if endpoint == DISPATCH:
            expected += ["--method", "POST", "--input", "-"]
        self.assertEqual(argv, expected)
        self.assertEqual(kwargs["timeout"], 30)
        if endpoint != DISPATCH:
            self.assertEqual(kwargs["data"], b"")
        run = {"id": 123, "run_attempt": 1, "run_number": 5, "workflow_id": 45, "event": "workflow_dispatch",
               "head_branch": "main", "head_sha": self.source, "head_repository": {"full_name": release.REPO},
               "display_title": f"Publish source {self.source} (run 5)", "status": "completed",
               "conclusion": "failure" if self.ci_failure else "success"}
        if endpoint == f"{API}/git/ref/heads/main":
            result = {"object": {"sha": self.source}}
        elif endpoint == f"{API}/actions/workflows/deploy.yml":
            result = {"id": 45, "path": release.WORKFLOW, "state": "active"}
        elif endpoint.startswith(RUNS + "?"):
            result = {"total_count": int(self.reuse), "workflow_runs": [run] if self.reuse else []}
        elif endpoint == DISPATCH:
            payload = json.loads(kwargs["data"])
            self.assertEqual(payload, {"ref": "main", "inputs": {"source_sha": self.source}, "return_run_details": True})
            self.assertIs(payload["return_run_details"], True)
            if self.dispatch_issue == "timeout":
                raise TimeoutError
            if self.dispatch_issue == "no-response":
                return 0, b"", b""
            if self.dispatch_issue == "204":
                return 0, http(204), b""
            if self.dispatch_issue == "200-empty":
                return 0, http(200), b""
            result = {"workflow_run_id": 123, "html_url": f"https://github.com/{release.REPO}/actions/runs/123",
                      "run_url": f"https://api.github.com/{API}/actions/runs/123"}
            if self.dispatch_issue == "missing-id":
                del result["workflow_run_id"]
            if self.dispatch_issue == "bad-url":
                result["html_url"] = "https://invalid.example/" + SECRET
            if self.dispatch_issue == "bad-api-url":
                result["run_url"] = f"https://api.github.com/{API}/actions/runs/124"
            if self.dispatch_issue == "bool-id":
                result["workflow_run_id"] = True
            return 0, http(201 if self.dispatch_issue == "wrong-status" else 200, json.dumps(result).encode()), b""
        elif endpoint == RUN:
            if self.network_failures:
                self.network_failures -= 1
                return 1, b"", b"error (HTTP 503) " + SECRET.encode()
            result = {**run, **self.run_overrides}
        elif endpoint == RUN + "/jobs?per_page=100":
            result = {"total_count": 1, "jobs": [{"name": "publish", "conclusion": "success", "run_id": 123, "id": 67,
                       "steps": [{"name": "Set up job", "conclusion": "success", "number": 1},
                                 {"name": "Reverify and append release to deploy branch", "conclusion": "success", "number": 9}]}]}
        elif endpoint in (STEP_LOG, JOB_LOG):
            self.assertEqual(kwargs["output_limit"], 4 * 1024 * 1024)
            if endpoint == STEP_LOG and self.step_status != 200:
                return 1, http(self.step_status, SECRET.encode()), b"gh: request failed (HTTP 404)"
            text = receipt(self.source)
            if endpoint == JOB_LOG:
                text = f"setup {SECRET}\n{text}post job cleanup\n"
            if endpoint == JOB_LOG and self.log_issue == "escaped":
                if "--allow-escape-sequences" not in argv:
                    return 1, http(200), (b"the response contains terminal escape sequences; "
                                          b"pass --allow-escape-sequences to output it anyway\n")
                text = "\x1b[36;1msetup\x1b[0m\n" + text
            if self.log_issue == "duplicate":
                text += receipt(self.source)
            if self.log_issue == "conflict":
                text += receipt(self.source).replace(BUILD, "actions-999-1")
            if self.log_issue == "wrong-source":
                text = text.replace(self.source, "e" * 40)
            if self.log_issue == "http-failure":
                return 1, http(403), SECRET.encode()
            if self.log_issue == "missing":
                text = SECRET + "\n"
            log = "".join("2026-11-10T01:02:03.1234567Z " + line + "\r\n" for line in text.splitlines()).encode()
            if self.log_issue == "truncated-line":
                log = log.rstrip()
            length = len(log) + 10 if self.log_issue == "truncated-download" else None
            return 0, http(206 if self.log_issue == "partial-http" else 200, log, length=length), SECRET.encode()
        elif endpoint == f"{API}/contents/release.json?ref={ARTIFACT}":
            metadata = {"schemaVersion": 1, "repository": release.REPO, "sourceSha": self.source,
                        "workflowSha": "e" * 40 if self.mismatch else self.source, "buildId": BUILD,
                        "runId": "123", "runNumber": "5", "runAttempt": "1", "fileCount": 12, "sizeBytes": 340,
                        "distSha256": DIST, "runUrl": f"https://github.com/{release.REPO}/actions/runs/123", "basePath": "/penumbra/"}
            result = {"encoding": "base64", "path": "release.json", "type": "file",
                      "content": base64.encodebytes(json.dumps(metadata).encode()).decode()}
        elif endpoint == f"{API}/git/ref/heads/deploy":
            result = {"object": {"sha": "f" * 40}}
        elif endpoint == f"{API}/compare/{ARTIFACT}...{'f' * 40}":
            result = {"merge_base_commit": {"sha": ARTIFACT}}
        else:
            self.fail("Unexpected fixture request " + endpoint)
        return 0, json.dumps(result).encode(), SECRET.encode()

    def invoke(self, *args):
        out, err = io.StringIO(), io.StringIO()
        self.real_command = release.command
        fixture_errors = []

        def checked_fixture(*argv, **kwargs):
            try:
                return self.dispatch_fake(*argv, **kwargs)
            except AssertionError as exc:
                fixture_errors.append(exc)
                raise

        with patch.object(release, "HERE", self.tools), patch.object(release, "command", checked_fixture), \
             patch.object(release, "executable", lambda name: self.git if name == "git" else name + "-fixture"), \
             patch.object(release.time, "sleep"), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = release.main(args)
        if fixture_errors:
            raise fixture_errors[0]
        self.assertNotIn(SECRET, out.getvalue() + err.getvalue())
        return rc, json.loads(out.getvalue())

    def test_dispatch_and_confirm(self):
        self.network_failures = 2
        rc, report = self.invoke("deploy")
        self.assertEqual(rc, 0, report)
        self.assertEqual(report["actions"]["selection"], "dispatched")
        self.assertEqual(self.calls.count(RUN), 3)
        self.assertTrue(report["deployment"]["proxyCleaned"])
        self.assertTrue(report["deployment"]["after"]["activeResourcesVerified"])
        self.assertEqual(report["deploymentOutcome"], "confirmed-success")
        self.assertTrue(report["productionStateConfirmed"])
        self.assertIn(STEP_LOG, self.calls)
        self.assertNotIn(JOB_LOG, self.calls)

    def test_existing_release_reused(self):
        self.reuse = True
        rc, report = self.invoke("deploy")
        self.assertEqual(rc, 0, report)
        self.assertEqual(report["actions"]["selection"], "reused")
        self.assertFalse(any(x.endswith("/dispatches") for x in self.calls))

    def test_actions_failure(self):
        self.ci_failure = True
        rc, report = self.invoke("deploy")
        self.assertEqual(rc, 2)
        self.assertIn("did not succeed", report["error"])
        self.assertNotIn("deploy", self.calls)

    def test_dirty_git_checkout(self):
        (self.root / "untracked").touch()
        rc, report = self.invoke("deploy")
        self.assertEqual(rc, 2)
        self.assertFalse(report["git"]["clean"])
        self.assertEqual(self.calls, [])

    def test_identity_mismatch(self):
        self.mismatch = True
        rc, report = self.invoke("deploy")
        self.assertEqual(rc, 2)
        self.assertIn("metadata does not match", report["error"])
        self.assertNotIn("deploy", self.calls)

    def test_status_inconsistent(self):
        self.bad_status = True
        rc, report = self.invoke("status")
        self.assertEqual(rc, 2)
        self.assertFalse(report["status"]["before"]["consistent"])
        self.assertEqual(self.calls, ["status"])

    def test_interruption_runs_read_only_status_once(self):
        self.interrupt = True
        rc, report = self.invoke("deploy")
        self.assertEqual(rc, 130)
        self.assertEqual(self.calls[-2:], ["deploy", "status"])
        self.assertEqual(report["deploymentOutcome"], "unknown-result-status-obtained")
        self.assertTrue(report["productionStateConfirmed"])

    def test_dry_run_leaves_dispatch_and_install_untouched(self):
        rc, report = self.invoke("deploy", "--dry-run")
        self.assertEqual(rc, 0, report)
        self.assertIn("dispatch", report["plan"])
        self.assertNotIn("deploy", self.calls)
        self.assertFalse(any(x.endswith("/dispatches") for x in self.calls))

    def test_unknown_dispatch_response_is_not_retried_or_inferred(self):
        for issue in ("204", "200-empty", "no-response", "missing-id", "bool-id", "bad-url", "bad-api-url",
                      "wrong-status", "timeout"):
            with self.subTest(issue=issue):
                self.calls.clear()
                self.dispatch_issue = issue
                rc, report = self.invoke("deploy")
                self.assertEqual(rc, 2, report)
                self.assertIn("outcome unknown", report["error"])
                self.assertEqual(report["actions"]["selection"], "dispatch-outcome-unknown")
                self.assertEqual(self.calls.count(DISPATCH), 1)
                self.assertEqual(self.calls[-1], DISPATCH)

    def test_pinned_run_identity_is_checked_after_dispatch(self):
        for key, bad in (("id", 124), ("workflow_id", 46), ("run_attempt", True), ("run_attempt", 2),
                         ("head_branch", "other"), ("head_sha", "e" * 40), ("display_title", "different source")):
            with self.subTest(key=key, bad=bad):
                self.calls.clear()
                self.run_overrides = {key: bad}
                rc, report = self.invoke("deploy")
                self.assertEqual(rc, 2, report)
                self.assertIn("does not match", report["error"])
                self.assertEqual(self.calls.count(DISPATCH), 1)
                self.assertEqual(self.calls[-1], RUN)

    def test_step_404_falls_back_to_pinned_job(self):
        self.step_status = 404
        rc, report = self.invoke("deploy")
        self.assertEqual(rc, 0, report)
        self.assertEqual(self.calls[self.calls.index(STEP_LOG) + 1], JOB_LOG)
        self.assertEqual(report["release"]["artifactSha"], ARTIFACT)

    def test_gh_escape_guard_retries_same_log_into_private_pipes(self):
        self.step_status = 404
        self.log_issue = "escaped"
        rc, report = self.invoke("deploy")
        self.assertEqual(rc, 0, report)
        self.assertEqual(self.calls.count(JOB_LOG), 2)
        self.assertNotIn("\x1b", str(report))

    def test_step_access_denied_does_not_fall_back_even_with_404_in_stderr(self):
        self.step_status = 403
        rc, report = self.invoke("deploy")
        self.assertEqual(rc, 2, report)
        self.assertIn("log download failed", report["error"])
        self.assertNotIn(JOB_LOG, self.calls)
        self.assertNotIn("deploy", self.calls)

    def test_invalid_step_log_does_not_fall_back(self):
        self.log_issue = "missing"
        rc, report = self.invoke("deploy")
        self.assertEqual(rc, 2, report)
        self.assertIn("publish receipt", report["error"])
        self.assertNotIn(JOB_LOG, self.calls)
        self.assertNotIn("deploy", self.calls)

    def test_bad_job_fallback_cannot_authorize_deployment(self):
        self.step_status = 404
        for issue in ("http-failure", "missing", "duplicate", "conflict", "wrong-source", "truncated-line",
                      "truncated-download", "partial-http"):
            with self.subTest(issue=issue):
                self.calls.clear()
                self.log_issue = issue
                rc, report = self.invoke("deploy")
                self.assertEqual(rc, 2, report)
                self.assertEqual(self.calls[-1], JOB_LOG)
                self.assertNotIn("deploy", self.calls)

    def test_complete_failure_snapshot_needs_no_second_status(self):
        self.deploy_issue = "known-failure"
        rc, report = self.invoke("deploy")
        self.assertEqual(rc, 2, report)
        self.assertEqual(self.calls[-1], "deploy")
        self.assertEqual(report["deployment"]["error"], "install")
        self.assertEqual(report["deploymentOutcome"], "failed-state-confirmed")
        self.assertNotIn("statusAfterUncertainExit", report)

    def test_helper_failure_or_partial_success_reconciles_without_erasing_classification(self):
        for issue in ("missing-after", "partial-after", "internal", "partial-success"):
            with self.subTest(issue=issue):
                self.calls.clear()
                self.deploy_issue = issue
                rc, report = self.invoke("deploy")
                self.assertEqual(rc, 2, report)
                self.assertEqual(self.calls[-2:], ["deploy", "status"])
                self.assertEqual(self.calls.count("status"), 1)
                if issue != "partial-success":
                    self.assertEqual(report["deployment"]["error"], "internal" if issue == "internal" else "install")
                self.assertEqual(report["deploymentOutcome"], "unknown-result-status-obtained" if issue == "internal"
                                 else "failed-state-confirmed")

    def test_active_target_in_followup_does_not_turn_unknown_install_into_success(self):
        self.status_issue = "new-active"
        for issue in ("broken-json", "disconnected"):
            with self.subTest(issue=issue):
                self.calls.clear()
                self.deploy_issue = issue
                rc, report = self.invoke("deploy")
                self.assertEqual(rc, 2, report)
                self.assertFalse(report["ok"])
                self.assertEqual(report["deploymentOutcome"], "unknown-result-status-obtained")
                self.assertEqual(report["statusAfterUncertainExit"]["before"]["active"]["artifactSha"], ARTIFACT)
                self.assertEqual(self.calls[-2:], ["deploy", "status"])

    def test_followup_failure_or_incomplete_snapshot_keeps_state_unknown(self):
        self.deploy_issue = "disconnected"
        for issue in ("timeout", "incomplete"):
            with self.subTest(issue=issue):
                self.calls.clear()
                self.status_issue = issue
                rc, report = self.invoke("deploy")
                self.assertEqual(rc, 2, report)
                self.assertEqual(report["deploymentOutcome"], "unknown-result-state-unknown")
                self.assertFalse(report["productionStateConfirmed"])
                self.assertEqual(self.calls[-2:], ["deploy", "status"])

    def test_failed_cleanup_is_not_success_even_with_complete_after_snapshot(self):
        self.deploy_issue = "post-check-failed"
        rc, report = self.invoke("deploy")
        self.assertEqual(rc, 2, report)
        self.assertTrue(report["productionStateConfirmed"])
        self.assertEqual(report["deploymentOutcome"], "failed-state-confirmed")
        self.assertFalse(report["deployment"]["proxyCleaned"])

    def test_duplicate_publish_receipt_is_rejected(self):
        log = receipt(self.source) * 2
        with self.assertRaisesRegex(release.Refused, "ambiguous"):
            release.parse_receipt(log.encode(), self.source, BUILD)


class ProcessTests(unittest.TestCase):
    def test_real_subprocess_output_limit_refuses_partial_bytes(self):
        with self.assertRaisesRegex(release.Refused, "output exceeded limit"):
            release.command([sys.executable, "-c", "print('a' * 2048)"], output_limit=1024)

    def test_tool_hash_is_independent_of_checkout_newlines(self):
        with tempfile.TemporaryDirectory() as directory:
            tool = Path(directory) / "install.py"
            tool.write_bytes(b"import sys\r\nprint(sys.version)\r\n")
            windows_hash = release.Remote.source_hash(tool)
            tool.write_bytes(b"import sys\nprint(sys.version)\n")
            self.assertEqual(release.Remote.source_hash(tool), windows_hash)

    def test_real_binary_pipes_and_input(self):
        code = "import sys; d=sys.stdin.buffer.read(); sys.stdout.buffer.write(d); sys.stderr.write('separate')"
        rc, out, err = release.command([sys.executable, "-c", code], data=b"sample\x00\x01\n")
        self.assertEqual((rc, out, err), (0, b"sample\x00\x01\n", b"separate"))

    def test_real_ssh_like_child_exits_while_input_stays_open(self):
        code = "import sys; sys.stdout.buffer.write(sys.stdin.buffer.readline())"
        result = release.command([sys.executable, "-c", code], data=b"request\n", keep_stdin=True, timeout=5)
        self.assertEqual(result, (0, b"request\n", b""))

    def test_timeout_kills_real_descendant(self):
        with tempfile.TemporaryDirectory() as directory:
            started, escaped = (Path(directory) / name for name in ("started", "escaped"))
            child = "import sys,time,pathlib; pathlib.Path(sys.argv[1]).touch(); time.sleep(4); pathlib.Path(sys.argv[2]).touch()"
            parent = "import sys,subprocess,time; subprocess.Popen([sys.executable,'-c',*sys.argv[1:]]); time.sleep(60)"
            with self.assertRaises(TimeoutError):
                release.command([sys.executable, "-c", parent, child, str(started), str(escaped)], timeout=3)
            self.assertTrue(started.exists())
            time.sleep(1.5)
            self.assertFalse(escaped.exists())

    @unittest.skipIf(os.name == "nt", "POSIX signal injection; Windows uses its Job Object test")
    def test_interrupted_ssh_like_process_gets_eof(self):
        with tempfile.TemporaryDirectory() as directory:
            ack = Path(directory) / "cleanup"
            code = "import sys,pathlib; sys.stdin.buffer.readline(); sys.stdin.buffer.read(); pathlib.Path(sys.argv[1]).touch()"
            with release.interrupts(release.interrupted):
                import threading
                timer = threading.Timer(.4, os.kill, (os.getpid(), signal.SIGTERM))
                timer.start()
                try:
                    with self.assertRaises(release.Interrupted):
                        release.command([sys.executable, "-c", code, str(ack)], data=b"request\n", keep_stdin=True)
                finally:
                    timer.cancel()
            self.assertTrue(ack.exists())


if __name__ == "__main__":
    unittest.main()
