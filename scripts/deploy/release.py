#!/usr/bin/env python3
"""Penumbra daily release coordinator (Python 3.12+, Windows and macOS)."""

import argparse
import base64
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import shutil
import signal
import subprocess
import sys
import threading
import time

REPO = "helios0614/penumbra"
API = f"repos/{REPO}"
API_VERSION = "2026-03-10"
# This is the supported API version with an explicit return_run_details option.
DISPATCH_API_VERSION = "2022-11-28"
WORKFLOW = ".github/workflows/deploy.yml"
PUBLISH_STEP = "Reverify and append release to deploy branch"
HERE = Path(__file__).resolve().parent
SHA = re.compile(r"[0-9a-f]{40}")
HASH = re.compile(r"[0-9a-f]{64}")
BUILD = re.compile(r"actions-[1-9][0-9]*-[1-9][0-9]*")
FIELDS = {"artifactSha": SHA, "sourceSha": SHA, "workflowSha": SHA, "buildId": BUILD}
RUN_WAIT = 45 * 60
REMOTE_WAIT = 65 * 60
RECONCILE_WAIT = 360
OUTPUT_LIMIT = 16 * 1024 * 1024
LOG_LIMIT = 4 * 1024 * 1024
API_TIMEOUT = 30
GH_ESCAPE_ERROR = b"the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway"


class Refused(Exception):
    pass


class Interrupted(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Refused(message)


def matches(pattern, value):
    return isinstance(value, str) and pattern.fullmatch(value) is not None


def load_json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "Duplicate JSON field")
            result[key] = value
        return result

    try:
        return json.loads(data, object_pairs_hook=unique)
    except (UnicodeError, ValueError, RecursionError):
        raise Refused("Missing or malformed JSON response") from None


def obj(value):
    require(isinstance(value, dict), "Expected a JSON object")
    return value


def positive(value):
    require(type(value) is int and value > 0, "Invalid GitHub numeric identity")
    return value


def identity(value, *, index=False):
    fields = {**FIELDS, "indexSha256": HASH} if index else FIELDS
    require(isinstance(value, dict) and all(matches(p, value.get(k)) for k, p in fields.items()),
            "Invalid release identity")
    return {k: value[k] for k in fields}


@contextlib.contextmanager
def interrupts(handler):
    signals = [signal.SIGINT, signal.SIGTERM]
    for name in ("SIGHUP", "SIGBREAK"):
        if hasattr(signal, name):
            signals.append(getattr(signal, name))
    previous = {sig: signal.signal(sig, handler) for sig in signals}
    try:
        yield
    finally:
        for sig, saved in previous.items():
            signal.signal(sig, saved)


class WindowsJob:
    """Attach a gated launcher before it can create Git, gh or OpenSSH children."""

    def __init__(self):
        import ctypes as c
        from ctypes import wintypes as w

        class Basic(c.Structure):
            _fields_ = [("process", c.c_longlong), ("job", c.c_longlong), ("flags", w.DWORD),
                        ("min_ws", c.c_size_t), ("max_ws", c.c_size_t), ("active", w.DWORD),
                        ("affinity", c.c_size_t), ("priority", w.DWORD), ("scheduling", w.DWORD)]

        class Extended(c.Structure):
            _fields_ = [("basic", Basic), ("io", c.c_ulonglong * 6), ("memory", c.c_size_t * 4)]

        self.kernel = c.WinDLL("kernel32", use_last_error=True)
        for name, args, result in (
            ("CreateJobObjectW", [c.c_void_p, w.LPCWSTR], w.HANDLE),
            ("SetInformationJobObject", [w.HANDLE, c.c_int, c.c_void_p, w.DWORD], w.BOOL),
            ("AssignProcessToJobObject", [w.HANDLE, w.HANDLE], w.BOOL),
            ("CloseHandle", [w.HANDLE], w.BOOL),
        ):
            method = getattr(self.kernel, name)
            method.argtypes, method.restype = args, result
        self.handle = self.kernel.CreateJobObjectW(None, None)
        require(self.handle, "Cannot create Windows Job Object")
        limits = Extended()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not self.kernel.SetInformationJobObject(self.handle, 9, c.byref(limits), c.sizeof(limits)):
            self.close()
            raise Refused("Cannot set Windows Job Object cleanup policy")

    def attach(self, process):
        require(self.kernel.AssignProcessToJobObject(self.handle, int(process._handle)),
                "Cannot attach command to Windows Job Object")

    def close(self):
        if self.handle:
            require(self.kernel.CloseHandle(self.handle), "Cannot close Windows Job Object")
            self.handle = None


