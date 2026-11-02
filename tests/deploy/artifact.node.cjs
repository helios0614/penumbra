// Run explicitly with node --test; keep outside Vitest's *.test.* discovery.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { packageRelease, verifyRelease, createRelease, sha256 } = require('../../scripts/deploy/artifact.cjs');
const { publish } = require('../../scripts/deploy/publish.cjs');

const identity = {
  sourceSha: 'a'.repeat(40), workflowSha: 'b'.repeat(40),
  repository: 'helios0614/penumbra', buildId: 'actions-123-1',
  runId: '123', runNumber: '1', runAttempt: '1',
  runUrl: 'https://github.com/helios0614/penumbra/actions/runs/123',
};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'penumbra-deploy-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dist = path.join(root, 'dist');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dist, '.vite'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<script src="/penumbra/assets/app.js"></script><link rel="stylesheet" href="/penumbra/assets/app.css">');
  fs.writeFileSync(path.join(dist, 'assets/app.js'), 'import "./shared.js"; import("./lazy.js"); console.log("fixture")');
  fs.writeFileSync(path.join(dist, 'assets/shared.js'), 'export const shared = true');
  fs.writeFileSync(path.join(dist, 'assets/lazy.js'), 'import "./shared.js"; export const lazy = true');
  fs.writeFileSync(path.join(dist, 'assets/app.css'), 'body { background: url("/penumbra/assets/texture.png") }');
  fs.writeFileSync(path.join(dist, 'assets/lazy.css'), '.lazy { color: red }');
  fs.writeFileSync(path.join(dist, 'assets/texture.png'), 'fixture image');
  const graph = {
    'index.html': { file: 'assets/app.js', isEntry: true, imports: ['_shared.js'], dynamicImports: ['src/lazy.ts'], css: ['assets/app.css'], assets: ['assets/texture.png'] },
    '_shared.js': { file: 'assets/shared.js' },
    'src/lazy.ts': { file: 'assets/lazy.js', isDynamicEntry: true, imports: ['_shared.js'], css: ['assets/lazy.css'] },
  };
  const writeManifest = () => fs.writeFileSync(path.join(dist, '.vite/manifest.json'), JSON.stringify(graph));
  writeManifest();
  const release = path.join(root, 'release');
  const pack = () => packageRelease(dist, release, identity);
  const env = () => ({
    SOURCE_SHA: identity.sourceSha, GITHUB_SHA: identity.workflowSha,
    GITHUB_REPOSITORY: identity.repository, GITHUB_RUN_ID: '123',
    GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '1',
    EXPECTED_MANIFEST_SHA256: sha256(fs.readFileSync(path.join(release, 'release.json'))),
  });
  return { root, dist, release, pack, env, graph, writeManifest };
}

test('release records every static byte, retains font license and excludes source notes', t => {
  const f = fixture(t);
  const font = path.join(f.dist, 'fonts/cormorant-garamond');
  fs.mkdirSync(font, { recursive: true });
  fs.writeFileSync(path.join(font, 'OFL.txt'), 'fixture license');
  fs.writeFileSync(path.join(font, 'SOURCE.md'), 'source notes');
  const metadata = f.pack();
  assert.equal(metadata.fileCount, 8);
  assert.deepEqual(metadata.excludedFiles, ['.vite/manifest.json', 'fonts/cormorant-garamond/SOURCE.md']);
  assert.equal(fs.existsSync(path.join(f.release, 'dist/fonts/cormorant-garamond/SOURCE.md')), false);
  assert.equal(fs.existsSync(path.join(f.release, 'dist/.vite')), false);
  assert(!fs.readFileSync(path.join(f.release, 'SHA256SUMS'), 'utf8').includes('.vite/'));
  assert.deepEqual(verifyRelease(f.release, f.env()), metadata);
  assert.throws(f.pack, /EEXIST/);
});

for (const forbidden of ['.git/config', '.env', 'src/app.ts', 'assets/app.test.js', 'assets/app.js.map', 'package.json', 'assets/private.pem']) {
  test(`refuses ${forbidden}`, t => {
    const f = fixture(t);
    const file = path.join(f.dist, forbidden);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'must not publish');
    assert.throws(f.pack);
    assert.equal(fs.existsSync(f.release), false);
  });
}

