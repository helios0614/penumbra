"""Offline Ubuntu helper tests, with real Linux listeners and supervised children."""

import contextlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import io
import json
import os
from pathlib import Path
import select
import shutil
import socket
import socketserver
import ssl
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

if os.name == "nt":
    raise unittest.SkipTest("Ubuntu helper uses POSIX APIs")
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "deploy"))
import release_remote as remote
import release

SECRET = "fake-trojan-password-do-not-emit"
POLICY = {"host": "fixture.invalid", "port": 443, "sni": "fixture.invalid", "password": SECRET,
          "alpn": ["http/1.1"], "expectedEgressIp": "8.8.4.4"}
PIN = {"artifactSha": "a" * 40, "sourceSha": "b" * 40, "workflowSha": "b" * 40, "buildId": "actions-123-1"}
ACTIVE = {**PIN, "indexSha256": "c" * 64}
PREVIOUS = {**ACTIVE, "artifactSha": "d" * 40}
RELEASE = {**PIN, "fileCount": 2, "sizeBytes": 1234, "distSha256": "a" * 64, "previousActive": PREVIOUS}
REQUEST = {"version": 1, "action": "deploy", "helperSha256": "a" * 64, "installerSha256": "b" * 64, "release": RELEASE}
READY = {"ready": True, "consistent": True, "pending": [], "active": PREVIOUS}
STATES = {name: {"active": True, "pid": 2} for name in remote.SERVICES}
PORT = 55001
TRACE_BODY = b"h=www.cloudflare.com\nip=8.8.4.4\n"
GIT_BODY = b"001e# service=git-upload-pack\n0000"


def response(body, *, peer_port=PORT, tls=0, http=200):
    return body + remote.MARKER + f"{http} {tls} 127.0.0.1 {peer_port}\n".encode()


class ProbeTests(unittest.TestCase):
    def test_empty_or_bad_curl_output_blocks(self):
        for data in (b"", b"{\"password\":\"" + SECRET.encode() + b"\"}", response(b""),
                     response(TRACE_BODY).replace(b"127.0.0.1", b"::1")):
            with self.subTest(data=data[:6]), self.assertRaisesRegex(remote.Refused, "probe-format"):
                remote.probe_response(0, data, PORT)

    def test_tls_errors_are_never_retried(self):
        for rc, output in ((60, b""), (35, b""), (0, response(TRACE_BODY, tls=62))):
            with self.subTest(rc=rc), self.assertRaisesRegex(remote.Refused, "probe-tls"):
                remote.probe_response(rc, output, PORT)

    def test_exit_not_proven_for_wrong_listener(self):
        with self.assertRaisesRegex(remote.Refused, "proxy-exit"):
            remote.probe_response(0, response(TRACE_BODY, peer_port=PORT + 1), PORT)

    def test_probes_retry_transient_http_and_verify_exit_and_git(self):
        class ProbeSession:
            def __init__(inner):
                inner.results = iter([(28, b""), (0, response(TRACE_BODY, http=503)),
                                      (0, response(TRACE_BODY)), (0, response(GIT_BODY))])

            def command(inner, argv, *, env, **kwargs):
                self.assertEqual(argv[1], "-q")
                self.assertEqual(argv[argv.index("--noproxy") + 1], "")
                self.assertEqual(argv[argv.index("--cacert") + 1], remote.CA)
                self.assertEqual(env["https_proxy"], f"socks5h://127.0.0.1:{PORT}")
                self.assertEqual(env["NO_PROXY"], "")
                self.assertNotIn(SECRET, repr((argv, env)))
                rc, data = next(inner.results)
                return rc, data, b""

        with patch.object(remote, "owned_listener", return_value=True), patch.object(remote.time, "sleep"):
            remote.probe(ProbeSession(), object(), PORT, POLICY)
            with self.assertRaisesRegex(remote.Refused, "proxy-exit"):
                remote.probe(ProbeSession(), object(), PORT, {**POLICY, "expectedEgressIp": "1.1.1.1"})

    def test_private_policy_mode_and_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "proxy.json"
            config.write_text(json.dumps(POLICY))
            with patch.object(remote, "POLICY", config):
                config.chmod(0o644)
                with self.assertRaisesRegex(remote.Refused, "proxy-policy"), remote.proxy_policy():
                    self.fail("World readable password")
                config.chmod(0o600)
                with remote.proxy_policy() as (_, policy):
                    self.assertEqual(policy, POLICY)
                target = config.with_name("other.json")
                config.rename(target)
                config.symlink_to(target)
                with self.assertRaisesRegex(remote.Refused, "proxy-policy"), remote.proxy_policy():
                    self.fail("Symlinked password")