# The launcher consumes just its gate byte. The SSH command receives the rest of stdin.
WINDOWS_GATE = (
    "import msvcrt,os,subprocess,sys; msvcrt.setmode(0,os.O_BINARY); "
    "sys.exit(subprocess.call(sys.argv[1:],stdin=0,stdout=1,stderr=2) if os.read(0,1)==b'G' else 125)"
)


def command(argv, *, env=None, timeout=30, data=b"", keep_stdin=False, output_limit=OUTPUT_LIMIT):
    """Bound the command and its descendants, with separate and bounded outputs."""
    windows = os.name == "nt"
    process = job = None
    outputs = [bytearray(), bytearray()]
    overflow = threading.Event()
    readers = []

    def drain(pipe, target):
        try:
            while chunk := pipe.read1(65536):
                if len(target) + len(chunk) > output_limit:
                    overflow.set()
                    return
                target.extend(chunk)
        except OSError:
            overflow.set()

    try:
        if windows:
            job = WindowsJob()
            argv = [sys.executable, "-I", "-B", "-c", WINDOWS_GATE, *argv]
        process = subprocess.Popen(argv, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, start_new_session=not windows,
                                   creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if windows else 0)
        if job:
            job.attach(process)
        for pipe, target in zip((process.stdout, process.stderr), outputs):
            reader = threading.Thread(target=drain, args=(pipe, target), daemon=True)
            reader.start()
            readers.append(reader)
        if windows or data:
            try:
                process.stdin.write((b"G" if windows else b"") + data)
                process.stdin.flush()
            except BrokenPipeError:
                pass
        if not keep_stdin:
            process.stdin.close()
        deadline = time.monotonic() + timeout
        while True:
            require(not overflow.is_set(), "Command output exceeded limit or could not be read")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError
            try:
                code = process.wait(timeout=min(remaining, .2))
                break
            except subprocess.TimeoutExpired:
                continue
    except OSError as exc:
        if isinstance(exc, TimeoutError):
            raise
        raise Refused("Could not execute local command") from None
    finally:
        with interrupts(signal.SIG_IGN):
            if process and not process.stdin.closed:
                with contextlib.suppress(OSError):
                    process.stdin.close()  # Request remote cleanup before ending SSH.
            if keep_stdin and process and process.poll() is None:
                with contextlib.suppress(subprocess.TimeoutExpired):
                    process.wait(timeout=20)
            if job:
                job.close()
                if process and process.poll() is None:
                    with contextlib.suppress(ProcessLookupError):
                        process.kill()  # Covers a launcher that could not attach.
            elif process:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGKILL)
            if process:
                try:
                    process.wait(timeout=5)
                    for reader in readers:
                        reader.join(timeout=3)
                    require(not any(reader.is_alive() for reader in readers), "Command output cleanup could not be confirmed")
                except subprocess.TimeoutExpired:
                    raise Refused("Local command cleanup could not be confirmed") from None
                finally:
                    for i, pipe in enumerate((process.stdout, process.stderr)):
                        if i >= len(readers) or not readers[i].is_alive():
                            pipe.close()
    require(not overflow.is_set(), "Command output exceeded limit or could not be read")
    return code, bytes(outputs[0]), bytes(outputs[1])


def executable(name):
    path = shutil.which(name + (".exe" if os.name == "nt" else ""))
    require(path is not None, f"Required executable is missing: {name}")
    return str(Path(path).resolve())


