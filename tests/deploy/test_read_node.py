"""Node reader contracts with synthetic credentials and isolated filesystem fixtures."""

import contextlib
import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/deploy'))
import read_node as reader

SECRET = 'fixture-password-never-log'
CONFIG = dict(run_type='client', remote_addr='node.invalid', remote_port=443,
              password=[SECRET], ssl=dict(sni='node.invalid', alpn=[]))


class ReaderContracts(unittest.TestCase):
    def test_exports_only_connection_fields(self):
        value = dict(CONFIG, local_addr='0.0.0.0', local_port=1080, log_file='secret-path')
        self.assertEqual(reader.node_fields(value), dict(host='node.invalid', port=443, password=SECRET,
                                                        sni='node.invalid', alpn=[]))

    def test_rejects_missing_and_unsupported_structures(self):
        cases = [[], {}, dict(CONFIG, run_type='server'), dict(CONFIG, ssl=[]),
                 dict(CONFIG, password=SECRET), dict(CONFIG, password=[SECRET, 'second']),
                 dict(CONFIG, password=[]), dict(CONFIG, password=['']),
                 dict(CONFIG, ssl=dict(sni='node.invalid')), dict(CONFIG, remote_addr='https://node.invalid')]
        for value in cases:
            with self.subTest(value=type(value).__name__), self.assertRaises(reader.Refused):
                reader.node_fields(value)

    def test_strict_port_and_tls_fields(self):
        for port in (True, 0, 65536, '443', None):
            with self.subTest(port=port), self.assertRaises(reader.Refused):
                reader.node_fields(dict(CONFIG, remote_port=port))
        for ssl in (dict(sni='', alpn=[]), dict(sni='bad name', alpn=[]),
                    dict(sni='node.invalid', alpn='h2'), dict(sni='node.invalid', alpn=['unknown'])):
            with self.subTest(ssl=ssl), self.assertRaises(reader.Refused):
                reader.node_fields(dict(CONFIG, ssl=ssl))

    def test_cli_requires_root(self):
        with patch.object(sys, 'platform', 'linux'), patch.object(os, 'geteuid', return_value=1000, create=True):
            with self.assertRaises(reader.Refused):
                reader.require_root()

    def test_duplicate_keys_and_corrupt_json(self):
        for value in (b'{"run_type":"client","run_type":"server"}', b'no json',
                      b'{"ssl":{"sni":"a","sni":"b"}}', b'[]'):
            with self.subTest(value=value), self.assertRaises(reader.Refused):
                reader.decode_config(value)

    def test_permissions_owner_file_type_and_link_count(self):
        good = dict(st_uid=0, st_mode=stat.S_IFREG | 0o600, st_nlink=1, st_size=10)
        reader.check_file(SimpleNamespace(**good))
        for change in (dict(st_uid=1000), dict(st_mode=stat.S_IFREG | 0o640),
                       dict(st_mode=stat.S_IFREG | 0o620), dict(st_mode=stat.S_IFLNK | 0o600),
                       dict(st_nlink=2), dict(st_size=reader.MAX_CONFIG+1)):
            with self.subTest(change=change), self.assertRaises(reader.Refused):
                reader.check_file(SimpleNamespace(**{**good, **change}))
        reader.check_directory(SimpleNamespace(st_uid=0, st_mode=stat.S_IFDIR | 0o755))
        for uid, mode in ((1000, 0o755), (0, 0o775), (0, 0o777), (0, stat.S_IFREG | 0o755)):
            info = SimpleNamespace(st_uid=uid, st_mode=mode if stat.S_IFMT(mode) else stat.S_IFDIR | mode)
            with self.subTest(uid=uid, mode=mode), self.assertRaises(reader.Refused):
                reader.check_directory(info)

    def test_cli_rejects_arguments_and_never_prints_exception_secrets(self):
        for argv in (['reader', '/arbitrary/path'], ['reader', '--help']):
            out, err = io.StringIO(), io.StringIO()
            with patch.object(sys, 'argv', argv), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                self.assertEqual(reader.main(), 2)
            self.assertEqual(out.getvalue(), '')
            self.assertNotIn(SECRET, err.getvalue())
        out, err = io.StringIO(), io.StringIO()
        with patch.object(sys, 'argv', ['reader']), patch.object(reader, 'read_config', side_effect=OSError(SECRET)), \
             patch.object(reader, 'require_root'), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.assertEqual(reader.main(), 2)
        self.assertEqual(out.getvalue(), '')
        self.assertEqual(err.getvalue(), 'node-config\n')

    def test_cli_success_only_exports_whitelist(self):
        out = io.StringIO()
        with patch.object(sys, 'argv', ['reader']), patch.object(reader, 'read_config', return_value=CONFIG), \
             patch.object(reader, 'require_root'), contextlib.redirect_stdout(out):
            self.assertEqual(reader.main(), 0)
        self.assertEqual(set(json.loads(out.getvalue())), {'host', 'port', 'sni', 'alpn', 'password'})


@unittest.skipIf(os.name == 'nt', 'descriptor-relative POSIX open required')
class ReaderFilesystemTests(unittest.TestCase):
    def test_read_and_reject_symlinks_and_oversize(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            config = root / 'config.json'
            config.write_text(json.dumps(CONFIG))
            config.chmod(0o600)
            actual_check = reader.check_file

            def fixture_file(info):
                # Exercise real file permissions, size and type without requiring CI root.
                actual_check(SimpleNamespace(st_uid=0, st_mode=info.st_mode,
                                             st_size=info.st_size, st_nlink=info.st_nlink))

            with patch.object(reader, 'CONFIG', config), patch.object(reader, 'check_directory'), \
                 patch.object(reader, 'check_file', fixture_file):
                self.assertEqual(reader.read_config(), CONFIG)
                config.write_bytes(b'x'*(reader.MAX_CONFIG+1))
                with self.assertRaises(reader.Refused):
                    reader.read_config()
                config.unlink()
                target = root / 'target.json'
                target.write_text(json.dumps(CONFIG))
                target.chmod(0o600)
                config.symlink_to(target)
                with self.assertRaises((OSError, reader.Refused)):
                    reader.read_config()
                config.unlink()
                nested = root / 'nested'
                nested.mkdir()
                (nested / 'config.json').write_text(json.dumps(CONFIG))
                (root / 'link').symlink_to(nested, target_is_directory=True)
                with patch.object(reader, 'CONFIG', root / 'link/config.json'), self.assertRaises((OSError, reader.Refused)):
                    reader.read_config()


if __name__ == '__main__':
    unittest.main()