@unittest.skipUnless(shutil.which("openssl") and shutil.which("curl"), "TLS fixture needs openssl and curl")
class TLSLoopbackTests(unittest.TestCase):
    def test_real_tls_and_curl_over_socks5h(self):
        class Target(BaseHTTPRequestHandler):
            def handle(inner):
                with contextlib.suppress(ConnectionResetError):
                    super().handle()

            def do_GET(inner):
                body = TRACE_BODY if inner.path == "/trace" else GIT_BODY
                inner.send_response(200)
                inner.send_header("Content-Length", str(len(body)))
                inner.end_headers()
                inner.wfile.write(body)

            def log_message(inner, *_):
                pass

        class Socks(socketserver.StreamRequestHandler):
            def handle(inner):
                sock = inner.request
                sock.settimeout(3)
                version, count = inner.rfile.read(2)
                if version != 5 or b"\0" not in inner.rfile.read(count):
                    return
                sock.sendall(b"\x05\0")
                if inner.rfile.read(4) != b"\x05\x01\0\x03":
                    return  # Reject a client that resolves localhost itself.
                size = inner.rfile.read(1)[0]
                if inner.rfile.read(size) != b"localhost" or int.from_bytes(inner.rfile.read(2), "big") != target.server_port:
                    return
                with socket.create_connection(target.server_address, timeout=3) as upstream:
                    sock.sendall(b"\x05\0\0\x01\x7f\0\0\x01\0\0")
                    while ready := select.select([sock, upstream], [], [], 3)[0]:
                        for source in ready:
                            chunk = source.recv(65536)
                            if not chunk:
                                return
                            (upstream if source is sock else sock).sendall(chunk)

        class TestSession:
            def command(inner, argv, *, timeout, env=remote.ENV, **_):
                p = subprocess.run(argv, capture_output=True, env=env, timeout=timeout, check=False)
                return p.returncode, p.stdout, p.stderr

        with tempfile.TemporaryDirectory() as directory, HTTPServer(("127.0.0.1", 0), Target) as target, \
             socketserver.TCPServer(("127.0.0.1", 0), Socks) as socks:
            cert, key = (Path(directory) / name for name in ("cert.pem", "key.pem"))
            subprocess.run([shutil.which("openssl"), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                            "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", str(key),
                            "-out", str(cert)], check=True, capture_output=True, timeout=10)
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.load_cert_chain(cert, key)
            target.socket = ctx.wrap_socket(target.socket, server_side=True)
            for server in (target, socks):
                threading.Thread(target=server.serve_forever, kwargs={"poll_interval": .05}, daemon=True).start()
            url = f"https://localhost:{target.server_port}"
            config = {**POLICY, "host": "127.0.0.1", "sni": "localhost", "port": target.server_port}
            try:
                with patch.multiple(remote, PYTHON=sys.executable, CA=str(cert), TRACE=url + "/trace",
                                    GITHUB=url + "/git"), patch.object(remote, "owned_listener", return_value=True):
                    remote.tls_entry(TestSession(), config)
                    with self.assertRaisesRegex(remote.Refused, "entry-tls"):
                        remote.tls_entry(TestSession(), {**config, "sni": "incorrect.invalid"})
                    remote.probe(TestSession(), None, socks.server_address[1], config)
                    with patch.object(remote, "TRACE", f"https://127.0.0.1:{target.server_port}/trace"):
                        # The SOCKS server denies non-domain SOCKS requests. Hostname validation
                        # is exercised directly above, while this also proves no direct fallback.
                        with self.assertRaisesRegex(remote.Refused, "probe-network"):
                            remote.probe(TestSession(), None, socks.server_address[1], config)
            finally:
                socks.shutdown()
                target.shutdown()