def local_git(git, report):
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith("GIT_")}
    env.update(GIT_OPTIONAL_LOCKS="0", GIT_NO_REPLACE_OBJECTS="1")

    def read(*args, optional=False):
        rc, data, _ = command([git, "-C", str(HERE.parent.parent), *args], env=env)
        require(rc == 0 or optional, "Local Git inspection failed")
        return data.strip().decode("ascii", errors="replace") if rc == 0 else None

    branch = read("symbolic-ref", "--short", "HEAD", optional=True)
    dirty = bool(read("status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"))
    source = read("rev-parse", "HEAD")
    tracking = read("rev-parse", "--verify", "refs/remotes/origin/main", optional=True)
    relation = read("rev-list", "--left-right", "--count", "HEAD...refs/remotes/origin/main", optional=True) if tracking else None
    counts = relation.split() if relation else []
    report["git"] = {"onMain": branch == "main", "clean": not dirty, "head": source, "originMainCached": tracking,
                     "aheadBehindCached": [int(x) for x in counts] if len(counts) == 2 else None}
    require(branch == "main" and not dirty and matches(SHA, source), "Use a clean checkout of main")
    remote = read("remote", "get-url", "origin")
    https = f"https://github.com/{REPO}"
    require(remote in {https, https + ".git", f"git@github.com:{REPO}.git", f"ssh://git@github.com/{REPO}.git"},
            "origin is not the expected GitHub repository")
    return source


def http_response(output):
    """Read gh api --include framing without exposing response headers."""
    parts = re.split(rb"\r?\n\r?\n", output, maxsplit=1)
    require(len(parts) == 2, "Missing GitHub HTTP response headers")
    lines = parts[0].splitlines()
    match = re.fullmatch(rb"HTTP/\d+(?:\.\d+)? ([1-5][0-9]{2})(?: [^\r\n]*)?", lines[0]) if lines else None
    require(match, "Invalid GitHub HTTP status line")
    return int(match[1]), lines[1:], parts[1]