test('refuses symlinks for both files and directories', t => {
  const f = fixture(t);
  fs.symlinkSync(path.join(f.dist, 'index.html'), path.join(f.dist, 'assets/link.js'));
  assert.throws(f.pack, /Non-regular/);
  fs.unlinkSync(path.join(f.dist, 'assets/link.js'));
  fs.symlinkSync(f.dist, path.join(f.root, 'linked-dist'));
  assert.throws(() => packageRelease(path.join(f.root, 'linked-dist'), f.release, identity, {}), /Not a real directory/);
});

for (const mode of ['modified', 'missing', 'extra', 'manifest', 'checksums', 'wrong-source', 'wrong-digest']) {
  test(`verification fails for ${mode}`, t => {
    const f = fixture(t); f.pack();
    const env = f.env();
    if (mode === 'modified') fs.appendFileSync(path.join(f.release, 'dist/assets/app.js'), 'tampered');
    if (mode === 'missing') fs.unlinkSync(path.join(f.release, 'dist/assets/app.js'));
    if (mode === 'extra') fs.writeFileSync(path.join(f.release, 'dist/assets/extra.js'), 'extra');
    if (mode === 'manifest') fs.appendFileSync(path.join(f.release, 'release.json'), ' ');
    if (mode === 'checksums') fs.writeFileSync(path.join(f.release, 'SHA256SUMS'), 'wrong');
    if (mode === 'wrong-source') env.SOURCE_SHA = 'c'.repeat(40);
    if (mode === 'wrong-digest') env.EXPECTED_MANIFEST_SHA256 = '0'.repeat(64);
    assert.throws(() => verifyRelease(f.release, env));
  });
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('source guard permits only tracked TypeScript build cache changes', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, 'tests/browser'), { recursive: true });
  fs.writeFileSync(path.join(f.root, 'tests/browser/production-subpath-smoke.cjs'), 'exports.checkBuild = () => ({ developmentPagesExcluded: true });');
  fs.writeFileSync(path.join(f.root, '.gitignore'), 'dist/\nrelease*/\n');
  fs.writeFileSync(path.join(f.root, 'app.ts'), 'original source');
  fs.writeFileSync(path.join(f.root, 'tsconfig.tsbuildinfo'), 'old cache');
  git(f.root, 'init', '--quiet');
  git(f.root, 'add', '.');
  git(f.root, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture source');
  const env = {
    SOURCE_SHA: git(f.root, 'rev-parse', 'HEAD'), GITHUB_SHA: identity.workflowSha,
    GITHUB_REPOSITORY: identity.repository, GITHUB_RUN_ID: '123',
    GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '1',
  };
  fs.writeFileSync(path.join(f.root, 'tsconfig.tsbuildinfo'), 'new cache');
  assert.equal(createRelease(f.root, f.release, env).sourceSha, env.SOURCE_SHA);
  fs.writeFileSync(path.join(f.root, 'app.ts'), 'changed source');
  assert.throws(() => createRelease(f.root, path.join(f.root, 'release-bad'), env));
});

