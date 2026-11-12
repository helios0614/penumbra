#!/usr/bin/env python3
"""Ubuntu-side release session. Install alongside the reviewed install.py."""

import contextlib
import ctypes
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import resource
import select
import signal
import socket
import stat
import subprocess
import sys
import time

INSTALLER = Path("/home/ubuntu/penumbra-tools/install.py")
ROOT = Path("/home/ubuntu/AionHome/penumbra-web")
POLICY = Path("/home/ubuntu/.config/penumbra-release/proxy.json")
TROJAN = "/usr/src/trojan/trojan"
CA = "/etc/ssl/certs/ca-certificates.crt"
CURL = "/usr/bin/curl"
SS = "/usr/bin/ss"
SYSTEMCTL = "/usr/bin/systemctl"
PYTHON = "/usr/bin/python3.12"
SERVICES = ("aion-chat.service", "cloudflared.service", "trojan.service")
ENV = {"PATH": "/usr/bin:/bin", "HOME": "/home/ubuntu", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}
TRACE = "https://www.cloudflare.com/cdn-cgi/trace"
GITHUB = "https://github.com/helios0614/penumbra.git/info/refs?service=git-upload-pack"
SHA = re.compile(r"[0-9a-f]{40}")
HASH = re.compile(r"[0-9a-f]{64}")
IDENTITY = {"artifactSha": SHA, "sourceSha": SHA, "workflowSha": SHA,
            "buildId": re.compile(r"actions-[1-9][0-9]*-[1-9][0-9]*")}
SUMMARY = ("fileCount", "sizeBytes", "distSha256")
MARKER = b"\n__PENUMBRA_PROBE__ "
SIGNALS = (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)


class Refused(Exception):
    pass


def require(condition, code):
    if not condition:
        raise Refused(code)


def json_data(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError
            result[key] = value
        return result
    result = json.loads(data, object_pairs_hook=unique)
    if not isinstance(result, dict):
        raise ValueError
    return result


def fields(value, patterns):
    return isinstance(value, dict) and all(isinstance(value.get(k), str) and p.fullmatch(value[k])
                                           for k, p in patterns.items())


def check_request(request):
    action = request.get("action")
    require(type(request.get("version")) is int and request["version"] == 1 and action in ("check", "status", "deploy") and
            fields(request, {"helperSha256": HASH, "installerSha256": HASH}), "request")
    if action == "deploy":
        release = request.get("release")
        require(fields(release, {**IDENTITY, "distSha256": HASH}) and "previousActive" in release and
                (release["previousActive"] is None or fields(release["previousActive"], {**IDENTITY, "indexSha256": HASH})) and
                all(type(release.get(k)) is int and release[k] > 0 for k in ("fileCount", "sizeBytes")), "request")
    return action


def disconnected():
    # The coordinator keeps this channel open for the whole session. Additional
    # input after the request, or EOF after SSH goes away, aborts the lease.
    return bool(select.select([0], [], [], 0)[0])


def signal_abort(_sig, _frame):
    raise Refused("interrupted")


def parent_death(sig):
    # The Ubuntu supervisor is single threaded. Also check the parent after
    # setting PDEATHSIG to cover death between fork and prctl.
    parent = os.getpid()
    prctl = ctypes.CDLL(None, use_errno=True).prctl

    def setup():
        if prctl(1, int(sig), 0, 0, 0) != 0 or os.getppid() != parent:
            os._exit(125)
    return setup


def stop(process, first=signal.SIGTERM, grace=3):
    with contextlib.suppress(ProcessLookupError):
        os.killpg(process.pid, first)
    try:
        process.communicate(timeout=grace)
    except subprocess.TimeoutExpired:
        pass
    with contextlib.suppress(ProcessLookupError):
        os.killpg(process.pid, signal.SIGKILL)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        raise Refused("cleanup") from None


def stop_proxy(process):
    # Trojan runs as one foreground process. Signal only this Popen child.
    if process.poll() is None:
        process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            raise Refused("cleanup") from None


class Session:
    def __init__(self, watch=disconnected):
        self.watch = watch
        self.deadline = time.monotonic() + 3600

    def live(self):
        require(not self.watch() and time.monotonic() < self.deadline, "interrupted")

    def command(self, argv, *, code, timeout, env=ENV, monitor=True, installer=False):
        if monitor:
            self.live()
        deadline = time.monotonic() + timeout
        death = signal.SIGINT if installer else signal.SIGKILL
        try:
            with subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  env=env, start_new_session=True, preexec_fn=parent_death(death)) as process:
                try:
                    while True:
                        if monitor:
                            self.live()
                        remaining = deadline - time.monotonic()
                        require(remaining > 0, code)
                        try:
                            out, err = process.communicate(timeout=min(.25, remaining))
                            return process.returncode, out, err
                        except subprocess.TimeoutExpired:
                            continue
                except BaseException:
                    with ignore_signals():
                        stop(process, first=death, grace=13 if installer else 3)
                    raise
        except OSError:
            raise Refused(code) from None