class GitHub:
    def __init__(self, gh):
        self.gh = gh
        self.env = {k: v for k, v in os.environ.items() if k.upper() not in {"GH_DEBUG", "GH_HOST", "GH_REPO", "GH_FORCE_TTY"}}
        self.env.update(GH_PROMPT_DISABLED="1", GH_NO_UPDATE_NOTIFIER="1", GH_PAGER="cat", NO_COLOR="1")

    def auth(self):
        rc, _, _ = command([self.gh, "auth", "status", "--hostname", "github.com"], env=self.env)
        require(rc == 0, "GitHub CLI is not authenticated for github.com")

    def api(self, endpoint, *, payload=None, raw=False, allow_missing=False):
        version = DISPATCH_API_VERSION if payload is not None else API_VERSION
        argv = [self.gh, "api", "--hostname", "github.com", "-H", f"X-GitHub-Api-Version: {version}",
                "-H", "Accept: application/vnd.github+json", endpoint]
        if raw or payload is not None:
            argv.append("--include")
        if payload is not None:
            argv += ["--method", "POST", "--input", "-"]
        for attempt in range(1 if payload is not None else 3):
            try:
                rc, output, stderr = command(argv, env=self.env, timeout=API_TIMEOUT,
                                              output_limit=LOG_LIMIT if raw else OUTPUT_LIMIT,
                                              data=json.dumps(payload).encode() if payload is not None else b"")
            except TimeoutError:
                rc, output, stderr = -1, b"", b""
            if payload is not None:
                require(rc == 0, "Dispatch request failed")
                status, _, body = http_response(output)
                require(status == 200, "Dispatch response did not return HTTP 200")
                return load_json(body)
            if raw:
                status = None
                if rc == 0 or output:
                    status, headers, body = http_response(output)
                    if allow_missing and status == 404:
                        return None
                    if rc == 0 and status == 200:
                        lengths = [line.partition(b":")[2].strip() for line in headers if line.lower().startswith(b"content-length:")]
                        require(not any(line.lower().startswith(b"content-range:") for line in headers) and
                                (not lengths or lengths == [str(len(body)).encode()]) and len(body) <= LOG_LIMIT,
                                "Incomplete or oversized Actions log")
                        return body
                    if (rc != 0 and status == 200 and attempt < 2 and "--allow-escape-sequences" not in argv and
                            stderr.strip().removeprefix(b"gh: ") == GH_ESCAPE_ERROR):
                        # Newer gh guards even piped logs. Retry only this GET into
                        # bounded private pipes. The raw bytes never reach a terminal.
                        argv.append("--allow-escape-sequences")
                        continue
                transient = rc == -1 or status in (408, 429, 500, 502, 503, 504)
                if not transient or attempt == 2:
                    raise Refused("Actions log download failed")
                time.sleep(1 + attempt)
                continue
            if rc == 0:
                return load_json(output)
            if allow_missing and re.search(rb"\(HTTP 404\)", stderr):
                return None
            transient = rc == -1 or re.search(rb"\(HTTP (?:408|429|50[0234])\)|i/o timeout|connection reset|temporary failure", stderr, re.I)
            if not transient or attempt == 2:
                raise Refused("GitHub API read failed (check permissions, network or Actions logs)")
            time.sleep(1 + attempt)

    def main_sha(self):
        sha = obj(obj(self.api(f"{API}/git/ref/heads/main")).get("object")).get("sha")
        require(matches(SHA, sha), "Invalid remote main SHA")
        return sha

    def workflow(self):
        workflow = obj(self.api(f"{API}/actions/workflows/deploy.yml"))
        require(workflow.get("path") == WORKFLOW and workflow.get("state") == "active", "Publish workflow is unavailable")
        return positive(workflow.get("id"))

    @staticmethod
    def run_identity(run, workflow, source, run_id, attempt):
        number = positive(run.get("run_number"))
        require(all(type(run.get(k)) is int for k in ("workflow_id", "id", "run_attempt")) and
                (run.get("workflow_id"), run.get("id"), run.get("run_attempt"), run.get("event"),
                 run.get("head_branch"), run.get("head_sha"), run.get("display_title")) ==
                (workflow, run_id, attempt, "workflow_dispatch", "main", source, f"Publish source {source} (run {number})")
                and obj(run.get("head_repository")).get("full_name", "").lower() == REPO,
                "Actions run does not match the pinned source, workflow or attempt")
        return number

    def candidates(self, workflow, source):
        result = obj(self.api(f"{API}/actions/workflows/{workflow}/runs?branch=main&event=workflow_dispatch&head_sha={source}&per_page=100"))
        runs = result.get("workflow_runs")
        require(isinstance(runs, list) and type(result.get("total_count")) is int and result["total_count"] == len(runs),
                "Cannot enumerate matching Actions runs safely")
        active = []
        for run in runs:
            run = obj(run)
            number = positive(run.get("run_number"))
            if run.get("display_title") != f"Publish source {source} (run {number})":
                continue  # This workflow can also build older source commits.
            run_id, attempt = positive(run.get("id")), positive(run.get("run_attempt"))
            self.run_identity(run, workflow, source, run_id, attempt)
            if run.get("status") == "completed" and run.get("conclusion") == "success":
                return run_id, attempt, "reused"
            if run.get("status") != "completed":
                active.append((run_id, attempt, "existing-run"))
        require(len(active) <= 1, "Multiple matching Actions runs in progress")
        return active[0] if active else None

    def dispatch(self, workflow, source):
        endpoint = f"{API}/actions/workflows/{workflow}/dispatches"
        try:
            result = obj(self.api(endpoint, payload={"ref": "main", "inputs": {"source_sha": source},
                                                     "return_run_details": True}))
            run_id = positive(result.get("workflow_run_id"))
            require(result.get("html_url") == f"https://github.com/{REPO}/actions/runs/{run_id}" and
                    result.get("run_url") == f"https://api.github.com/{API}/actions/runs/{run_id}", "Invalid run URL")
        except Refused:
            raise Refused("Dispatch outcome unknown. Inspect GitHub Actions before submitting again.") from None
        return run_id, 1, "dispatched"

    def resolve(self, workflow, source, run_id, attempt):
        run_path = f"{API}/actions/runs/{run_id}/attempts/{attempt}"
        deadline = time.monotonic() + RUN_WAIT
        while time.monotonic() < deadline:
            run = self.api(run_path, allow_missing=True)
            if run is not None:
                run = obj(run)
                number = self.run_identity(run, workflow, source, run_id, attempt)
                if run.get("status") == "completed":
                    require(run.get("conclusion") == "success", "Publish workflow did not succeed")
                    break
            time.sleep(min(5, max(0, deadline - time.monotonic())))
        else:
            raise Refused("Timed out waiting for the pinned Actions attempt")
        job_list = obj(self.api(run_path + "/jobs?per_page=100"))
        jobs = job_list.get("jobs")
        require(isinstance(jobs, list) and job_list.get("total_count") == len(jobs), "Incomplete Actions job list")
        publishers = [job for job in jobs if obj(job).get("name") == "publish"]
        require(len(publishers) == 1 and publishers[0].get("conclusion") == "success" and
                type(publishers[0].get("run_id")) is int and publishers[0]["run_id"] == run_id and
                type(publishers[0].get("run_attempt", attempt)) is int and publishers[0].get("run_attempt", attempt) == attempt,
                "The pinned attempt has no successful publish job")
        publisher = publishers[0]
        job_id = positive(publisher.get("id"))
        steps = publisher.get("steps")
        require(isinstance(steps, list), "Missing publish job steps")
        publish_steps = [step for step in steps if obj(step).get("name") == PUBLISH_STEP]
        require(len(publish_steps) == 1 and publish_steps[0].get("conclusion") == "success", "Missing successful publish step")
        step = positive(publish_steps[0].get("number"))
        logs = f"{API}/actions/jobs/{job_id}"
        log = self.api(f"{logs}/steps/{step}/logs", raw=True, allow_missing=True)
        if log is None:
            log = self.api(f"{logs}/logs", raw=True)
        build = f"actions-{run_id}-{attempt}"
        receipt = parse_receipt(log, source, build)
        artifact = receipt["artifactSha"]
        content = obj(self.api(f"{API}/contents/release.json?ref={artifact}"))
        require(content.get("encoding") == "base64" and content.get("path") == "release.json" and content.get("type") == "file",
                "Cannot read the pinned release.json")
        try:
            meta = obj(load_json(base64.b64decode("".join(content["content"].split()), validate=True)))
        except (KeyError, AttributeError, ValueError):
            raise Refused("Invalid pinned release.json encoding") from None
        expected = {"schemaVersion": 1, "repository": REPO, "sourceSha": source, "workflowSha": source,
                    "buildId": build, "runId": str(run_id), "runNumber": str(number), "runAttempt": str(attempt),
                    "runUrl": f"https://github.com/{REPO}/actions/runs/{run_id}", "basePath": "/penumbra/"}
        require(all(type(meta.get(k)) is type(v) and meta[k] == v for k, v in expected.items()) and
                all(type(meta.get(k)) is type(receipt[k]) and meta[k] == receipt[k] for k in ("fileCount", "sizeBytes", "distSha256")),
                "Published commit metadata does not match the Actions receipt")
        head = obj(obj(self.api(f"{API}/git/ref/heads/deploy")).get("object")).get("sha")
        require(matches(SHA, head), "Invalid deploy history head")
        if head != artifact:
            ancestor = obj(obj(self.api(f"{API}/compare/{artifact}...{head}")).get("merge_base_commit")).get("sha")
            require(ancestor == artifact, "Pinned artifact is not in deploy history")
        return receipt