test('local bare remote: first publish creates branch; second preserves history and removes stale assets; race refuses overwrite', t => {
  const f = fixture(t); f.pack();
  const remote = path.join(f.root, 'remote.git');
  git(f.root, 'init', '--bare', '--quiet', remote);
  const first = publish(f.release, path.join(f.root, 'publish-1'), remote, f.env());
  assert.equal(git(remote, 'rev-parse', 'deploy'), first.artifactSha);
  const tree = git(remote, 'ls-tree', '-r', '--name-only', 'deploy').split('\n');
  assert.deepEqual(tree, ['SHA256SUMS', 'dist/assets/app.css', 'dist/assets/app.js', 'dist/assets/lazy.css', 'dist/assets/lazy.js', 'dist/assets/shared.js', 'dist/assets/texture.png', 'dist/index.html', 'release.json']);

  fs.renameSync(path.join(f.dist, 'assets/app.js'), path.join(f.dist, 'assets/next.js'));
  fs.writeFileSync(path.join(f.dist, 'index.html'), '<script src="/penumbra/assets/next.js"></script><link rel="stylesheet" href="/penumbra/assets/app.css">');
  f.graph['index.html'].file = 'assets/next.js';
  f.writeManifest();
  fs.rmSync(f.release, { recursive: true }); f.pack();
  const second = publish(f.release, path.join(f.root, 'publish-2'), remote, f.env());
  assert.equal(git(remote, 'rev-parse', 'deploy^'), first.artifactSha);
  assert(!git(remote, 'ls-tree', '-r', '--name-only', 'deploy').includes('app.js'));
  assert(git(remote, 'show', `${first.artifactSha}:dist/assets/app.js`).includes('console.log("fixture")'));

  // Advance the remote after the publisher fetched, just before receive.
  const rival = git(remote, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid',
    'commit-tree', `${second.artifactSha}^{tree}`, '-p', second.artifactSha, '-m', 'external release');
  fs.writeFileSync(path.join(remote, 'hooks/update'), `#!/bin/sh\ngit update-ref refs/heads/deploy ${rival} ${second.artifactSha}\n`, { mode: 0o755 });
  fs.appendFileSync(path.join(f.dist, 'assets/next.js'), '; /* third release */');
  fs.rmSync(f.release, { recursive: true }); f.pack();
  assert.throws(() => publish(f.release, path.join(f.root, 'publish-race'), remote, f.env()));
  assert.equal(git(remote, 'rev-parse', 'deploy'), rival);
  assert.equal(git(remote, 'rev-parse', 'deploy^^'), first.artifactSha);
});

test('failed remote access is fatal and does not become a first release', t => {
  const f = fixture(t); f.pack();
  const output = path.join(f.root, 'failed-publish');
  assert.throws(() => publish(f.release, output, path.join(f.root, 'missing.git'), f.env()));
  assert.throws(() => git(output, 'rev-parse', 'HEAD'));
});

// Exercise createRelease(), the same entry used by the workflow, with a source
// revision whose old checker would accept anything. Only trusted tooling may gate.
function sourceFixture(t) {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, 'tests/browser'), { recursive: true });
  fs.writeFileSync(path.join(f.root, 'tests/browser/production-subpath-smoke.cjs'), 'exports.checkBuild = () => ({ oldCheckerWouldPass: true });');
  fs.writeFileSync(path.join(f.root, '.gitignore'), 'dist/\nrelease*/\n');
  git(f.root, 'init', '--quiet');
  git(f.root, 'add', '.');
  git(f.root, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture source');
  const env = {
    SOURCE_SHA: git(f.root, 'rev-parse', 'HEAD'), GITHUB_SHA: identity.workflowSha,
    GITHUB_REPOSITORY: identity.repository, GITHUB_RUN_ID: '123', GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '1',
  };
  return { ...f, pack: () => createRelease(f.root, f.release, env) };
}

for (const resource of ['assets/lazy.js', 'assets/shared.js', 'assets/lazy.css', 'assets/texture.png']) {
  test(`release entry rejects resource removed before packaging: ${resource}`, t => {
    const f = sourceFixture(t);
    fs.unlinkSync(path.join(f.dist, resource));
    assert.throws(f.pack, /Resource absent from final release/);
    assert.equal(fs.existsSync(f.release), false);
  });
}

for (const field of ['imports', 'dynamicImports']) {
  test(`release entry rejects a missing manifest ${field} key`, t => {
    const f = sourceFixture(t);
    f.graph['index.html'][field] = ['missing-key']; f.writeManifest();
    assert.throws(f.pack, /Missing manifest key/);
    assert.equal(fs.existsSync(f.release), false);
  });
}

test('release entry checks non-entry chunks even when unreachable from the entry', t => {
  const f = sourceFixture(t);
  f.graph['unreferenced.ts'] = { file: 'assets/missing.js' }; f.writeManifest();
  assert.throws(f.pack, /Resource absent from final release/);
});