class DeployTests(unittest.TestCase):
    def invoke(self, *, entry=None, failure=None, residue=False, post_failure=False, internal=False, diagnostic_failure=False):
        calls = []
        report = {"before": READY.copy(), "servicesBefore": STATES, "installState": "not-started"}
        statuses = iter([READY, {**READY, "active": ACTIVE, "ready": not post_failure}])

        @contextlib.contextmanager
        def proxy(session, policy, report):
            try:
                if entry:
                    raise remote.Refused(entry)
                yield object(), PORT
            finally:
                report["proxyCleaned"] = True

        def installer(session, request, action, *, release, env):
            calls.append(action)
            self.assertEqual(release, RELEASE)
            self.assertEqual(env["ALL_PROXY"], f"socks5h://127.0.0.1:{PORT}")
            self.assertEqual(env["no_proxy"], "")
            if action == failure:
                return 2, b"", SECRET.encode()
            if action == "install" and internal:
                raise RuntimeError(SECRET)
            if action == "verify":
                data = {"verified": RELEASE["artifactSha"], "sourceSha": RELEASE["sourceSha"],
                        **{k: RELEASE[k] for k in remote.SUMMARY}}
            else:
                data = {"active": ACTIVE, "result": "committed", "operationId": "1" * 32}
            return 0, json.dumps(data).encode(), b""

        def status(*args, **kwargs):
            calls.append("status")
            if diagnostic_failure and kwargs.get("monitor") is False:
                raise OSError(SECRET)
            if residue:
                return {**READY, "ready": False, "reason": "git-residue"}
            return next(statuses)

        error = None
        with patch.object(remote, "proxy", proxy), patch.object(remote, "probe"), patch.object(remote, "check_git_processes"), \
             patch.object(remote, "owned_listener", return_value=True), patch.object(remote, "installer_command", installer), \
             patch.object(remote, "status", status), patch.object(remote, "services", return_value=STATES):
            if internal:
                # Use the actual protocol boundary, including JSON and error scrubbing.
                def execute(session, request, response):
                    response.update(report)
                    remote.deploy(session, request, response, POLICY)

                out = io.StringIO()
                with patch.object(remote, "execute", execute), patch.object(remote, "read_request", return_value=REQUEST), \
                     patch.object(remote.os, "umask"), patch.object(remote.resource, "setrlimit"), \
                     patch.object(remote.signal, "signal"), contextlib.redirect_stdout(out):
                    self.assertEqual(remote.main(), 2)
                self.assertNotIn(SECRET, out.getvalue())
                report = json.loads(out.getvalue())
                error = report["error"]
            else:
                try:
                    remote.deploy(object(), REQUEST, report, POLICY)
                except remote.Refused as exc:
                    error = str(exc)
        self.assertNotIn(SECRET, repr((report, error)))
        return calls, report, error

    def test_full_sequence(self):
        calls, report, error = self.invoke()
        self.assertIsNone(error)
        self.assertEqual(calls, ["verify", "status", "install", "status"])
        self.assertEqual(report["after"]["active"], ACTIVE)
        self.assertEqual(report["installState"], "acknowledged")

    def test_verify_failure_never_calls_install_or_recover(self):
        calls, report, error = self.invoke(failure="verify", residue=True)
        self.assertEqual((calls, error), (["verify", "status"], "verify"))
        self.assertEqual(report["after"]["reason"], "git-residue")
        self.assertTrue(report["proxyCleaned"])

    def test_install_failure_preserves_scene(self):
        calls, report, error = self.invoke(failure="install", post_failure=True)
        self.assertEqual((calls, error), (["verify", "status", "install", "status"], "install"))
        self.assertFalse(report["after"]["ready"])
        self.assertTrue(report["proxyCleaned"])
        self.assertNotIn("installResult", report)
        self.assertEqual(report["installState"], "refused")

    def test_internal_exception_cleans_proxy_and_reconciles(self):
        for diagnostic_failure in (False, True):
            with self.subTest(diagnostic_failure=diagnostic_failure):
                calls, report, error = self.invoke(internal=True, diagnostic_failure=diagnostic_failure)
                self.assertEqual((calls, error), (["verify", "status", "install", "status"], "internal"))
                self.assertEqual(report["installState"], "unknown")
                self.assertTrue(report["proxyCleaned"])
                self.assertIn("servicesAfter", report)
                self.assertEqual("after" in report, not diagnostic_failure)

    def test_inconsistent_post_install_status(self):
        _, report, error = self.invoke(post_failure=True)
        self.assertEqual(error, "post-status")
        self.assertTrue(report["proxyCleaned"])

    def test_tls_or_proxy_start_failure_stops_before_verify(self):
        for reason in ("entry-tls", "proxy-start"):
            calls, _, error = self.invoke(entry=reason)
            self.assertEqual((calls, error), (["status"], reason))