def parse_receipt(log, source, build):
    # GitHub job logs prefix stdout lines with ISO timestamps. Match exactly one
    # contiguous publisher summary, never a substring or the deploy branch tip.
    require(log.endswith(b"\n"), "Empty or truncated Actions log")
    lines = re.sub(rb"(?m)^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z ", b"",
                   log.removeprefix(b"\xef\xbb\xbf")).replace(b"\r\n", b"\n")
    expected = (f"^Published {build}\\n\\n- Source SHA: `{source}`\\n- Workflow SHA: `{source}`\\n"
                r"- Artifact commit \(deploy\): `([0-9a-f]{40})`\n"
                r"- Static files: ([1-9][0-9]*); bytes: ([1-9][0-9]*)\n- Dist SHA-256: `([0-9a-f]{64})`$")
    # Some runners omit blank stdout lines or include a trailing space on them.
    expected = expected.replace(r"\n\n", r"\n(?:[ \t]*\n)?")
    found = re.findall(expected.encode(), lines, re.M)
    require(len(found) == 1 and len(re.findall(rb"^Published(?:[ \t]|$)", lines, re.M)) == 1,
            "Missing, conflicting or ambiguous publish receipt in the Actions log")
    artifact, files, size, digest = found[0]
    require(len(files) <= 5 and len(size) <= 10, "Invalid published inventory totals")
    return {"artifactSha": artifact.decode(), "sourceSha": source, "workflowSha": source, "buildId": build,
            "fileCount": int(files), "sizeBytes": int(size), "distSha256": digest.decode()}


