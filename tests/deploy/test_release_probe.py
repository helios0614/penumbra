"""Portable release contracts; no public network, sudo or production files."""

import contextlib
import importlib
import json
import os
import signal
import hashlib
import io
import stat
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/deploy'))
if os.name == 'nt':
    # Import only: these tests never execute flock or any POSIX process APIs.
    with patch.dict(sys.modules, {name: types.ModuleType(name) for name in ('fcntl', 'resource')}), \
         patch.object(signal, 'SIGHUP', signal.SIGTERM, create=True):
        remote = importlib.import_module('release_remote')
else:
    import release_remote as remote

PORT = 55001
SECRET = 'synthetic-node-secret'
POLICY = dict(host='node.invalid', port=443, sni='node.invalid', alpn=[], password=SECRET)
PIN = dict(artifactSha='a'*40, sourceSha='b'*40, workflowSha='b'*40, buildId='actions-123-1')
ACTIVE = dict(PIN, indexSha256='c'*64)
READY = dict(active=ACTIVE, ready=True, consistent=True, pending=[])
STATES = {name: dict(active=True, pid=2) for name in remote.SERVICES}
RELEASE = dict(PIN, previousActive=ACTIVE, fileCount=1, sizeBytes=12, distSha256='d'*64)


def response(body, http=200, tls=0, port=PORT, peer='127.0.0.1'):
    return body + remote.MARKER + f'{http} {tls} {peer} {port}\n'.encode()