class StatusContractTests(unittest.TestCase):
    def test_partial_installer_reply_does_not_invent_snapshot(self):
        for value in (b"", b"{\"consistent\":true,\"ready\":true}", json.dumps(READY).encode()):
            with self.subTest(value=value), patch.object(remote, "installer_command", return_value=(0, value, SECRET.encode())):
                snapshot = release.clean_status(remote.status(object(), REQUEST))
                self.assertFalse(snapshot["activeResourcesVerified"])
                self.assertFalse(snapshot["consistent"])
                self.assertNotIn("active", snapshot)
                self.assertNotIn("pending", snapshot)

    def test_real_installer_hashes_active_resources_even_with_pending_transaction(self):
        # Reuse the existing fixture that produces real Git artifacts with artifact.cjs.
        from test_install import Crash, InstallTests

        fixture = InstallTests()
        self.addCleanup(fixture.doCleanups)
        fixture.setUp()
        first, _ = fixture.installed()
        installer = Path(remote.__file__).with_name("install.py")
        request = {"installerSha256": release.Remote.source_hash(installer)}

        class LocalStatus:
            def command(self, argv, *, timeout, env, **kwargs):
                proc = subprocess.run(argv, timeout=timeout, capture_output=True, env=env)
                return proc.returncode, proc.stdout, proc.stderr

        def crash(checkpoint):
            if checkpoint == "before_index":
                raise Crash

        with patch.multiple(remote, ROOT=fixture.root, INSTALLER=installer, PYTHON=sys.executable):
            session = LocalStatus()
            snapshot = release.clean_status(remote.status(session, request))
            self.assertEqual(snapshot["active"]["artifactSha"], first.artifact)
            self.assertTrue(snapshot["activeResourcesVerified"])
            self.assertTrue(snapshot["ready"])

            second = fixture.artifact("two")
            with self.assertRaises(Crash):
                fixture.tool(crash).execute("install", second)
            snapshot = release.clean_status(remote.status(session, request))
            self.assertTrue(snapshot["consistent"])
            self.assertTrue(snapshot["activeResourcesVerified"])
            self.assertFalse(snapshot["ready"])
            self.assertTrue(snapshot["pending"])

            resource = fixture.root / "site/assets/main-one-ABCD1234.js"
            resource.write_bytes(b"changed bytes")
            for damage in ("corrupt", "missing"):
                with self.subTest(damage=damage):
                    snapshot = release.clean_status(remote.status(session, request))
                    self.assertEqual(snapshot["active"]["artifactSha"], first.artifact)
                    self.assertFalse(snapshot["activeResourcesVerified"])
                    self.assertFalse(snapshot["consistent"])
                    self.assertFalse(snapshot["ready"])
                if damage == "corrupt":
                    resource.unlink()


@unittest.skipUnless(sys.platform == "linux" and shutil.which("ss"), "Linux memfd, procfs and ss required")
class LinuxProcessTests(unittest.TestCase):
    def fake_proxy(self, directory, exit_immediately=False):
        path = Path(directory) / "fake-trojan"
        config_check = ("assert c['ssl']['verify'] and c['ssl']['verify_hostname']\n"
                        "assert c['ssl']['cert'] == '/etc/ssl/certs/ca-certificates.crt'\n"
                        "assert c['password'] and c['local_port'] != 1080 and c['local_addr'] == '127.0.0.1'\n")
        body = "sys.exit(3)\n" if exit_immediately else (
            "with socket.socket() as server:\n"
            "    server.bind((c['local_addr'], c['local_port']))\n"
            "    server.listen()\n"
            "    time.sleep(60)\n")
        path.write_text(f"#!{sys.executable}\nimport json,sys,socket,time\nc=json.load(open(sys.argv[2]))\n"
                        + config_check + body)
        path.chmod(0o700)
        return str(path)

    def test_real_proxy_listener_and_memfd_are_cleaned_after_exception(self):
        session = remote.Session(watch=lambda: False)
        report = {}
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(remote, "TROJAN", self.fake_proxy(directory)), patch.object(remote, "tls_entry"):
                with self.assertRaisesRegex(RuntimeError, "fixture"), remote.proxy(session, POLICY, report) as (p, port):
                    proc = Path("/proc") / str(p.pid)
                    self.assertNotIn(SECRET.encode(), (proc / "cmdline").read_bytes())
                    self.assertNotIn(SECRET.encode(), (proc / "environ").read_bytes())
                    self.assertTrue(remote.owned_listener(session, p, port))
                    self.assertTrue(any("memfd:penumbra-trojan" in os.readlink(fd) for fd in (proc / "fd").iterdir()))
                    raise RuntimeError("fixture")
            self.assertEqual(len(list(Path(directory).iterdir())), 1)
        self.assertFalse(proc.exists())
        self.assertEqual(remote.listeners(session, port, monitor=False), [])
        self.assertTrue(report["proxyCleaned"])

    def test_real_proxy_start_failure_reports_cleanup(self):
        report = {}
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(remote, "TROJAN", self.fake_proxy(directory, True)), patch.object(remote, "tls_entry"):
                with self.assertRaisesRegex(remote.Refused, "proxy-start"), remote.proxy(remote.Session(lambda: False), POLICY, report):
                    self.fail("Unexpected listener")
        self.assertTrue(report["proxyCleaned"])

    def test_real_child_stops_on_remote_disconnect(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "started"
            code = "import pathlib,sys,time; pathlib.Path(sys.argv[1]).write_text(str(__import__('os').getpid())); time.sleep(60)"
            session = remote.Session(lambda: marker.exists() and bool(marker.stat().st_size))
            with self.assertRaisesRegex(remote.Refused, "interrupted"):
                session.command([sys.executable, "-c", code, str(marker)], timeout=5, code="verify", installer=True)
            pid = int(marker.read_text())
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)


if __name__ == "__main__":
    unittest.main()
