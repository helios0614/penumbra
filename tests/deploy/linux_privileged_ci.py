"""Temporary, hosted-runner-only root fixtures. Never run on a production host."""
import contextlib
import errno
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import pwd
import secrets
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT / 'scripts/deploy'))
import release_remote as remote

CONFIG = Path('/usr/src/trojan/config.json')
READER = remote.NODE_READER
RULE = Path('/etc/sudoers.d/penumbra-ci-node')
USER = 'penumbra-node-ci'
SECRET = secrets.token_hex(24)
NODE = dict(run_type='client', remote_addr='node.invalid', remote_port=38193,
            password=[SECRET], ssl=dict(sni='node.invalid', alpn=['http/1.1']))


def command(argv):
    return subprocess.run(argv, capture_output=True, timeout=20, env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin',
                          'HOME': '/nonexistent', 'LANG': 'C.UTF-8'})


class PrivilegedContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not (sys.platform == 'linux' and os.geteuid() == 0 and
                os.environ.get('GITHUB_ACTIONS') == 'true' and
                os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted'):
            raise RuntimeError('Ephemeral hosted runner required')
        if CONFIG.parent.exists() or READER.parent.exists() or RULE.exists():
            raise RuntimeError('Fixture paths already exist')
        try:
            pwd.getpwnam(USER)
        except KeyError:
            pass
        else:
            raise RuntimeError('Fixture user already exists')
        cls.addClassCleanup(cls.cleanup)
        subprocess.run(['/usr/sbin/useradd', '--no-create-home', '--shell', '/usr/sbin/nologin', USER], check=True)
        cls.uid = pwd.getpwnam(USER).pw_uid
        CONFIG.parent.mkdir(mode=0o755)
        READER.parent.mkdir(mode=0o755, parents=True)
        shutil.copyfile(PROJECT / 'scripts/deploy/read_node.py', READER)
        READER.chmod(0o644)
        # A restricted user need not be able to traverse the runner's home/worktree.
        helper = READER.parent / 'release_remote.py'
        shutil.copyfile(PROJECT / 'scripts/deploy/release_remote.py', helper)
        helper.chmod(0o644)
        RULE.write_text(f'{USER} ALL=(root) NOPASSWD: NOLOG_INPUT: NOLOG_OUTPUT: '
                        f'/usr/bin/python3.12 -I -B {READER}\n')
        RULE.chmod(0o440)
        subprocess.run(['/usr/sbin/visudo', '-cf', str(RULE)], check=True, capture_output=True)
        cls.digest = hashlib.sha256(READER.read_bytes().replace(b'\r\n', b'\n')).hexdigest()

    @classmethod
    def cleanup(cls):
        RULE.unlink(missing_ok=True)
        # These paths were required absent before creating this isolated fixture.
        if CONFIG.parent.is_symlink():
            CONFIG.parent.unlink()
        shutil.rmtree(CONFIG.parent, ignore_errors=True)
        shutil.rmtree(READER.parent, ignore_errors=True)
        subprocess.run(['/usr/sbin/userdel', USER], capture_output=True)

    def setUp(self):
        CONFIG.write_text(json.dumps(NODE))
        CONFIG.chmod(0o600)
        os.chown(CONFIG, 0, 0)

    def sudo(self, *extra):
        return command(['/usr/sbin/runuser', '-u', USER, '--', '/usr/bin/sudo', '-n', '--',
                        '/usr/bin/python3.12', '-I', '-B', str(READER), *extra])

    def refused(self):
        proc = self.sudo()
        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(proc.stdout, b'')
        self.assertNotIn(SECRET.encode(), proc.stderr)

    def test_root_owned_config_through_exact_sudo_pipe(self):
        proc = self.sudo()
        self.assertEqual(proc.returncode, 0)
        value = json.loads(proc.stdout)
        self.assertTrue(value == dict(host='node.invalid', port=38193, sni='node.invalid',
                                      alpn=['http/1.1'], password=SECRET), 'Whitelist mismatch')
        self.assertEqual(proc.stderr, b'')
        direct = command(['/usr/sbin/runuser', '-u', USER, '--', '/usr/bin/python3.12', '-I', '-c',
                          'from pathlib import Path; Path("/usr/src/trojan/config.json").read_bytes()'])
        self.assertNotEqual(direct.returncode, 0)
        self.assertNotIn(SECRET.encode(), direct.stdout + direct.stderr)

    def test_restricted_user_has_no_ambient_sudo_or_arbitrary_python(self):
        variants = [['/usr/bin/id', '-u'], ['/usr/bin/python3.12', '-I', '-c', 'pass'],
                    ['/usr/bin/python3.12', '-I', '-B', str(READER), '--extra'],
                    ['/usr/bin/python3.12', '-I', '-B', '/tmp/other-script.py'],
                    ['/usr/bin/python3.12', '-B', str(READER)]]
        for argv in variants:
            with self.subTest(command=argv[0]):
                proc = command(['/usr/sbin/runuser', '-u', USER, '--', '/usr/bin/sudo', '-n', '--', *argv])
                self.assertNotEqual(proc.returncode, 0)
                self.assertNotIn(SECRET.encode(), proc.stdout + proc.stderr)
                self.assertNotIn(b'node-config', proc.stderr)  # sudo denied before running reader.

    def test_actual_config_owner_and_mode_boundaries(self):
        for mode in (0o644, 0o640, 0o700):
            CONFIG.chmod(mode)
            self.refused()
        CONFIG.chmod(0o600)
        os.chown(CONFIG, self.uid, self.uid)
        self.refused()
        os.chown(CONFIG, 0, 0)
        CONFIG.parent.chmod(0o775)
        try:
            self.refused()
        finally:
            CONFIG.parent.chmod(0o755)
        os.chown(CONFIG.parent, self.uid, self.uid)
        try:
            self.refused()
        finally:
            os.chown(CONFIG.parent, 0, 0)

    def test_file_and_parent_symlinks_and_hardlinks_are_rejected(self):
        target = CONFIG.with_name('target.json')
        CONFIG.rename(target)
        try:
            CONFIG.symlink_to(target)
            self.refused()
            CONFIG.unlink()
            os.link(target, CONFIG)
            self.refused()
            CONFIG.unlink()
        finally:
            target.rename(CONFIG)
        other = CONFIG.parent.with_name('trojan-ci-target')
        CONFIG.parent.rename(other)
        try:
            CONFIG.parent.symlink_to(other, target_is_directory=True)
            self.refused()
        finally:
            CONFIG.parent.unlink()
            other.rename(CONFIG.parent)

    def test_duplicate_invalid_missing_and_oversized_config(self):
        for raw in (b'{"run_type":"client","run_type":"server"}', b'not-json', b'{}', b'x'*65537):
            CONFIG.write_bytes(raw)
            self.refused()
        CONFIG.unlink()
        self.refused()

    def test_reader_is_fixed_and_not_writable_by_release_user(self):
        self.assertEqual(self.sudo('/tmp/alternative.json').stdout, b'')
        proc = command(['/usr/sbin/runuser', '-u', USER, '--', '/usr/bin/test', '-w', str(READER)])
        self.assertNotEqual(proc.returncode, 0)
        self.assertNotEqual(command(['/usr/sbin/runuser', '-u', USER, '--', '/usr/bin/test',
                                     '-w', str(READER.parent)]).returncode, 0)

    def test_real_node_policy_wrapper_hash_and_sudo_no_output_leak(self):
        script = ('import sys,json; sys.path.insert(0,sys.argv[1]); import release_remote as r; '
                  's=r.Session(watch=lambda:False); '
                  '\ntry:\n p=r.node_policy(s,{"nodeReaderSha256":sys.argv[2]}); '
                  'print(json.dumps({"ok":True,"port":p["port"]}))'
                  '\nexcept r.Refused as e:\n print(str(e)); sys.exit(2)')
        for digest, code, expected in ((self.digest, 0, '"ok": true'), ('0'*64, 2, 'node-reader-version')):
            proc = command(['/usr/sbin/runuser', '-u', USER, '--', '/usr/bin/python3.12', '-I', '-B', '-c',
                            script, str(READER.parent), digest])
            self.assertEqual(proc.returncode, code)
            self.assertIn(expected.encode(), proc.stdout)
            self.assertNotIn(SECRET.encode(), proc.stdout + proc.stderr)

    def test_real_proxy_memfd_seals_and_secret_process_boundaries(self):
        sys.path.insert(0, str(PROJECT / 'tests/deploy'))
        from test_release_remote import LinuxProcessTests
        session, report = remote.Session(watch=lambda: False), {}
        with tempfile.TemporaryDirectory() as directory:
            fake = LinuxProcessTests().fake_proxy(directory)
            with patch.object(remote, 'TROJAN', fake), patch.object(remote, 'tls_entry'):
                policy = dict(host='node.invalid', port=443, sni='node.invalid', alpn=[], password=SECRET)
                with remote.proxy(session, policy, report) as (process, port):
                    proc = Path('/proc') / str(process.pid)
                    self.assertNotIn(SECRET.encode(), (proc/'cmdline').read_bytes() + (proc/'environ').read_bytes())
                    descriptors = [p for p in (proc/'fd').iterdir() if 'memfd:penumbra-trojan' in os.readlink(p)]
                    self.assertEqual(len(descriptors), 1)
                    with descriptors[0].open('r+b', buffering=0) as stream:
                        self.assertEqual(fcntl.fcntl(stream.fileno(), fcntl.F_GET_SEALS),
                                         fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
                        with self.assertRaises(OSError) as error:
                            stream.write(b'x')
                        self.assertEqual(error.exception.errno, errno.EPERM)
        self.assertTrue(report['proxyCleaned'])
        self.assertEqual(remote.listeners(session, port, monitor=False), [])


if __name__ == '__main__':
    log = io.StringIO()
    with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
        result = unittest.TextTestRunner(stream=log, verbosity=2).run(
            unittest.defaultTestLoader.loadTestsFromTestCase(PrivilegedContracts))
    print(log.getvalue().replace(SECRET, '[synthetic-redacted]'), end='')
    print('PENUMBRA_PRIVILEGED_RESULTS ' + json.dumps(dict(run=result.testsRun,
          passed=result.testsRun-len(result.failures)-len(result.errors)-len(result.skipped),
          failed=len(result.failures), errors=len(result.errors), skipped=len(result.skipped))), flush=True)
    sys.exit(0 if result.wasSuccessful() else 1)