def inspect_host(report):
    try:
        data = Path("/etc/os-release").read_text()
        require(sys.platform == "linux" and "ID=ubuntu" in data.splitlines() and
                os.geteuid() == Path("/home/ubuntu").stat().st_uid and os.geteuid() != 0, "host")
        report.update(host=socket.gethostname(), ubuntu=True)
    except OSError:
        raise Refused("host") from None


def pinned_file(path, digest, code):
    try:
        require(path.is_file() and not path.is_symlink() and path.stat().st_uid in (0, os.geteuid()) and
                not path.stat().st_mode & 0o022 and
                hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest() == digest, code)
    except OSError:
        raise Refused(code) from None


@contextlib.contextmanager
def proxy_policy():
    try:
        fd = os.open(POLICY.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    except OSError:
        raise Refused("proxy-policy") from None
    try:
        info = os.fstat(fd)
        require(info.st_uid == os.geteuid() and not info.st_mode & 0o077, "proxy-policy")
        try:
            with os.fdopen(os.open(POLICY.name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW, dir_fd=fd), "rb") as stream:
                info = os.fstat(stream.fileno())
                require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and not info.st_mode & 0o077 and
                        info.st_nlink == 1 and info.st_size <= 8192, "proxy-policy")
                raw = stream.read(8193)
                require(len(raw) <= 8192, "proxy-policy")
            policy = json_data(raw)
            # Accept legacy ssl metadata without using it to configure the temporary proxy.
            require(set(policy) - {"ssl"} == {"host", "port", "sni", "password", "alpn", "expectedEgressIp"}, "proxy-policy")
            host = re.compile(r"[A-Za-z0-9][A-Za-z0-9.:-]{0,252}")
            sni = re.compile(r"[A-Za-z0-9][A-Za-z0-9.-]{0,252}")
            require(fields(policy, {"host": host, "sni": sni}) and type(policy["port"]) is int and
                    0 < policy["port"] < 65536 and isinstance(policy["password"], str) and
                    0 < len(policy["password"]) <= 4096 and all(ord(ch) >= 32 for ch in policy["password"]) and
                    isinstance(policy["alpn"], list) and all(p in ("h2", "http/1.1") for p in policy["alpn"]) and
                    isinstance(policy["expectedEgressIp"], str) and ipaddress.ip_address(policy["expectedEgressIp"]).is_global,
                    "proxy-policy")
        except (OSError, ValueError, TypeError, RecursionError):
            raise Refused("proxy-policy") from None
        yield fd, policy
    finally:
        os.close(fd)


def proxy_dependencies():
    try:
        tool = Path(TROJAN).stat()
        require(tool.st_uid == 0 and not tool.st_mode & 0o022 and os.access(TROJAN, os.X_OK) and
                all(os.access(p, os.X_OK) for p in (CURL, SS)) and os.access(CA, os.R_OK) and
                hasattr(os, "memfd_create"), "dependencies")
    except OSError:
        raise Refused("dependencies") from None


def tls_entry(session, policy):
    # Isolate even the resolver, which need not honor socket timeouts.
    code = """import socket,ssl,sys
host,port,sni,*alpn=sys.argv[1:]
context=ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
context.check_hostname=False
context.verify_mode=ssl.CERT_NONE
if alpn: context.set_alpn_protocols(alpn)
with socket.create_connection((host,int(port)),timeout=5) as connection:
    with context.wrap_socket(connection,server_hostname=sni): pass
"""
    rc, _, _ = session.command([PYTHON, "-I", "-B", "-c", code, policy["host"], str(policy["port"]),
                                policy["sni"], *policy["alpn"]], code="entry-tls", timeout=12)
    require(rc == 0, "entry-tls")


def listeners(session, port, *, monitor=True):
    rc, output, _ = session.command([SS, "-H", "-lntp", f"sport = :{port}"], timeout=3,
                                    code="proxy-start" if monitor else "cleanup", monitor=monitor)
    require(rc == 0, "proxy-start" if monitor else "cleanup")
    return output.splitlines()


