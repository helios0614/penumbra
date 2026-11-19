#!/usr/bin/python3.12 -I
"""Root-managed, fixed-source Trojan node reader. Stdlib only; no imports from the deploy user."""

import json
import os
from pathlib import Path
import re
import stat
import sys

CONFIG = Path('/usr/src/trojan/config.json')
MAX_CONFIG = 65536


class Refused(Exception):
    pass


def require(condition):
    if not condition:
        raise Refused('node-config')


def check_directory(info):
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022)


def check_file(info):
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o177 and
            info.st_nlink == 1 and 0 < info.st_size <= MAX_CONFIG)


def decode_config(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result)
            result[key] = value
        return result
    try:
        value = json.loads(raw, object_pairs_hook=unique)
        require(isinstance(value, dict))
        return value
    except (UnicodeError, ValueError, RecursionError):
        raise Refused('node-config') from None


def node_fields(config):
    require(isinstance(config, dict) and config.get('run_type') == 'client')
    ssl = config.get('ssl')
    require(isinstance(ssl, dict))
    host, port, passwords = (config.get(key) for key in ('remote_addr', 'remote_port', 'password'))
    sni, alpn = ssl.get('sni'), ssl.get('alpn')
    require(isinstance(host, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.:-]{0,252}', host) and
            type(port) is int and 0 < port < 65536 and isinstance(sni, str) and
            re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]{0,252}', sni) and isinstance(alpn, list) and
            all(isinstance(p, str) and p in ('h2', 'http/1.1') for p in alpn) and
            isinstance(passwords, list) and len(passwords) == 1 and isinstance(passwords[0], str) and
            0 < len(passwords[0]) <= 4096 and all(32 <= ord(c) != 127 for c in passwords[0]))
    # Ignore all other Trojan settings, including production listeners and TLS switches.
    return dict(host=host, port=port, sni=sni, alpn=alpn, password=passwords[0])


def read_config():
    """Walk from / using pinned directory fds; reject symlinks at every component."""
    require(CONFIG.is_absolute() and '..' not in CONFIG.parts)
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        check_directory(os.fstat(fd))
        for part in CONFIG.parts[1:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
            os.close(fd)
            fd = child
            check_directory(os.fstat(fd))
        config_fd = os.open(CONFIG.name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
        with os.fdopen(config_fd, 'rb') as stream:
            before = os.fstat(stream.fileno())
            check_file(before)
            raw = stream.read(MAX_CONFIG + 1)
            after = os.fstat(stream.fileno())
            require(len(raw) <= MAX_CONFIG and (before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                    (after.st_size, after.st_mtime_ns, after.st_ctime_ns))
        return decode_config(raw)
    except OSError:
        raise Refused('node-config') from None
    finally:
        os.close(fd)


def require_root():
    require(sys.platform == 'linux' and os.geteuid() == 0)
    import resource
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    os.umask(0o077)


def main():
    try:
        require(len(sys.argv) == 1)
        require_root()
        node = node_fields(read_config())
        print(json.dumps(node), flush=True)
        return 0
    except Exception:
        # Never print config bytes, argv or raw exceptions containing credentials.
        print('node-config', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
