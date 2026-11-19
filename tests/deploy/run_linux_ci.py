"""Temporary CI driver: run existing isolated contracts and emit sanitized counts."""
import contextlib
import io
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
log = io.StringIO()
with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
    suite = unittest.defaultTestLoader.discover('tests/deploy', pattern='test_*.py')
    result = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
redacted = log.getvalue()
for module in tuple(sys.modules.values()):
    if getattr(module, '__name__', '').startswith('test_'):
        value = getattr(module, 'SECRET', None)
        if isinstance(value, str) and value:
            redacted = redacted.replace(value, '[synthetic-redacted]')
print(redacted, end='')
mandatory = ('LinuxProcessTests', 'ReaderFilesystemTests', 'TLSLoopbackTests', 'GitProcessTests')
unexpected_skips = [test.id() for test, _ in result.skipped if any(name in test.id() for name in mandatory)]
summary = dict(run=result.testsRun, passed=result.testsRun-len(result.failures)-len(result.errors)-len(result.skipped),
               failed=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
               unexpectedSkips=unexpected_skips)
print('PENUMBRA_LINUX_RESULTS ' + json.dumps(summary), flush=True)
sys.exit(0 if result.wasSuccessful() and not unexpected_skips else 1)