def owned_listener(session, process, port):
    rows = listeners(session, port)
    if not rows:
        return False
    require(len(rows) == 1 and process.poll() is None, "proxy-start")
    columns = rows[0].split(maxsplit=5)
    require(len(columns) == 6 and columns[3] == f"127.0.0.1:{port}".encode() and
            re.findall(rb"\bpid=([0-9]+),", columns[5]) == [str(process.pid).encode()], "proxy-start")
    return True


def proxy_environment(port):
    url = f"socks5h://127.0.0.1:{port}"
    return {**ENV, "SSL_CERT_FILE": CA, "CURL_CA_BUNDLE": CA, "NO_PROXY": "", "no_proxy": "",
            **{key: url for name in ("http_proxy", "https_proxy", "all_proxy") for key in (name, name.upper())}}


@contextlib.contextmanager
def proxy(session, policy, report):
    tls_entry(session, policy)
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    require(port != 1080 and not listeners(session, port), "proxy-start")
    config = {"run_type": "client", "local_addr": "127.0.0.1", "local_port": port,
              "remote_addr": policy["host"], "remote_port": policy["port"], "password": [policy["password"]],
              "ssl": {"sni": policy["sni"], "verify": False, "verify_hostname": False, "cert": CA, "alpn": policy["alpn"]}}
    process = None
    report["proxyCleaned"] = False
    try:
        # Anonymous, sealed config. The kernel drops it when the last fd closes,
        # including after SIGKILL. No password, config bytes or log in argv/env.
        fd = os.memfd_create("penumbra-trojan", os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
        try:
            os.fchmod(fd, 0o600)
            payload = json.dumps(config).encode()
            require(os.write(fd, payload) == len(payload), "proxy-start")
            os.lseek(fd, 0, os.SEEK_SET)
            fcntl.fcntl(fd, fcntl.F_ADD_SEALS,
                        fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
            process = subprocess.Popen([TROJAN, "-c", f"/proc/self/fd/{fd}", "-l", "/dev/null"], env=ENV,
                                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       pass_fds=(fd,), start_new_session=True, preexec_fn=parent_death(signal.SIGKILL))
        finally:
            os.close(fd)
        deadline = time.monotonic() + 5
        while not owned_listener(session, process, port):
            require(process.poll() is None and time.monotonic() < deadline, "proxy-start")
            time.sleep(.1)
        yield process, port
    except OSError:
        raise Refused("proxy-start") from None
    finally:
        with ignore_signals():
            if process is not None:
                stop_proxy(process)
            require(not listeners(session, port, monitor=False), "cleanup")
            report["proxyCleaned"] = True


def probe_response(rc, output, port):
    if rc in (35, 51, 58, 59, 60, 77, 82, 83, 90, 91):
        raise Refused("probe-tls")
    if rc in (18, 28, 52, 55, 56):
        return None  # Bounded retry of a read-only transfer.
    require(rc == 0, "probe-network")
    body, marker, metrics = output.rpartition(MARKER)
    result = re.fullmatch(rb"([0-9]{3}) ([0-9]+) (127\.0\.0\.1) ([0-9]+)\n", metrics)
    require(marker and result and body and len(body) <= 65536, "probe-format")
    http, tls, _, peer_port = result.groups()
    require(tls == b"0", "probe-tls")
    require(peer_port == str(port).encode(), "proxy-exit")
    if http in (b"408", b"429", b"500", b"502", b"503", b"504"):
        return None
    require(http == b"200", "probe-network")
    return body


def probe(session, process, port, policy):
    for url in (TRACE, GITHUB):
        for attempt in range(3):
            require(owned_listener(session, process, port), "proxy-exit")
            rc, output, _ = session.command([
                CURL, "-q", "--silent", "--show-error", "--proxy", f"socks5h://127.0.0.1:{port}", "--noproxy", "",
                "--cacert", CA, "--proto", "=https", "--connect-timeout", "5", "--max-time", "15", "--max-filesize", "65536",
                "--write-out", MARKER.decode() + "%{http_code} %{ssl_verify_result} %{remote_ip} %{remote_port}\n", url,
            ], env=proxy_environment(port), timeout=18, code="probe-network")
            body = probe_response(rc, output, port)
            if body is not None:
                break
            if attempt < 2:
                time.sleep(1 + attempt)
        require(body is not None, "probe-network")
        if url == TRACE:
            addresses = [line[3:] for line in body.splitlines() if line.startswith(b"ip=")]
            require(len(addresses) == 1 and b"h=www.cloudflare.com" in body.splitlines(), "proxy-exit")
            try:
                require(ipaddress.ip_address(addresses[0].decode("ascii")) ==
                        ipaddress.ip_address(policy["expectedEgressIp"]), "proxy-exit")
            except (UnicodeError, ValueError):
                raise Refused("proxy-exit") from None
        else:
            require(body.startswith(b"001e# service=git-upload-pack\n0000"), "probe-format")
    require(owned_listener(session, process, port), "proxy-exit")


def services(session, *, monitor=True):
    states = {}
    for unit in SERVICES:
        rc, output, _ = session.command([SYSTEMCTL, "show", "--no-pager", "-p",
            "LoadState,ActiveState,MainPID,NRestarts,ExecMainStartTimestampMonotonic", unit], timeout=10,
            code="services", monitor=monitor)
        try:
            data = dict(line.split("=", 1) for line in output.decode("ascii").splitlines())
            require(rc == 0 and data.get("LoadState") == "loaded", "services")
            states[unit] = {"active": data["ActiveState"] == "active", "pid": int(data["MainPID"]),
                            "restarts": int(data.get("NRestarts") or 0),
                            "startMonotonic": int(data["ExecMainStartTimestampMonotonic"])}
        except (ValueError, KeyError):
            raise Refused("services") from None
    return states


def assert_services(states):
    require(all(v["active"] and v["pid"] > 0 for v in states.values()), "services")


def installer_command(session, request, action, *, release=None, env=ENV, monitor=True):
    pinned_file(INSTALLER, request["installerSha256"], "installer-version")
    argv = [PYTHON, "-I", "-B", str(INSTALLER), action, "--root", str(ROOT)]
    if release:
        for key, arg in zip(IDENTITY, ("artifact-sha", "source-sha", "workflow-sha", "build-id")):
            argv += ["--" + arg, release[key]]
    return session.command(argv, code=action, timeout={"status": 300, "verify": 1500, "install": 900}[action],
                           env=env, monitor=monitor, installer=True)


def status(session, request, *, monitor=True):
    rc, output, err = installer_command(session, request, "status", monitor=monitor)
    try:
        result = json_data(output)
    except (ValueError, UnicodeError, RecursionError):
        result = {}
    valid = ("active" in result and isinstance(result.get("pending"), list) and
             type(result.get("consistent")) is bool and type(result.get("ready")) is bool and
             result["ready"] == (result["consistent"] and not result["pending"]) and
             rc == (0 if result["ready"] else 2))
    if valid and result["consistent"]:
        active = result["active"]
        valid = ((active is None or fields(active, {**IDENTITY, "indexSha256": HASH})) and
                 "actualIndexSha256" in result and
                 result["actualIndexSha256"] == (active["indexSha256"] if active else None))
    detail = str(result.get("error", "")).encode(errors="replace") + err
    if not valid:
        result = {"consistent": False, "ready": False}
    # Classify the installer diagnostics. Do not forward paths, argv or stderr.
    if not result["ready"]:
        reason = "installer-refused"
        for marker, code in ((b"interrupted Git locks/temporary files", "git-residue"), (b"Deployment lock is busy", "lock-busy"),
                             (b"Resource path conflict", "resource-conflict"), (b"Unknown site", "resource-conflict"),
                             (b"Site resource differs", "resource-conflict")):
            if marker in detail:
                reason = code
                break
        result["reason"] = reason
    return {k: v for k, v in result.items() if k in ("active", "actualIndexSha256", "pending", "consistent", "ready", "reason")}


def successful_json(rc, output, code):
    require(rc == 0, code)
    try:
        return json_data(output)
    except (ValueError, UnicodeError, RecursionError):
        raise Refused(code) from None


@contextlib.contextmanager
def ignore_signals():
    previous = {sig: signal.signal(sig, signal.SIG_IGN) for sig in SIGNALS}
    try:
        yield
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def acquire_deploy_lock(fd):
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        raise Refused("concurrent-deploy") from None


def check_git_processes():
    """Refuse visible Git processes associated with this managed tree."""
    def within(value):
        return value == str(ROOT) or value.startswith(str(ROOT) + "/")

    for proc in Path("/proc").iterdir():
        if not proc.name.isdecimal():
            continue
        try:
            if proc.stat().st_uid != os.geteuid() or not (proc / "comm").read_bytes().startswith(b"git"):
                continue
            argv = os.fsdecode((proc / "cmdline").read_bytes()).split("\x00")
            require(not any(within(arg.removeprefix("--git-dir=")) for arg in argv), "git-process")
            if not argv[0]:  # Zombie, with no open file descriptors.
                continue
            require(not within(os.readlink(proc / "cwd")), "git-process")
            for fd in (proc / "fd").iterdir():
                with contextlib.suppress(FileNotFoundError):
                    require(not within(os.readlink(fd)), "git-process")
        except (FileNotFoundError, ProcessLookupError):
            continue
        except OSError:
            raise Refused("git-process") from None


def deploy(session, request, report, policy):
    release = request["release"]
    require(report["before"]["active"] == release["previousActive"], "production-changed")
    try:
        with proxy(session, policy, report) as (process, port):
            probe(session, process, port, policy)
            report["proxyChecked"] = True
            check_git_processes()
            env = proxy_environment(port)
            rc, out, _ = installer_command(session, request, "verify", release=release, env=env)
            verified = successful_json(rc, out, "verify")
            require(verified.get("verified") == release["artifactSha"] and verified.get("sourceSha") == release["sourceSha"] and
                    all(type(verified.get(k)) is type(release[k]) and verified[k] == release[k] for k in SUMMARY), "verify-identity")
            checked = status(session, request)
            require(checked["ready"] and checked["active"] == report["before"]["active"], "production-changed")
            require(services(session) == report["servicesBefore"], "production-changed")
            require(owned_listener(session, process, port), "proxy-exit")
            check_git_processes()
            report["installState"] = "unknown"
            rc, out, _ = installer_command(session, request, "install", release=release, env=env)
            if rc == 2:
                report["installState"] = "refused"
            installed = successful_json(rc, out, "install")
            active = installed.get("active")
            require(fields(active, {**IDENTITY, "indexSha256": HASH}) and all(active[k] == release[k] for k in IDENTITY) and
                    installed.get("result") in ("already-active", "committed"), "install-identity")
            if installed["result"] == "committed":
                require(fields(installed, {"operationId": re.compile(r"[0-9a-f]{32}")}), "install-identity")
                report["operationId"] = installed["operationId"]
            report.update(installResult=installed["result"], installState="acknowledged")
            require(owned_listener(session, process, port), "proxy-exit")
            report["after"] = status(session, request)
            report["servicesAfter"] = services(session)
            require(report["after"]["ready"] and report["after"]["active"] == active, "post-status")
            require(report["servicesAfter"] == report["servicesBefore"], "services")
    except Exception:
        # The proxy has already unwound. Read-only diagnostics must never mask
        # the original failure, including an unexpected installer/cleanup error.
        with ignore_signals():
            if "after" not in report:
                with contextlib.suppress(Exception):
                    report["after"] = status(session, request, monitor=False)
            if "servicesAfter" not in report:
                with contextlib.suppress(Exception):
                    report["servicesAfter"] = services(session, monitor=False)
            report["gitProcessesClear"] = False
            with contextlib.suppress(Exception):
                check_git_processes()
                report["gitProcessesClear"] = True
        raise


def execute(session, request, report):
    action = check_request(request)
    if action == "deploy":
        report["installState"] = "not-started"
    inspect_host(report)
    pinned_file(Path(__file__), request["helperSha256"], "helper-version")
    def snapshot():
        report["before"] = status(session, request)
        report["servicesBefore"] = services(session)
        require(report["before"]["ready"] and (action == "status" or report["before"]["active"] is not None), "status")
        assert_services(report["servicesBefore"])

    if action != "deploy":
        snapshot()
    if action == "status":
        return
    # Read-only preflight opens the policy but never starts an instance or
    # takes a write lock. Deployment holds a separate lock across both CLI calls.
    with proxy_policy() as (fd, policy):
        if action == "deploy":
            acquire_deploy_lock(fd)
            snapshot()
        proxy_dependencies()
        check_git_processes()
        report["proxyPrerequisites"] = True
        if action == "deploy":
            deploy(session, request, report, policy)


def read_request():
    data = bytearray()
    deadline = time.monotonic() + 20
    while b"\n" not in data:
        remaining = deadline - time.monotonic()
        require(remaining > 0 and bool(select.select([0], [], [], remaining)[0]), "request")
        chunk = os.read(0, 8193 - len(data))
        require(chunk and len(data) + len(chunk) <= 8192, "request")
        data.extend(chunk)
    require(data.endswith(b"\n") and data.count(b"\n") == 1, "request")
    try:
        return json_data(data)
    except (ValueError, UnicodeError, RecursionError):
        raise Refused("request") from None


def main():
    os.umask(0o077)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    for sig in SIGNALS:
        signal.signal(sig, signal_abort)
    report = {"version": 1, "ok": False}
    try:
        execute(Session(), read_request(), report)
        report["ok"] = True
    except Refused as exc:
        report["error"] = str(exc)
    except Exception:
        report["error"] = "internal"
    try:
        print(json.dumps(report), flush=True)
    except BrokenPipeError:
        return 2
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    sys.exit(main())