class Remote:
    def __init__(self, ssh, args):
        path = PurePosixPath(args.helper)
        require(path.is_absolute() and ".." not in path.parts and str(path) == args.helper and
                re.fullmatch(r"/[A-Za-z0-9_./-]+", args.helper), "Invalid Ubuntu helper path")
        require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", args.ssh_host), "Use an OpenSSH host alias")
        self.argv = [ssh, "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "UpdateHostKeys=no",
                     "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=3",
                     "-o", "ClearAllForwardings=yes", "-o", "ForwardAgent=no", "-o", "ForwardX11=no",
                     "-o", "ControlMaster=no", "-o", "ControlPath=none", "-o", "PermitLocalCommand=no", args.ssh_host,
                     shlex.join(["/usr/bin/python3.12", "-I", "-B", args.helper])]
        # Git for Windows may check out CRLF. Python normalizes source newlines
        # when it reads the code, so bind both hosts to the same LF source.
        self.installer_hash = self.source_hash(HERE / "install.py")
        self.helper_hash = self.source_hash(HERE / "release_remote.py")

    @staticmethod
    def source_hash(path):
        return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()

    def call(self, action, release=None, *, timeout=None):
        request = {"version": 1, "action": action, "installerSha256": self.installer_hash,
                   "helperSha256": self.helper_hash}
        if release:
            request["release"] = release
        rc, data, _ = command(self.argv, timeout=timeout or (REMOTE_WAIT if action == "deploy" else 600),
                              data=(json.dumps(request) + "\n").encode(), keep_stdin=True)
        require(rc in (0, 2), "SSH session failed (check host key, agent and helper installation)")
        try:
            reply = clean_remote_reply(obj(load_json(data)))
        except Refused:
            raise Refused("Invalid Ubuntu helper response (check helper installation and version)") from None
        require(reply["ok"] == (rc == 0), "Ubuntu helper exit status does not match its response")
        return reply


REMOTE_ERRORS = {"host", "helper-version", "installer-version", "dependencies", "proxy-policy", "status",
                 "services", "concurrent-deploy", "production-changed", "entry-tls", "proxy-start", "proxy-exit",
                 "probe-tls", "probe-network", "probe-format", "verify", "verify-identity", "install",
                 "install-identity", "post-status", "cleanup", "interrupted", "internal", "request", "git-process"}
OPERATION = re.compile(r"[0-9a-f]{32}")
PENDING_PHASES = {"acquire": ("fetching", "exporting", "validated"),
                  "switch": ("prepared", "resources_ready", "switching", "index_switched")}
SERVICE_NAMES = ("aion-chat.service", "cloudflared.service", "trojan.service")


