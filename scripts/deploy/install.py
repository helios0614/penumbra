#!/usr/bin/env python3
"""Pinned Penumbra static releases. Python 3.12+, stdlib, no backend imports.

All mutations require an exclusive flock. Managed directories must belong to
the operator and must not be writable by other users. The lock coordinates
this tool; it cannot protect against another process running as the same user.
"""

import argparse
import configparser
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import uuid
from dataclasses import dataclass


REPOSITORY = "helios0614/penumbra"
REMOTE = f"https://github.com/{REPOSITORY}.git"
BASE = "/penumbra/"
FIRST_SHA = "90cb2398612947ac0793c363d9ea29dee7e1306a"
FIRST = {
    "sourceSha": "6a40bceaf8f659652409108e88f4176cf0476c5c",
    "workflowSha": "6a40bceaf8f659652409108e88f4176cf0476c5c",
    "buildId": "actions-41391367799-1",
    "fileCount": 71,
    "sizeBytes": 55916553,
    "distSha256": "09b9b7b063a2de53dd7728e8cdfea08ae183450d8ea5cb865943036a1e72fcad",
}
SHA = re.compile(r"[0-9a-f]{40}")
HASH = re.compile(r"[0-9a-f]{64}")
NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]*")
OP = re.compile(r"[0-9a-f]{32}")
TERMINAL = {"verified", "committed", "aborted"}
ACQUIRE_PHASES = {"fetching", "exporting", "validated", "verified", "aborted"}
SWITCH_PHASES = {"prepared", "resources_ready", "switching", "index_switched", "committed", "aborted"}
MAX_FILES = 10000
MAX_BYTES = 1024 * 1024 * 1024
MAX_FILE = 128 * 1024 * 1024


class DeployError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise DeployError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def blob_hash(data):
    return object_hash("blob", data)


def object_hash(kind, data):
    return hashlib.sha1(kind.encode() + b" " + str(len(data)).encode() + b"\0" + data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=True, indent=2) + "\n").encode()


def decoded(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, f"Duplicate JSON key: {key}")
            result[key] = value
        return result
    try:
        return json.loads(data, object_pairs_hook=unique)
    except (ValueError, UnicodeError) as exc:
        raise DeployError("Invalid JSON") from exc


def safe_path(path):
    require(isinstance(path, str) and bool(path), "Empty path")
    parts = path.split("/")
    require(all(NAME.fullmatch(p) and p not in {".", ".."} for p in parts),
            f"Unsafe path: {path!r}")
    return parts


def allowed(path):
    # Same final-publication allowlist as artifact.cjs; parity is tested using
    # that actual packager, rather than executing JS on the Ubuntu server.
    if re.search(r"(^|/|[.-])(test|tests|spec|specs)([./-]|$)", path, re.I):
        return False
    return (path == "index.html"
            or re.fullmatch(r"assets/[A-Za-z0-9_.-]+\.(js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|gif|avif|ico)", path)
            or re.fullmatch(r"fonts/cormorant-garamond/(CormorantGaramond-(Regular|Italic)-latin\.woff2|OFL\.txt)", path))


@dataclass(frozen=True)
class Expected:
    artifact: str
    source: str
    workflow: str
    build: str

    def __post_init__(self):
        for name in ("artifact", "source", "workflow"):
            value = getattr(self, name)
            require(isinstance(value, str) and bool(SHA.fullmatch(value)), f"{name} must be a full lowercase commit SHA")
        require(isinstance(self.build, str) and bool(re.fullmatch(r"actions-[1-9][0-9]*-[1-9][0-9]*", self.build)), "Invalid build ID")
        if self.artifact == FIRST_SHA:
            require((self.source, self.workflow, self.build) ==
                    (FIRST["sourceSha"], FIRST["workflowSha"], FIRST["buildId"]),
                    "First release expectations differ from approved identity")

    def json(self):
        return {"artifact": self.artifact, "source": self.source,
                "workflow": self.workflow, "build": self.build}


def validate_identity(value):
    require(isinstance(value, dict) and set(value) == {
        "artifactSha", "sourceSha", "workflowSha", "buildId", "indexSha256"}, "Incomplete version identity")
    Expected(value["artifactSha"], value["sourceSha"], value["workflowSha"], value["buildId"])
    require(isinstance(value["indexSha256"], str) and HASH.fullmatch(value["indexSha256"]), "Invalid index hash")