test('release entry rejects missing or malformed validation material', t => {
  const f = sourceFixture(t);
  fs.unlinkSync(path.join(f.dist, '.vite/manifest.json'));
  assert.throws(f.pack, /Missing Vite build manifest/);
  fs.writeFileSync(path.join(f.dist, '.vite/manifest.json'), '{bad JSON');
  assert.throws(f.pack, SyntaxError);
  f.graph['index.html'].assets = 'assets/texture.png'; f.writeManifest();
  assert.throws(f.pack, /Invalid manifest assets/);
});

for (const resource of ['.vite/manifest.json', 'fonts/cormorant-garamond/SOURCE.md']) {
  test(`release entry rejects a manifest target excluded from publication: ${resource}`, t => {
    const f = sourceFixture(t);
    const notes = path.join(f.dist, 'fonts/cormorant-garamond');
    fs.mkdirSync(notes, { recursive: true }); fs.writeFileSync(path.join(notes, 'SOURCE.md'), 'source notes');
    f.graph['index.html'].assets = [resource]; f.writeManifest();
    assert.throws(f.pack, /Resource absent from final release/);
  });
}

const unsafeUrls = [
  '/penumbra/assets/../../outside.js',
  '/penumbra/assets/%2e%2e/%2e%2e/outside.js',
  '/penumbra/assets/%252e%252e/outside.js',
  '/penumbra/assets/..%2f..%2foutside.js',
  '/penumbra/assets/%5c..%5coutside.js',
  '/penumbra-other/assets/app.js',
  '/penumbra/assets/%ZZ.js',
  '/penumbra/assets/%ff.js',
  '/penumbra/assets/app.js?v=%ZZ',
  'https://cdn.example.invalid/app.js',
  '//cdn.example.invalid/app.js',
];
for (const url of unsafeUrls) {
  test(`release entry rejects unsafe HTML reference: ${url}`, t => {
    const f = sourceFixture(t);
    fs.writeFileSync(path.join(f.root, 'outside.js'), 'outside dist; must never satisfy a reference');
    fs.writeFileSync(path.join(f.dist, 'index.html'), `<script src="${url}"></script><link rel="stylesheet" href="/penumbra/assets/app.css">`);
    assert.throws(f.pack, /traversal|encoding|URI malformed|escaped application base|Invalid resource URL|External resource/);
    assert.equal(fs.existsSync(f.release), false);
  });
}

test('release entry applies the same boundary checks to CSS and manifest file paths', t => {
  const f = sourceFixture(t);
  fs.writeFileSync(path.join(f.root, 'outside.png'), 'outside');
  fs.writeFileSync(path.join(f.dist, 'assets/app.css'), 'body { background: url("/penumbra/assets/../../outside.png") }');
  assert.throws(f.pack, /Resource traversal/);
  fs.writeFileSync(path.join(f.dist, 'assets/app.css'), 'body {}');
  f.graph['src/lazy.ts'].file = 'assets/../../outside.js'; f.writeManifest();
  assert.throws(f.pack, /Resource traversal/);
});

test('release entry rejects a resource symlink pointing outside dist', t => {
  const f = sourceFixture(t);
  fs.writeFileSync(path.join(f.root, 'outside.js'), 'outside');
  fs.unlinkSync(path.join(f.dist, 'assets/lazy.js'));
  fs.symlinkSync(path.join(f.root, 'outside.js'), path.join(f.dist, 'assets/lazy.js'));
  assert.throws(f.pack, /Non-regular file|Symbolic link/);
});