def clean_status(status):
    require(all(type(status.get(k)) is bool for k in ("consistent", "ready")), "Invalid installer status flags")
    consistent, ready = status["consistent"], status["ready"]
    clean = {"consistent": consistent, "ready": ready, "activeResourcesVerified": False}
    if status.get("reason") in ("git-residue", "lock-busy", "resource-conflict", "installer-refused"):
        clean["reason"] = status["reason"]
    if not consistent and not ready and "active" not in status and "pending" not in status:
        return clean  # The installer could not produce a snapshot (e.g. lock busy).
    pending = status.get("pending")
    require("active" in status and isinstance(pending, list) and all(
        isinstance(p, dict) and matches(OPERATION, p.get("id")) and p.get("kind") in ("acquire", "switch") and
        p.get("phase") in PENDING_PHASES[p["kind"]] for p in pending), "Invalid installer status snapshot")
    require(ready == (consistent and not pending), "Inconsistent installer readiness flags")
    active = status["active"]
    clean.update(active=identity(active, index=True) if active is not None else None,
                 pending=[{k: p[k] for k in ("id", "kind", "phase")} for p in pending])
    if consistent:
        expected_index = clean["active"]["indexSha256"] if active is not None else None
        require("actualIndexSha256" in status and status["actualIndexSha256"] == expected_index,
                "Installer status has no matching measured index")
        clean["actualIndexSha256"] = expected_index
        # install.py status hashes site/index.html and every required active resource
        # before returning consistent:true. Pending transactions affect ready only.
        clean["activeResourcesVerified"] = active is not None
    return clean


def clean_services(data):
    clean = {}
    for unit in SERVICE_NAMES:
        state = obj(data.get(unit))
        require(type(state.get("active")) is bool and
                all(type(state.get(k)) is int and state[k] >= 0 for k in ("pid", "restarts", "startMonotonic")),
                "Invalid service data")
        clean[unit] = {k: state[k] for k in ("active", "pid", "restarts", "startMonotonic")}
    return clean


def clean_remote_reply(data):
    require(type(data.get("version")) is int and data["version"] == 1 and type(data.get("ok")) is bool, "Invalid remote protocol")
    clean = {"ok": data["ok"]}
    if not clean["ok"]:
        error = data.get("error")
        require(isinstance(error, str) and error in REMOTE_ERRORS, "Unknown remote error")
        clean["error"] = error
    # A malformed optional snapshot must not erase a valid failure classification.
    for key, validate in (("before", clean_status), ("after", clean_status),
                          ("servicesBefore", clean_services), ("servicesAfter", clean_services)):
        if key in data:
            with contextlib.suppress(Refused):
                clean[key] = validate(obj(data[key]))
    for key in ("proxyPrerequisites", "proxyChecked"):
        if data.get(key) is True:
            clean[key] = True
    for key in ("proxyCleaned", "gitProcessesClear"):
        if type(data.get(key)) is bool:
            clean[key] = data[key]
    if data.get("installResult") in ("committed", "already-active"):
        clean["installResult"] = data["installResult"]
    if data.get("installState") in ("not-started", "unknown", "refused", "acknowledged"):
        clean["installState"] = data["installState"]
    if matches(OPERATION, data.get("operationId")):
        clean["operationId"] = data["operationId"]
    if matches(re.compile(r"[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}"), data.get("host")):
        clean["host"] = data["host"]
    if data.get("ubuntu") is True:
        clean["ubuntu"] = True
    return clean


def checked_remote(report, reply, action, release=None):
    report[action] = reply
    require(reply["ok"], f"Ubuntu helper blocked {action}: {reply.get('error')}")
    status = reply.get("after" if release else "before", {})
    require(status.get("ready") and status.get("consistent") and not status.get("pending"), "Ubuntu deployment status is not ready")
    services = reply.get("servicesAfter" if release else "servicesBefore", {})
    require(services and all(s["active"] and s["pid"] > 0 for s in services.values()), "A production service is not active")
    if release:
        active = status.get("active")
        require(active is not None and identity(active) == identity(release), "Active identity differs from pinned release")
        require(reply.get("proxyChecked") and reply.get("proxyCleaned") and reply.get("installState") == "acknowledged" and
                (reply.get("installResult") == "already-active" or
                 reply.get("installResult") == "committed" and reply.get("operationId")) and
                services == reply.get("servicesBefore"), "Deployment or proxy cleanup could not be confirmed")