def validate_record(record, operation_id=None):
    require(isinstance(record, dict) and type(record.get("schemaVersion")) is int
            and record["schemaVersion"] == 1, "Invalid transaction schema")
    require(isinstance(record.get("id"), str) and OP.fullmatch(record["id"])
            and (operation_id is None or record["id"] == operation_id), "Invalid transaction ID")
    kind, phase = record.get("kind"), record.get("phase")
    require(isinstance(kind, str) and kind in {"acquire", "switch"}, "Invalid transaction kind")
    require(isinstance(phase, str) and phase in (ACQUIRE_PHASES if kind == "acquire" else SWITCH_PHASES),
            "Phase does not belong to transaction kind")
    common = {"schemaVersion", "id", "kind", "phase", "createdAt", "updatedAt"}
    require(set(record) == common | ({"expected"} if kind == "acquire" else {"before", "target", "action"}),
            "Incomplete or unknown transaction fields")
    times = []
    for key in ("createdAt", "updatedAt"):
        require(isinstance(record[key], str), "Invalid transaction timestamp")
        try:
            timestamp = dt.datetime.fromisoformat(record[key])
        except ValueError as exc:
            raise DeployError("Invalid transaction timestamp") from exc
        require(timestamp.utcoffset() == dt.timedelta(0), "Transaction timestamps must be UTC")
        times.append(timestamp)
    require(times[0] <= times[1], "Transaction timestamps are reversed")
    if kind == "acquire":
        expected = record["expected"]
        require(isinstance(expected, dict) and set(expected) == {"artifact", "source", "workflow", "build"},
                "Incomplete acquisition identity")
        Expected(**expected)
    else:
        for pointer in (record["before"], record["target"]):
            if pointer is not None:
                validate_identity(pointer)
        require(record["before"] != record["target"], "Switch has no version change")
        action = record["action"]
        require(isinstance(action, str) and action in {"install", "rollback", "undeploy"}, "Invalid switch action")
        require((action == "undeploy") == (record["target"] is None), "Switch action and target differ")