class ProbeContracts(unittest.TestCase):
    def invoke(self, *, trace=(28, b'', b'sensitive stderr '+SECRET.encode()),
               github=None, owned=True, cleanup=False, entry=False, trace_error=None, wrong_identity=False):
        calls, urls = [], []
        report = dict(before=READY, servicesBefore=STATES, installState='not-started')
        github = github or (0, response(b'001e# service=git-upload-pack\n0000'), b'')

        class Session:
            def live(inner):
                pass

            def command(inner, argv, **kwargs):
                url = argv[-1]
                urls.append(url)
                self.assertIn('--cacert', argv)
                self.assertNotIn('--insecure', argv)
                self.assertEqual(argv[argv.index('--proxy')+1], f'socks5h://127.0.0.1:{PORT}')
                self.assertEqual(kwargs['env']['NO_PROXY'], '')
                if url == remote.TRACE:
                    if trace_error:
                        raise remote.Refused(trace_error)
                    return trace
                return github

        @contextlib.contextmanager
        def proxy(*args):
            try:
                if entry:
                    raise remote.Refused('entry-tls')
                yield object(), PORT
            finally:
                if cleanup:
                    raise remote.Refused('cleanup')
                report['proxyCleaned'] = True

        def installer(session, request, action, **kwargs):
            calls.append(action)
            value = dict(verified=PIN['artifactSha'], sourceSha=PIN['sourceSha'],
                         **{k: RELEASE[k] for k in remote.SUMMARY}) if action == 'verify' else dict(
                             active=ACTIVE, result='committed', operationId='1'*32)
            if wrong_identity and action == 'verify':
                value['verified'] = 'f'*40
            return 0, json.dumps(value).encode(), b''

        error = None
        with patch.object(remote, 'proxy', proxy), patch.object(remote, 'owned_listener',
                    **({'side_effect': owned} if isinstance(owned, list) else {'return_value': owned})), \
             patch.object(remote, 'installer_command', installer), patch.object(remote, 'status', return_value=READY), \
             patch.object(remote, 'services', return_value=STATES), patch.object(remote, 'check_git_processes'):
            try:
                # Actual deploy -> probe -> installer boundary, not a mocked probe.
                remote.deploy(Session(), dict(release=RELEASE), report, POLICY)
            except remote.Refused as exc:
                error = str(exc)
        self.assertNotIn(SECRET, repr(report))
        return calls, urls, report, error

    def test_cloudflare_timeout_allows_install(self):
        calls, urls, report, error = self.invoke()
        self.assertIsNone(error)
        self.assertEqual(calls, ['verify', 'install'])
        self.assertEqual(urls, [remote.GITHUB, remote.TRACE])
        self.assertTrue(report['proxyChecked'])
        self.assertEqual(report['egressDiagnostic']['status'], 'unavailable')

    def test_cloudflare_tls_error_is_diagnostic_only(self):
        calls, _, report, error = self.invoke(trace=(60, b'', SECRET.encode()))
        self.assertIsNone(error)
        self.assertIn('install', calls)
        self.assertNotIn('ip', report['egressDiagnostic'])

    def test_missing_ip_and_bad_host_do_not_block(self):
        for body in (b'h=www.cloudflare.com\n', b'ip=8.8.4.4\n', b'ip=8.8.4.4\nh=wrong.invalid\n'):
            with self.subTest(body=body):
                calls, _, report, error = self.invoke(trace=(0, response(body), b''))
                self.assertIsNone(error)
                self.assertIn('install', calls)
                self.assertEqual(report['egressDiagnostic']['status'], 'invalid-response')

    def test_cloudflare_http_errors_do_not_block_or_export_ip(self):
        for http in (403, 429, 503):
            with self.subTest(http=http):
                calls, urls, report, error = self.invoke(trace=(0, response(
                    b'h=www.cloudflare.com\nip=8.8.8.8\n', http=http), b''))
                self.assertIsNone(error)
                self.assertIn('install', calls)
                self.assertEqual(urls.count(remote.TRACE), 1)
                self.assertNotIn('ip', report['egressDiagnostic'])

    def test_cloudflare_peer_mismatch_is_not_an_optional_endpoint_failure(self):
        for options in (dict(port=1), dict(peer='203.0.113.1')):
            with self.subTest(options=options):
                calls, _, _, error = self.invoke(trace=(0, response(b'body', **options), b''))
                self.assertEqual(error, 'proxy-exit')
                self.assertEqual(calls, [])

    def test_changed_exit_is_recorded_without_whitelist(self):
        calls, _, report, error = self.invoke(trace=(0, response(b'h=www.cloudflare.com\nip=8.8.8.8\n'), b''))
        self.assertIsNone(error)
        self.assertIn('install', calls)
        self.assertEqual(report['egressDiagnostic']['ip'], '8.8.8.8')

    def test_untrusted_trace_body_is_not_recorded(self):
        _, _, report, _ = self.invoke(trace=(60, response(b'h=www.cloudflare.com\nip=8.8.8.8\n'), b''))
        self.assertNotIn('ip', report['egressDiagnostic'])

    def test_scoped_ip_cannot_forward_arbitrary_scope_text(self):
        _, _, report, error = self.invoke(trace=(0, response(b'h=www.cloudflare.com\nip=fe80::1%scope-text\n'), b''))
        self.assertIsNone(error)
        self.assertNotIn('ip', report['egressDiagnostic'])

    def test_github_tls_or_format_failure_stops_before_trace_and_verify(self):
        for result, expected in (((60, b'', b''), 'probe-tls'),
                                 ((0, response(b'not smart http'), b''), 'probe-format'),
                                 ((0, response(b'body', http=403), b''), 'probe-network'),
                                 ((0, response(b'body', tls=62), b''), 'probe-tls'),
                                 ((0, response(b'body', port=1), b''), 'proxy-exit')):
            with self.subTest(expected=expected):
                calls, urls, _, error = self.invoke(github=result)
                self.assertEqual(error, expected)
                self.assertEqual(calls, [])
                self.assertEqual(urls, [remote.GITHUB])

    def test_entry_and_proxy_ownership_remain_required(self):
        for options, expected in ((dict(entry=True), 'entry-tls'), (dict(owned=False), 'proxy-exit')):
            calls, urls, _, error = self.invoke(**options)
            self.assertEqual(error, expected)
            self.assertEqual((calls, urls), ([], []))

    def test_auxiliary_command_timeout_is_nonblocking(self):
        calls, _, _, error = self.invoke(trace_error='probe-network')
        self.assertIsNone(error)
        self.assertIn('install', calls)

    def test_auxiliary_lifecycle_errors_are_not_swallowed(self):
        for reason in ('interrupted', 'cleanup', 'proxy-exit', 'internal'):
            calls, _, _, error = self.invoke(trace_error=reason)
            self.assertEqual(error, reason)
            self.assertEqual(calls, [])

    def test_cleanup_failure_is_not_success(self):
        _, _, _, error = self.invoke(cleanup=True)
        self.assertEqual(error, 'cleanup')

    def test_proxy_loss_during_optional_timeout_still_blocks_install(self):
        calls, _, _, error = self.invoke(owned=[True, True, False])
        self.assertEqual(error, 'proxy-exit')
        self.assertEqual(calls, [])

    def test_release_identity_mismatch_still_blocks_install(self):
        calls, _, _, error = self.invoke(wrong_identity=True)
        self.assertEqual(error, 'verify-identity')
        self.assertEqual(calls, ['verify'])