def reconcile_deployment(args, report):
    deployment = report.get("deployment", {})
    confirmed = bool(deployment.get("after", {}).get("consistent") and deployment.get("servicesAfter"))
    if not confirmed:
        # One bounded read only. Never resend a production operation after an ambiguous exit.
        try:
            reply = Remote(executable("ssh"), args).call("status", timeout=RECONCILE_WAIT)
            report["statusAfterUncertainExit"] = reply
            confirmed = bool(reply.get("before", {}).get("consistent") and reply.get("servicesBefore"))
        except (Exception, KeyboardInterrupt):
            report["statusAfterUncertainExit"] = "unavailable"
    report["productionStateConfirmed"] = confirmed
    if not confirmed:
        report["deploymentOutcome"] = "unknown-result-state-unknown"
    elif deployment.get("installState") in ("not-started", "refused", "acknowledged"):
        report["deploymentOutcome"] = "failed-state-confirmed"
    else:
        report["deploymentOutcome"] = "unknown-result-status-obtained"
    report["nextAction"] = "Check status and the Ubuntu transaction before retrying."


def interrupted(_sig, _frame):
    raise Interrupted


def run(args, report):
    ssh = executable("ssh")
    remote = Remote(ssh, args)
    if args.action == "status":
        checked_remote(report, remote.call("status"), "status")
        return
    source = local_git(executable("git"), report)
    gh = GitHub(executable("gh"))
    gh.auth()
    report["githubAuthenticated"] = True
    report["remoteMain"] = gh.main_sha()
    require(report["remoteMain"] == source, "Local HEAD is not the current GitHub main tip")
    workflow = gh.workflow()
    report["workflowId"] = workflow
    checked_remote(report, remote.call("check"), "preflight")
    selection = gh.candidates(workflow, source)
    if selection:
        run_id, attempt, origin = selection
        report["actions"] = {"runId": run_id, "attempt": attempt, "selection": origin}
    else:
        report["actions"] = {"selection": "no-matching-run"}
    if args.action == "check" or args.dry_run:
        if selection and selection[2] == "reused":
            report["release"] = gh.resolve(workflow, source, *selection[:2])
        if args.action == "deploy":
            report["plan"] = [selection[2] if selection else "dispatch", "verify-published-identity", "start-isolated-proxy",
                              "verify", "install", "status", "cleanup"]
        return
    if selection is None:
        require(gh.main_sha() == source, "GitHub main advanced before dispatch")
        report["actions"] = {"selection": "dispatch-outcome-unknown"}
        run_id, attempt, origin = gh.dispatch(workflow, source)
        report["actions"] = {"runId": run_id, "attempt": attempt, "selection": origin}
    release = gh.resolve(workflow, source, run_id, attempt)
    report["release"] = release
    require(gh.main_sha() == source, "GitHub main advanced while preparing the release")
    # Avoid a different deployment overtaking this one while Actions was running.
    release_request = {**release, "previousActive": report["preflight"]["before"]["active"]}
    report["productionRequestSent"] = True
    checked_remote(report, remote.call("deploy", release_request), "deployment", release)
    report.update(deploymentOutcome="confirmed-success", productionStateConfirmed=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    for action in ("check", "deploy", "status"):
        cmd = sub.add_parser(action)
        cmd.add_argument("--ssh-host", default="aion-prod", help="Existing OpenSSH host alias")
        cmd.add_argument("--helper", default="/home/ubuntu/penumbra-tools/release_remote.py")
        if action == "deploy":
            cmd.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    report = {"action": args.action, "dryRun": getattr(args, "dry_run", False),
              "startedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "ok": False}
    code = 2
    with interrupts(interrupted):
        try:
            require(sys.version_info >= (3, 12), "Python 3.12 or later is required")
            run(args, report)
            report["ok"], code = True, 0
        except (Interrupted, KeyboardInterrupt):
            report["error"], code = "Interrupted", 130
        except TimeoutError:
            report["error"] = "Command timed out"
        except Refused as exc:
            report["error"] = str(exc)
        except Exception:
            report["error"] = "Local inspection or response processing failed"
        if code and report.get("productionRequestSent"):
            reconcile_deployment(args, report)
        elif code and report.get("actions", {}).get("selection") == "dispatch-outcome-unknown":
            report["nextAction"] = "Inspect GitHub Actions before submitting again."
    report["finishedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
    print(json.dumps(report, indent=2))
    return code


if __name__ == "__main__":
    sys.exit(main())