test('release entry accepts encoded names, queries/fragments, fonts and inline CSS; hashes only published files', t => {
  const f = sourceFixture(t);
  fs.writeFileSync(path.join(f.dist, 'index.html'), '<script src="/penumbra/assets/%61pp.js?v=1#entry"></script><link href="/penumbra/assets/app.css?v=2#style" rel="stylesheet">');
  const font = 'fonts/cormorant-garamond/CormorantGaramond-Regular-latin.woff2';
  fs.mkdirSync(path.dirname(path.join(f.dist, font)), { recursive: true });
  fs.writeFileSync(path.join(f.dist, font), 'font');
  fs.appendFileSync(path.join(f.dist, 'assets/app.css'), `@font-face {src:url('/penumbra/${font}?v=1#font')} .x {background:url('./texture.png?text=a%20b#image')} .inline {background:url('data:image/svg+xml,%3Csvg%20/%3E')}`);
  const metadata = f.pack();
  assert.equal(metadata.productionValidation.manifest.entries, 3);
  assert.equal(metadata.productionValidation.manifest.dynamicImports, 1);
  assert.equal(metadata.productionValidation.manifest.imports, 2);
  assert.deepEqual(verifyRelease(f.release), metadata);
  assert.equal(fs.existsSync(path.join(f.release, 'dist/.vite')), false);
  assert(!metadata.files.some(file => file.path.includes('.vite/')));
  assert(!fs.readFileSync(path.join(f.release, 'SHA256SUMS'), 'utf8').includes('.vite/'));
});

test('real Vite build: release gate rejects damage to generated dependencies', {
  skip: !process.env.PENUMBRA_DEPLOY_TEST_SOURCE,
}, async t => {
  const actualDist = path.join(process.env.PENUMBRA_DEPLOY_TEST_SOURCE, 'dist');
  const graph = JSON.parse(fs.readFileSync(path.join(actualDist, '.vite/manifest.json'), 'utf8'));
  const chunks = Object.values(graph);
  const dynamic = chunks.find(chunk => chunk.isDynamicEntry && /ChatView-.*\.js$/.test(chunk.file));
  assert(dynamic, 'Expected the actual ChatView lazy chunk');
  const staticKey = chunks.flatMap(chunk => chunk.imports ?? []).find(key => graph[key].file.endsWith('.js') && !graph[key].isEntry);
  assert(staticKey, 'Expected a generated static dependency');
  const css = chunks.flatMap(chunk => chunk.css ?? [])[0];
  const asset = chunks.flatMap(chunk => chunk.assets ?? [])[0];
  assert(css && asset, 'Expected generated CSS and assets');
  const cases = [
    ['dynamic JS', dist => fs.unlinkSync(path.join(dist, dynamic.file)), /Resource absent from final release/],
    ['static JS', dist => fs.unlinkSync(path.join(dist, graph[staticKey].file)), /Resource absent from final release/],
    ['CSS', dist => fs.unlinkSync(path.join(dist, css)), /Resource absent from final release/],
    ['asset', dist => fs.unlinkSync(path.join(dist, asset)), /Resource absent from final release/],
    ['manifest key', dist => {
      const copy = structuredClone(graph); delete copy[staticKey];
      fs.writeFileSync(path.join(dist, '.vite/manifest.json'), JSON.stringify(copy));
    }, /Missing manifest key/],
    ...['/penumbra/assets/../../outside.js', '/penumbra/assets/%2e%2e/%2e%2e/outside.js'].map(url => [url, dist => {
      fs.writeFileSync(path.join(dist, '../outside.js'), 'outside dist');
      fs.appendFileSync(path.join(dist, 'index.html'), `<script src="${url}"></script>`);
    }, /Resource traversal/]),
  ];
  for (const [name, damage, expected] of cases) await t.test(name, t => {
    const f = sourceFixture(t);
    fs.rmSync(f.dist, { recursive: true }); fs.cpSync(actualDist, f.dist, { recursive: true });
    damage(f.dist);
    assert.throws(f.pack, error => {
      assert.match(error.message, expected); t.diagnostic(`Rejected: ${error.message}`); return true;
    });
    assert.equal(fs.existsSync(f.release), false);
  });
  await t.test('complete generated build packages and verifies', t => {
    const f = sourceFixture(t);
    fs.rmSync(f.dist, { recursive: true }); fs.cpSync(actualDist, f.dist, { recursive: true });
    const metadata = f.pack();
    assert.deepEqual(verifyRelease(f.release), metadata);
    assert(metadata.productionValidation.manifest.entries > 0);
    assert(!fs.existsSync(path.join(f.release, 'dist/.vite')));
  });
});