class NodeSourceContracts(unittest.TestCase):
    def test_deploy_reads_exactly_one_node_snapshot(self):
        @contextlib.contextmanager
        def lock():
            yield 1
        request = dict(version=1, action='deploy', helperSha256='a'*64, installerSha256='b'*64,
                       nodeReaderSha256='c'*64, release=RELEASE)
        with patch.object(remote, 'proxy_lock', lock), patch.object(remote, 'acquire_deploy_lock'), \
             patch.object(remote, 'inspect_host'), patch.object(remote, 'pinned_file'), \
             patch.object(remote, 'status', return_value=READY), patch.object(remote, 'services', return_value=STATES), \
             patch.object(remote, 'node_policy', return_value=POLICY) as read, \
             patch.object(remote, 'proxy_dependencies'), patch.object(remote, 'check_git_processes'), \
             patch.object(remote, 'deploy') as deploy:
            remote.execute(object(), request, {})
        read.assert_called_once()
        self.assertEqual(deploy.call_args.args[-1], POLICY)

    def test_precise_sudo_command_and_single_snapshot(self):
        session = types.SimpleNamespace(command=unittest.mock.Mock(return_value=(0, json.dumps(POLICY).encode(), b'')))
        request = dict(nodeReaderSha256='a'*64)
        with patch.object(remote, 'reader_file') as pinned:
            self.assertEqual(remote.node_policy(session, request), POLICY)
        pinned.assert_called_once_with('a'*64)
        args, kwargs = session.command.call_args
        self.assertEqual(args[0], ['/usr/bin/sudo', '-n', '--', '/usr/bin/python3.12', '-I', '-B',
                                  '/usr/local/libexec/penumbra-release/read-node.py'])
        self.assertNotIn(SECRET, repr((args, kwargs)))
        self.assertEqual(session.command.call_count, 1)

    def test_failure_never_falls_back_or_leaks_payload(self):
        for rc, payload in ((2, SECRET.encode()), (0, b'{bad '+SECRET.encode()),
                            (0, json.dumps(dict(POLICY, unexpected=SECRET)).encode()),
                            (0, json.dumps(dict(POLICY, port=True)).encode())):
            session = types.SimpleNamespace(command=unittest.mock.Mock(return_value=(rc, payload, SECRET.encode())))
            with patch.object(remote, 'reader_file'), patch.object(Path, 'read_bytes', side_effect=AssertionError('legacy file read')):
                with self.assertRaisesRegex(remote.Refused, '^node-config$') as raised:
                    remote.node_policy(session, dict(nodeReaderSha256='a'*64))
            self.assertNotIn(SECRET, str(raised.exception))

    def test_hash_mismatch_prevents_sudo(self):
        session = types.SimpleNamespace(command=unittest.mock.Mock())
        with patch.object(remote, 'reader_file', side_effect=remote.Refused('node-reader-version')):
            with self.assertRaisesRegex(remote.Refused, 'node-reader-version'):
                remote.node_policy(session, dict(nodeReaderSha256='a'*64))
        session.command.assert_not_called()

    def test_reader_file_checks_root_ownership_permissions_and_hash(self):
        data = b'reader-source\r\n'

        class Stream(io.BytesIO):
            def fileno(self):
                return 99

        for uid, mode, digest, success in (
                (0, 0o644, hashlib.sha256(data.replace(b'\r\n', b'\n')).hexdigest(), True),
                (1000, 0o644, 'a'*64, False), (0, 0o664, 'a'*64, False), (0, 0o644, 'a'*64, False)):
            opened = iter(range(10, 30))
            info = lambda fd: types.SimpleNamespace(st_uid=uid if fd==99 else 0,
                st_mode=(stat.S_IFREG | mode) if fd==99 else (stat.S_IFDIR | 0o755),
                st_nlink=1, st_size=len(data))
            with patch.object(remote.os, 'open', side_effect=lambda *a, **k: next(opened)), \
                 patch.object(remote.os, 'close'), patch.object(remote.os, 'fstat', side_effect=info), \
                 patch.object(remote.os, 'fdopen', return_value=Stream(data)), \
                 patch.multiple(remote.os, O_DIRECTORY=0, O_NOFOLLOW=0, O_CLOEXEC=0, O_NONBLOCK=0, create=True):
                if success:
                    remote.reader_file(digest)
                else:
                    with self.assertRaisesRegex(remote.Refused, 'node-reader-version'):
                        remote.reader_file(digest)


class CommandResourceContracts(unittest.TestCase):
    def test_resource_close_failure_is_cleanup_not_optional_network_failure(self):
        process = unittest.mock.MagicMock()
        process.communicate.return_value = (b'', b'')
        process.returncode = 0
        process.__exit__.side_effect = OSError(SECRET)
        with patch.object(remote.subprocess, 'Popen', return_value=process), \
             patch.object(remote, 'parent_death', return_value=None), \
             patch.object(remote.signal, 'SIGKILL', 9, create=True):
            with self.assertRaisesRegex(remote.Refused, '^cleanup$'):
                remote.Session(watch=lambda: False).command(['fixture'], code='probe-network', timeout=1)

    def test_spawn_failure_retains_transfer_classification(self):
        with patch.object(remote.subprocess, 'Popen', side_effect=OSError(SECRET)), \
             patch.object(remote, 'parent_death', return_value=None), \
             patch.object(remote.signal, 'SIGKILL', 9, create=True):
            with self.assertRaisesRegex(remote.Refused, '^probe-network$'):
                remote.Session(watch=lambda: False).command(['fixture'], code='probe-network', timeout=1)


if __name__ == '__main__':
    unittest.main()