class Store:
    """Root-anchored, no-follow filesystem operations (including all parents)."""

    def __init__(self, root, create=False):
        path = Path(root)
        require(path.is_absolute() and ".." not in path.parts, "--root must be an absolute path without '..'")
        self.path = path
        parent = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
        try:
            for i, part in enumerate(path.parts[1:]):
                last = i == len(path.parts[1:]) - 1
                try:
                    child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                except FileNotFoundError:
                    require(last and create, "Root parent/root does not exist")
                    os.mkdir(part, 0o750, dir_fd=parent)
                    os.fsync(parent)
                    child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                os.close(parent)
                parent = child
            self.fd = parent
            self.device = os.fstat(self.fd).st_dev
            self.lock_fd = None
            self.check_dir(self.fd)
        except BaseException:
            os.close(parent)
            raise

    def close(self):
        os.close(self.fd)

    def check_dir(self, fd):
        s = os.fstat(fd)
        require(s.st_dev == self.device and s.st_uid == os.geteuid()
                and not s.st_mode & 0o022, "Managed directory has unsafe owner, permissions or filesystem")

    @contextlib.contextmanager
    def directory(self, path="", create=False):
        fd = os.dup(self.fd)
        try:
            for part in safe_path(path) if path else []:
                try:
                    child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                except FileNotFoundError:
                    if not create:
                        raise
                    os.mkdir(part, 0o750, dir_fd=fd)
                    os.fsync(fd)
                    child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                self.check_dir(child)
                os.close(fd)
                fd = child
            yield fd
        finally:
            os.close(fd)

    @contextlib.contextmanager
    def parent(self, path, create=False):
        parts = safe_path(path)
        with self.directory("/".join(parts[:-1]), create) as fd:
            yield fd, parts[-1]

    def info(self, path):
        try:
            with self.parent(path) as (fd, name):
                s = os.stat(name, dir_fd=fd, follow_symlinks=False)
                require(not stat.S_ISLNK(s.st_mode), f"Symbolic link: {path}")
                require(s.st_dev == self.device and s.st_uid == os.geteuid()
                        and not s.st_mode & 0o022, f"Unsafe file permissions/owner: {path}")
                return s
        except FileNotFoundError:
            return None

    def read(self, path, limit=MAX_FILE):
        with self.parent(path) as (parent, name):
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
            try:
                s = os.fstat(fd)
                require(stat.S_ISREG(s.st_mode) and s.st_dev == self.device
                        and s.st_uid == os.geteuid() and not s.st_mode & 0o022,
                        f"Unsafe regular file: {path}")
                require(s.st_size <= limit, f"File too large: {path}")
                with os.fdopen(fd, "rb", closefd=False) as stream:
                    data = stream.read(limit + 1)
                require(len(data) <= limit, f"File grew beyond limit: {path}")
                return data
            finally:
                os.close(fd)

    def write_new(self, path, data):
        with self.parent(path, True) as (parent, name):
            fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640, dir_fd=parent)
            with os.fdopen(fd, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.fsync(parent)

    def move(self, source, target, replace=False):
        source_info = self.info(source)
        require(source_info is not None, f"Missing source: {source}")
        target_info = self.info(target)
        require(replace or target_info is None, f"Destination exists: {target}")
        if target_info:
            require(stat.S_ISREG(source_info.st_mode) and stat.S_ISREG(target_info.st_mode), "Refusing non-file replacement")
        with self.parent(source) as (sf, sn), self.parent(target, True) as (tf, tn):
            os.replace(sn, tn, src_dir_fd=sf, dst_dir_fd=tf)
            os.fsync(tf)
            os.fsync(sf)

    def atomic(self, path, data):
        temporary = f"staging/write-{uuid.uuid4().hex}"
        self.write_new(temporary, data)
        self.move(temporary, path, replace=True)

    def publish_resource(self, path, data):
        temporary = f"staging/resource-{uuid.uuid4().hex}"
        self.write_new(temporary, data)
        # link is atomic and refuses an existing destination. A kill between
        # link/unlink leaves two safe names for the SAME complete file.
        with self.parent(temporary) as (sf, sn), self.parent(path, True) as (tf, tn):
            os.link(sn, tn, src_dir_fd=sf, dst_dir_fd=tf, follow_symlinks=False)
            os.fsync(tf)
            os.unlink(sn, dir_fd=sf)
            os.fsync(sf)

    def walk(self, path):
        result, directories = [], []
        def visit(relative):
            with self.directory(relative) as fd:
                for name in sorted(os.listdir(fd)):
                    # Internal Git/staging names can start with a dot, but no
                    # control characters, separators or special entries.
                    require(bool(re.fullmatch(r"[A-Za-z0-9_.-]+", name)) and name not in {".", ".."}, "Unsafe directory entry")
                    child = relative + "/" + name
                    s = self.info(child)
                    if stat.S_ISDIR(s.st_mode):
                        directories.append(child[len(path) + 1:])
                        visit(child)
                    else:
                        require(stat.S_ISREG(s.st_mode), f"Non-regular file: {child}")
                        result.append(child[len(path) + 1:])
        visit(path)
        return sorted(result), sorted(directories)

    @contextlib.contextmanager
    def lock(self, mutate):
        flags = os.O_NOFOLLOW | os.O_NONBLOCK | (os.O_RDWR | os.O_CREAT if mutate else os.O_RDONLY)
        try:
            fd = os.open("deploy.lock", flags, 0o640, dir_fd=self.fd)
        except FileNotFoundError:
            require(not os.listdir(self.fd), "Uninitialized root contains files but no deployment lock")
            yield
            return
        try:
            require(stat.S_ISREG(os.fstat(fd).st_mode), "Invalid deploy.lock")
            self.info("deploy.lock")
            try:
                fcntl.flock(fd, (fcntl.LOCK_EX if mutate else fcntl.LOCK_SH) | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise DeployError("Deployment lock is busy") from exc
            if mutate:
                os.fsync(self.fd)
            self.lock_fd = fd
            yield
        finally:
            self.lock_fd = None
            os.close(fd)


def expected_directories(files):
    return sorted({"/".join(p.split("/")[:i]) for p in files for i in range(1, len(p.split("/")))})


class Installer:
    def __init__(self, root, *, transport=REMOTE, checkpoint=None):
        self.root = str(root)
        # Only the Python test API accepts a local simulated remote. The CLI
        # always uses REMOTE and cannot redirect approval to an arbitrary URL.
        require(transport == REMOTE or Path(transport).is_absolute(), "Invalid transport")
        self.transport = str(transport)
        self.checkpoint = checkpoint or (lambda name: None)
        self.git_path = "repository.git"
        self.git_executable = shutil.which("git")
        require(self.git_executable is not None, "Git is required")
        self.git_executable = os.path.abspath(self.git_executable)

    @contextlib.contextmanager
    def session(self, mutate=True):
        store = Store(self.root, create=mutate)
        self.fs = store
        try:
            with store.lock(mutate):
                allowed_root = {"repository.git", "staging", "releases", "records", "site", "current.json", "deploy.lock"}
                require(set(os.listdir(store.fd)) <= allowed_root, "Unknown entries in deployment root")
                for name in ("staging", "releases", "records", "site"):
                    if mutate:
                        with store.directory(name, True):
                            pass
                if store.info("repository.git"):
                    store.walk("repository.git")
                yield
        finally:
            store.close()

    def git(self, *args):
        env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        for key in ("PWD", "OLDPWD", "CDPATH"):
            env.pop(key, None)
        env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_SYSTEM="/dev/null", GIT_CONFIG_GLOBAL="/dev/null",
                   GIT_TERMINAL_PROMPT="0", GIT_NO_REPLACE_OBJECTS="1")
        options = ["-c", "core.hooksPath=/dev/null", "-c", "gc.auto=0",
                   "-c", "core.fsync=all",
                   "-c", "fetch.fsckObjects=true", "-c", "transfer.fsckObjects=true",
                   "-c", "credential.helper=", "-c", "core.askPass=", "-c", "protocol.allow=never",
                   "-c", "protocol.https.allow=always", "-c", "http.followRedirects=false"]
        if self.transport != REMOTE:
            options += ["-c", "protocol.file.allow=always"]  # Python test API only.
        try:
            with self.fs.directory(self.git_path) as repo_fd:
                inherited = (repo_fd,) + ((self.fs.lock_fd,) if self.fs.lock_fd is not None else ())
                if sys.platform == "linux":
                    # Bare Git keeps this explicit path (no init/checkout).
                    # The fd remains open across exec and Git helper processes.
                    anchor = f"/proc/self/fd/{repo_fd}"
                    visible, opened = os.stat(anchor), os.fstat(repo_fd)
                    require((visible.st_dev, visible.st_ino) == (opened.st_dev, opened.st_ino),
                            "procfs directory handles unavailable")
                    command = [self.git_executable, "--git-dir=" + anchor, *options, *args]
                    cwd = anchor
                elif sys.platform == "darwin":
                    # macOS /dev/fd cannot traverse directories. A tiny isolated
                    # launcher fchdir's the inherited handle before exec; no
                    # preexec_fn, parent chdir, shell, or original root path.
                    anchor = "."
                    launcher = "import os,sys;os.fchdir(int(sys.argv[1]));os.execv(sys.argv[2],sys.argv[2:])"
                    command = [sys.executable, "-I", "-S", "-B", "-c", launcher, str(repo_fd),
                               self.git_executable, "--git-dir=.", *options, *args]
                    cwd = None
                else:
                    raise DeployError("Directory-bound Git requires Linux or macOS")
                # No GIT_COMMON_DIR: it changes Git's bare/worktree semantics.
                # With no commondir/alternates file, the explicit bare gitdir
                # is also the common/object root. Keep temp files there too.
                env.update(TMPDIR=anchor, TMP=anchor, TEMP=anchor)
                return subprocess.run(command, cwd=cwd, pass_fds=inherited, env=env, check=True,
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300, umask=0o027).stdout
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise DeployError(f"Git operation failed: {args[0]}; inspect repository locks before recovery") from exc

    @contextlib.contextmanager
    def repository_at(self, path):
        previous = self.git_path
        self.git_path = path
        try:
            yield
        finally:
            self.git_path = previous

    def repository_ready(self, path="repository.git"):
        if self.fs.info(path) is None:
            return False
        files, _ = self.fs.walk(path)
        require(not any(p.endswith(".lock") or Path(p).name.startswith(("tmp_", ".tmp")) for p in files),
                "Repository contains interrupted Git locks/temporary files; manual investigation required")
        require(not {"commondir", "gitdir", "objects/info/alternates", "objects/info/http-alternates"}.intersection(files),
                "External repository indirection is forbidden")
        require({"HEAD", "config"} <= set(files), "Incomplete repository.git; preserve it for manual investigation")
        config = configparser.RawConfigParser(strict=True)
        try:
            config.read_string(self.fs.read(path + "/config").decode("utf-8"))
        except (configparser.Error, UnicodeError) as exc:
            raise DeployError("Invalid repository configuration; manual investigation required") from exc
        require(not config.defaults() and config.sections() == ["core"], "Unexpected repository configuration")
        require(set(config["core"]) <= {"repositoryformatversion", "bare", "filemode", "logallrefupdates",
                                        "ignorecase", "precomposeunicode"}, "Unsafe repository configuration")
        require(config["core"].get("repositoryformatversion") == "0" and config["core"].get("bare") == "true",
                "Repository is not a SHA-1 bare v0 store")
        head = self.fs.read(path + "/HEAD").decode("ascii").strip()
        if head.startswith("ref: "):
            require(head.startswith("ref: refs/heads/"), "Unexpected repository HEAD")
            safe_path(head[5:])
        else:
            require(bool(SHA.fullmatch(head)), "Invalid repository HEAD")
        for directory in ("objects", "refs"):
            with self.fs.directory(path + "/" + directory):
                pass
        with self.repository_at(path):
            require(self.git("rev-parse", "--is-bare-repository").strip() == b"true", "Object store is not bare")
            require(self.git("rev-parse", "--show-object-format").strip() == b"sha1", "Unexpected Git object format")
        return True

    def initialize_repository(self, record):
        if self.repository_ready():
            return
        stage = f"staging/{record['id']}/repository.git"
        require(self.fs.info(stage) is None, "Initialization staging already exists")
        # git init canonicalizes its destination internally. Build only the
        # documented bare SHA-1 v0 skeleton with fd-relative writes instead,
        # then let REAL Git validate it before publication. No worktree/index.
        self.fs.write_new(stage + "/config", b"[core]\nrepositoryformatversion = 0\nbare = true\nfilemode = true\n")
        self.checkpoint("during_repository_init")
        self.fs.write_new(stage + "/HEAD", b"ref: refs/heads/unused\n")
        for name in ("objects/info", "objects/pack", "refs/heads", "refs/tags"):
            with self.fs.directory(stage + "/" + name, True):
                pass
        self.repository_ready(stage)
        self.checkpoint("before_repository_publish")
        self.fs.move(stage, "repository.git")
        self.checkpoint("after_repository_publish")

    def tree(self, sha):
        require(bool(SHA.fullmatch(sha)), "Invalid artifact SHA")
        require(self.git("cat-file", "-t", sha).strip() == b"commit", "Artifact is not a commit")
        require(self.git("rev-parse", "--verify", sha + "^{commit}").decode().strip() == sha, "Artifact commit differs")
        commit = self.git("cat-file", "commit", sha)
        require(object_hash("commit", commit) == sha, "Commit object hash differs")
        root_tree = commit.split(b"\n", 1)[0].decode().removeprefix("tree ")
        require(bool(SHA.fullmatch(root_tree)), "Invalid commit tree")
        require(object_hash("tree", self.git("cat-file", "tree", root_tree)) == root_tree, "Root tree object hash differs")
        files, directories = {}, []
        for row in self.git("ls-tree", "-r", "-t", "-z", sha).split(b"\0"):
            if not row:
                continue
            header, raw = row.split(b"\t", 1)
            try:
                path = raw.decode("ascii")
            except UnicodeError as exc:
                raise DeployError("Non-ASCII artifact path") from exc
            safe_path(path)
            mode, kind, oid = header.decode().split()
            require(path not in files and path not in directories, "Duplicate Git path")
            if kind == "tree" and mode == "040000":
                require(object_hash("tree", self.git("cat-file", "tree", oid)) == oid, "Tree object hash differs")
                directories.append(path)
                continue
            require(kind == "blob" and mode == "100644", f"Forbidden Git mode: {mode} {path}")
            require(path in {"release.json", "SHA256SUMS"} or path.startswith("dist/") and allowed(path[5:]),
                    f"Unexpected artifact file: {path}")
            size = int(self.git("cat-file", "-s", oid).strip())
            require(size <= MAX_FILE, "Git blob too large")
            files[path] = (oid, size)
        require(0 < len(files) <= MAX_FILES and sum(v[1] for v in files.values()) <= MAX_BYTES, "Artifact exceeds limits")
        require(sorted(directories) == expected_directories(files), "Unexpected/empty Git directories")
        require({"release.json", "SHA256SUMS", "dist/index.html"} <= files.keys(), "Incomplete Git tree")
        return files

    def validate(self, prefix, expected):
        tree = self.tree(expected.artifact)
        names, directories = self.fs.walk(prefix)
        require(names == sorted(tree) and directories == expected_directories(tree), "Release file set differs from commit")
        bodies = {}
        for path, (oid, size) in tree.items():
            data = self.fs.read(prefix + "/" + path)
            require(len(data) == size and blob_hash(data) == oid, f"Release differs from Git blob: {path}")
            bodies[path] = data
        metadata = decoded(bodies["release.json"])
        require(isinstance(metadata, dict), "Invalid release metadata")
        for key, value in {"schemaVersion": 1, "repository": REPOSITORY, "sourceSha": expected.source,
                           "workflowSha": expected.workflow, "buildId": expected.build, "basePath": BASE}.items():
            require(type(metadata.get(key)) is type(value) and metadata[key] == value, f"Unexpected {key}")
        for key in ("runId", "runNumber", "runAttempt"):
            require(isinstance(metadata.get(key), str) and re.fullmatch(r"[1-9][0-9]*", metadata[key]), f"Invalid {key}")
        require(expected.build == f"actions-{metadata['runId']}-{metadata['runAttempt']}", "Build/run mismatch")
        require(metadata.get("runUrl") == f"https://github.com/{REPOSITORY}/actions/runs/{metadata['runId']}", "Unexpected runUrl")
        require(isinstance(metadata.get("nodeVersion"), str) and re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+", metadata["nodeVersion"]), "Invalid nodeVersion")
        try:
            built = dt.datetime.fromisoformat(metadata["builtAt"])
            require(built.utcoffset() == dt.timedelta(0), "builtAt must be UTC")
        except (KeyError, TypeError, ValueError) as exc:
            raise DeployError("Invalid builtAt") from exc
        exclusions = metadata.get("excludedFiles")
        require(isinstance(exclusions, list) and all(isinstance(x, str) for x in exclusions)
                and exclusions == sorted(set(exclusions)) and ".vite/manifest.json" in exclusions
                and set(exclusions) <= {".vite/manifest.json", "fonts/cormorant-garamond/SOURCE.md"}, "Invalid excludedFiles")
        files = [{"path": p, "sizeBytes": len(bodies[p]), "sha256": digest(bodies[p])}
                 for p in sorted(tree) if p.startswith("dist/")]
        require(metadata.get("files") == files, "File hashes, sizes or order differ")
        # bool must not silently pass as an integer in Python's dict equality.
        require(all(type(x.get("sizeBytes")) is int for x in metadata["files"]), "Invalid file size type")
        for key, value in {"fileCount": len(files), "sizeBytes": sum(x["sizeBytes"] for x in files)}.items():
            require(type(metadata.get(key)) is int and metadata[key] == value, f"Unexpected {key}")
        sums = "".join(f"{f['sha256']}  {f['path']}\n" for f in files).encode()
        require(metadata.get("distSha256") == digest(sums), "Unexpected distSha256")
        require(bodies["SHA256SUMS"] == sums + f"{digest(bodies['release.json'])}  release.json\n".encode(), "SHA256SUMS differs")
        validation = metadata.get("productionValidation")
        require(isinstance(validation, dict) and validation.get("developmentPagesExcluded") is True,
                "Missing production validation")
        require(validation.get("fileCount") == len(files) and validation.get("sizeBytes") == metadata["sizeBytes"], "Validation totals differ")
        manifest = validation.get("manifest")
        require(isinstance(manifest, dict) and all(type(manifest.get(k)) is int and manifest[k] >= 0
                for k in ("entries", "imports", "dynamicImports", "css", "assets"))
                and manifest["entries"] > 0 and type(validation.get("staticUrls")) is int
                and validation["staticUrls"] > 0, "Invalid production validation")
        if expected.artifact == FIRST_SHA:
            require(all(metadata.get(k) == v for k, v in FIRST.items()), "Approved first release differs")
        return metadata

    def record(self, record, phase):
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        record.setdefault("createdAt", now)
        record["updatedAt"] = now
        record["phase"] = phase
        validate_record(record)
        self.fs.atomic(f"records/{record['id']}.json", encoded(record))

    def records(self):
        if self.fs.info("records") is None:
            return []
        files, dirs = self.fs.walk("records")
        require(not dirs, "Unexpected records directory")
        records = []
        for filename in files:
            require(filename.endswith(".json") and OP.fullmatch(filename[:-5]), "Unknown transaction record")
            record = decoded(self.fs.read("records/" + filename))
            validate_record(record, filename[:-5])
            records.append(record)
        return records

    def no_pending(self):
        require(all(r["phase"] in TERMINAL for r in self.records()), "Unfinished transaction; run recover first")

    def acquire(self, expected):
        prefix = "releases/" + expected.artifact
        if self.fs.info(prefix):
            return self.validate(prefix, expected)
        record = {"schemaVersion": 1, "id": uuid.uuid4().hex, "kind": "acquire", "expected": expected.json()}
        self.record(record, "fetching")
        try:
            self.initialize_repository(record)
            self.git("fetch", "--no-tags", "--no-write-fetch-head", "--no-recurse-submodules", self.transport, expected.artifact)
            self.checkpoint("after_fetch")
            tree = self.tree(expected.artifact)
            ref = "refs/penumbra/artifacts/" + expected.artifact
            existing = self.git("for-each-ref", "--format=%(refname) %(objectname)", ref).decode().strip()
            require(existing in {"", ref + " " + expected.artifact}, "Artifact retention ref differs")
            self.git("update-ref", "--no-deref", ref, expected.artifact,
                     expected.artifact if existing else "0" * 40)
            self.record(record, "exporting")
            stage = f"staging/{record['id']}/payload"
            for path, (oid, size) in tree.items():
                data = self.git("cat-file", "blob", oid)
                require(len(data) == size and blob_hash(data) == oid, "Exported Git blob differs")
                self.fs.write_new(stage + "/" + path, data)
                self.checkpoint("after_export_file")
            metadata = self.validate(stage, expected)
            self.record(record, "validated")
            self.checkpoint("after_validation")
            self.fs.move(stage, prefix)
            self.record(record, "verified")
            return metadata
        except Exception:
            # Acquisition never touches site/current. Retain partial staging.
            self.record(record, "aborted")
            raise

    @staticmethod
    def identity(sha, metadata):
        return {"artifactSha": sha, "sourceSha": metadata["sourceSha"], "workflowSha": metadata["workflowSha"],
                "buildId": metadata["buildId"], "indexSha256": next(x["sha256"] for x in metadata["files"] if x["path"] == "dist/index.html")}

    def catalogue(self):
        releases, resources = {}, {}
        with self.fs.directory("releases") as fd:
            shas = sorted(os.listdir(fd))
        for sha in shas:
            require(bool(SHA.fullmatch(sha)), "Unknown release directory")
            prefix = "releases/" + sha
            metadata = decoded(self.fs.read(prefix + "/release.json"))
            require(isinstance(metadata, dict), "Invalid retained release")
            exp = Expected(sha, metadata.get("sourceSha", ""), metadata.get("workflowSha", ""), metadata.get("buildId", ""))
            metadata = self.validate(prefix, exp)  # Rebind ALL retained bytes to the pinned Git tree.
            releases[sha] = self.identity(sha, metadata)
            for file in metadata["files"]:
                path = file["path"][5:]
                if path != "index.html":
                    resources.setdefault(path, set()).add(file["sha256"])
        return releases, resources

    def current(self, releases):
        if self.fs.info("current.json") is None:
            return None
        value = decoded(self.fs.read("current.json"))
        require(isinstance(value, dict) and value.get("schemaVersion") == 1 and "active" in value, "Invalid current.json")
        active = value["active"]
        require(active is None or isinstance(active, dict) and active == releases.get(active.get("artifactSha")), "Current identity differs from retained release")
        return active

    def index_hash(self):
        return digest(self.fs.read("site/index.html")) if self.fs.info("site/index.html") else None

    def check_site(self, resources):
        files, dirs = self.fs.walk("site")
        require(set(dirs) <= set(expected_directories(resources)), "Unknown directories in site")
        for path in files:
            if path == "index.html":
                continue
            require(path in resources, f"Unknown site file: {path}")
            require(digest(self.fs.read("site/" + path)) in resources[path], f"Site resource differs: {path}")

    def target_resources(self, target, *, missing=False):
        if target is None:
            return
        metadata = decoded(self.fs.read(f"releases/{target['artifactSha']}/release.json"))
        for file in metadata["files"]:
            path = file["path"][5:]
            if path == "index.html":
                continue
            exists = self.fs.info("site/" + path)
            require(exists is not None or missing, f"Missing site resource: {path}")
            if exists:
                require(digest(self.fs.read("site/" + path)) == file["sha256"], f"Resource path conflict: {path}")

    def consistent(self, active):
        require(self.index_hash() == (active["indexSha256"] if active else None), "current.json and actual index differ; run recover")
        self.target_resources(active)

    def write_current(self, active):
        self.fs.atomic("current.json", encoded({"schemaVersion": 1, "active": active}))

    def restore(self, record):
        releases, resources = self.catalogue()
        before, target = record["before"], record["target"]
        for pointer in (before, target):
            require(pointer is None or isinstance(pointer, dict) and pointer == releases.get(pointer.get("artifactSha")), "Invalid recovery identity")
        self.check_site(resources)
        self.target_resources(before)
        require(self.current(releases) in (before, target), "Unexpected current state during recovery")
        old_hash = before["indexSha256"] if before else None
        new_hash = target["indexSha256"] if target else None
        require(self.index_hash() in (old_hash, new_hash), "Unknown active index; refusing recovery overwrite")
        if before:
            backup = self.fs.read(f"staging/{record['id']}/old-index.html")
            require(digest(backup) == old_hash, "Recovery backup differs")
            self.fs.atomic("site/index.html", backup)
        elif self.fs.info("site/index.html"):
            self.fs.move("site/index.html", f"staging/{record['id']}/withdrawn-{uuid.uuid4().hex}.html")
        self.write_current(before)
        self.consistent(before)
        self.record(record, "aborted")

    def switch(self, target, *, rollback=False):
        releases, resources = self.catalogue()
        before = self.current(releases)
        self.check_site(resources)
        self.consistent(before)
        self.target_resources(target, missing=not rollback)
        if before == target:
            return {"active": before, "result": "already-active"}
        record = {"schemaVersion": 1, "id": uuid.uuid4().hex, "kind": "switch", "before": before, "target": target,
                  "action": "undeploy" if target is None else "rollback" if rollback else "install"}
        stage = f"staging/{record['id']}"
        if before:
            self.fs.write_new(stage + "/old-index.html", self.fs.read("site/index.html"))
        if target:
            self.fs.write_new(stage + "/next-index.html", self.fs.read(f"releases/{target['artifactSha']}/dist/index.html"))
        self.record(record, "prepared")
        try:
            if target:
                prefix = f"releases/{target['artifactSha']}/"
                metadata = decoded(self.fs.read(prefix + "release.json"))
                for file in metadata["files"]:
                    path = file["path"][5:]
                    if path == "index.html":
                        continue
                    if self.fs.info("site/" + path) is None:
                        self.fs.publish_resource("site/" + path, self.fs.read(prefix + file["path"]))
                        self.checkpoint("after_resource")
            self.target_resources(target)
            self.check_site(resources)
            self.consistent(before)
            self.record(record, "resources_ready")
            self.checkpoint("before_index")
            self.record(record, "switching")
            if target:
                self.fs.move(stage + "/next-index.html", "site/index.html", replace=True)
            elif before:
                self.fs.move("site/index.html", stage + "/removed-index.html")
            self.checkpoint("after_index")
            self.record(record, "index_switched")
            self.write_current(target)
            self.checkpoint("after_current")
            self.consistent(target)
            self.record(record, "committed")
            return {"active": target, "result": "committed", "operationId": record["id"]}
        except Exception as exc:
            try:
                self.restore(record)
            except Exception as recovery:
                raise DeployError("Switch failed; recovery incomplete. Run status and recover before further operations") from recovery
            raise DeployError("Switch failed; previous state restored") from exc

    def execute(self, command, expected=None, *, undeploy=False):
        require(command in {"verify", "install", "rollback", "recover", "status"}, "Unknown command")
        if command in {"verify", "install", "rollback"}:
            require(expected is not None or command == "rollback" and undeploy, "Version expectations required")
            require(not (expected and undeploy), "Choose an artifact or --undeploy")
        with self.session(command != "status"):
            if command == "status":
                try:
                    records = self.records()
                    pending = [{"id": r["id"], "kind": r["kind"], "phase": r["phase"]} for r in records if r["phase"] not in TERMINAL]
                    self.repository_ready()
                    releases, resources = self.catalogue()
                    active = self.current(releases)
                    self.check_site(resources)
                    self.consistent(active)
                    return {"active": active, "actualIndexSha256": self.index_hash(), "consistent": True,
                            "pending": pending, "ready": not pending}
                except (DeployError, OSError) as exc:
                    return {"consistent": False, "ready": False, "error": str(exc),
                            "active": locals().get("active"),
                            "pending": locals().get("pending", [])}
            if command == "recover":
                pending = [r for r in self.records() if r["phase"] not in TERMINAL]
                self.repository_ready()  # Invalid formal stores/locks are never guessed away.
                switches = [r for r in pending if r["kind"] == "switch"]
                require(len(switches) <= 1, "Multiple unfinished switches; manual investigation required")
                for record in pending:
                    if record["kind"] == "acquire":
                        self.record(record, "aborted")
                    else:
                        self.restore(record)
                releases, resources = self.catalogue()
                self.check_site(resources)
                self.consistent(self.current(releases))
                return {"recovered": [r["id"] for r in pending], "strategy": "restore-before-state"}
            self.no_pending()
            if undeploy:
                return self.switch(None, rollback=True)
            metadata = self.acquire(expected)
            if command == "verify":
                return {"verified": expected.artifact, "sourceSha": metadata["sourceSha"],
                        "fileCount": metadata["fileCount"], "sizeBytes": metadata["sizeBytes"], "distSha256": metadata["distSha256"]}
            return self.switch(self.identity(expected.artifact, metadata), rollback=command == "rollback")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("verify", "install", "rollback", "status", "recover"):
        sub = commands.add_parser(name)
        sub.add_argument("--root", required=True, help="Explicit absolute deployment root")
        if name in {"verify", "install", "rollback"}:
            sub.add_argument("--artifact-sha", required=name != "rollback")
            sub.add_argument("--source-sha")
            sub.add_argument("--workflow-sha")
            sub.add_argument("--build-id")
        if name == "rollback":
            sub.add_argument("--undeploy", action="store_true", help="Remove active index, retain all resources")
    args = parser.parse_args(argv)
    try:
        require(sys.version_info >= (3, 12), "Python 3.12 or newer is required")
        expected = None
        if args.command in {"verify", "install", "rollback"}:
            undeploy = getattr(args, "undeploy", False)
            if undeploy:
                require(not any((args.artifact_sha, args.source_sha, args.workflow_sha, args.build_id)), "--undeploy excludes version flags")
            else:
                require(all((args.artifact_sha, args.source_sha, args.workflow_sha, args.build_id)), "Supply full --artifact-sha, --source-sha, --workflow-sha and --build-id")
                expected = Expected(args.artifact_sha, args.source_sha, args.workflow_sha, args.build_id)
        result = Installer(args.root).execute(args.command, expected, undeploy=getattr(args, "undeploy", False))
        print(json.dumps(result, indent=2))
        return 0 if result.get("ready", True) else 2
    except (DeployError, OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Deployment refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
