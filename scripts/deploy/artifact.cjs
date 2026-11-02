const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { checkBuild } = require('../../tests/browser/production-subpath-smoke.cjs');

const BASE = '/penumbra/';
const OMIT = 'fonts/cormorant-garamond/SOURCE.md';
const MANIFEST = '.vite/manifest.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Never follow links or accept hidden paths, shell/control characters or devices.
function tree(directory, prefix = '', gitRepository = false, buildMaterials = false) {
  assert(fs.lstatSync(directory).isDirectory(), `Not a real directory: ${directory}`);
  return fs.readdirSync(directory).sort().flatMap(name => {
    // Used only when rechecking the publisher's freshly initialized repository.
    // Never allow .git under dist/ or inside a downloaded release package.
    if (gitRepository && prefix === '' && name === '.git') {
      assert(fs.lstatSync(path.join(directory, name)).isDirectory(), 'Invalid Git directory');
      return [];
    }
    assert(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name) || (buildMaterials && prefix === '' && name === '.vite'), `Unsafe filename: ${name}`);
    const relative = prefix + name;
    const absolute = path.join(directory, name);
    const stat = fs.lstatSync(absolute);
    if (stat.isDirectory()) return tree(absolute, relative + '/', false, buildMaterials);
    assert(stat.isFile() && !stat.isSymbolicLink(), `Non-regular file: ${relative}`);
    return [relative];
  });
}

function allowed(file) {
  assert(!/(^|\/|[.-])(test|tests|spec|specs)([./-]|$)/i.test(file), `Test file: ${file}`);
  return file === 'index.html'
    || /^assets\/[A-Za-z0-9_.-]+\.(js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|gif|avif|ico)$/.test(file)
    || /^fonts\/cormorant-garamond\/(CormorantGaramond-(Regular|Italic)-latin\.woff2|OFL\.txt)$/.test(file);
}

function inventory(release) {
  const names = tree(path.join(release, 'dist'));
  assert(names.includes('index.html'), 'Missing index.html');
  return names.map(file => {
    assert(allowed(file), `Unexpected production file: ${file}`);
    const bytes = fs.readFileSync(path.join(release, 'dist', file));
    return { path: `dist/${file}`, sizeBytes: bytes.length, sha256: sha256(bytes) };
  });
}

const sums = files => files.map(file => `${file.sha256}  ${file.path}\n`).join('');
const json = value => JSON.stringify(value, null, 2) + '\n';

function provenance(env) {
  assert(/^[0-9a-f]{40}$/.test(env.SOURCE_SHA), 'A full source SHA is required');
  assert(/^[0-9a-f]{40}$/.test(env.GITHUB_SHA), 'A full workflow SHA is required');
  assert(/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY), 'Invalid repository');
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_NUMBER', 'GITHUB_RUN_ATTEMPT']) {
    assert(/^[1-9][0-9]*$/.test(env[key]), `Invalid ${key}`);
  }
  return {
    sourceSha: env.SOURCE_SHA,
    workflowSha: env.GITHUB_SHA,
    repository: env.GITHUB_REPOSITORY,
    buildId: `actions-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`,
    runId: env.GITHUB_RUN_ID,
    runNumber: env.GITHUB_RUN_NUMBER,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    runUrl: `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
  };
}

function packageRelease(dist, release, identity) {
  const names = tree(dist, '', false, true);
  for (const file of names) assert(file === OMIT || file === MANIFEST || allowed(file), `Unexpected production file: ${file}`);
  const finalFiles = names.filter(file => file !== OMIT && file !== MANIFEST);
  // Always use the workflow tooling's checker, including for older source SHAs.
  // Check against exactly the files that will be copied, before creating output.
  const productionValidation = checkBuild({ distDirectory: dist, finalFiles, requireManifest: true });
  fs.mkdirSync(release); // Refuse stale/overlapping output, rather than merging it.
  fs.mkdirSync(path.join(release, 'dist'));
  for (const file of finalFiles) {
    const target = path.join(release, 'dist', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(dist, file), target, fs.constants.COPYFILE_EXCL);
  }
  const files = inventory(release);
  const metadata = {
    schemaVersion: 1,
    ...identity,
    builtAt: new Date().toISOString(),
    nodeVersion: process.version,
    basePath: BASE,
    fileCount: files.length,
    sizeBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
    distSha256: sha256(sums(files)),
    productionValidation,
    excludedFiles: names.filter(file => file === OMIT || file === MANIFEST),
    files,
  };
  const metadataBytes = json(metadata);
  fs.writeFileSync(path.join(release, 'release.json'), metadataBytes, { flag: 'wx' });
  fs.writeFileSync(path.join(release, 'SHA256SUMS'), sums([
    ...files, { path: 'release.json', sha256: sha256(metadataBytes) },
  ]), { flag: 'wx' });
  verifyRelease(release);
  return metadata;
}

function verifyRelease(release, env, { gitRepository = false } = {}) {
  const names = tree(release, '', gitRepository);
  const metadataBytes = fs.readFileSync(path.join(release, 'release.json'));
  const metadata = JSON.parse(metadataBytes);
  const files = inventory(release);
  assert.deepEqual(names, [...files.map(file => file.path), 'release.json', 'SHA256SUMS'].sort(), 'Unexpected release contents');
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.basePath, BASE);
  assert.deepEqual(metadata.files, files, 'File hashes or sizes changed');
  assert.equal(metadata.fileCount, files.length);
  assert.equal(metadata.sizeBytes, files.reduce((total, file) => total + file.sizeBytes, 0));
  assert.equal(metadata.distSha256, sha256(sums(files)));
  assert.equal(fs.readFileSync(path.join(release, 'SHA256SUMS'), 'utf8'), sums([
    ...files, { path: 'release.json', sha256: sha256(metadataBytes) },
  ]), 'SHA256SUMS mismatch');
  if (env) {
    assert(/^[0-9a-f]{64}$/.test(env.EXPECTED_MANIFEST_SHA256), 'Missing build job manifest digest');
    assert.equal(sha256(metadataBytes), env.EXPECTED_MANIFEST_SHA256, 'Build job manifest digest mismatch');
    for (const [key, value] of Object.entries(provenance(env))) assert.equal(metadata[key], value, `Provenance mismatch: ${key}`);
  }
  return metadata;
}

function createRelease(source, release, env) {
  source = path.resolve(source);
  const identity = provenance(env);
  const git = args => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
  assert.equal(git(['rev-parse', 'HEAD']), identity.sourceSha);
  // The repository tracks this generated TypeScript cache. A normal build
  // rewrites it; only this exact file is exempt, never source or configuration.
  git(['diff', '--quiet', 'HEAD', '--', '.', ':(top,exclude)tsconfig.tsbuildinfo']);
  return packageRelease(path.join(source, 'dist'), release, identity);
}

module.exports = { packageRelease, verifyRelease, createRelease, sha256 };
if (require.main === module) {
  const [command, first, second] = process.argv.slice(2);
  if (command === 'create' && first && second) {
    const metadata = createRelease(first, second, process.env);
    const digest = sha256(fs.readFileSync(path.join(second, 'release.json')));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `manifest_sha256=${digest}\n`);
    console.log(json({ ...metadata, files: undefined, manifestSha256: digest }));
  } else if (command === 'verify' && first && !second) {
    const metadata = verifyRelease(first);
    console.log(`Verified ${metadata.buildId}: ${metadata.fileCount} files, ${metadata.sizeBytes} bytes`);
  } else throw new Error('Usage: artifact.cjs create <source> <new-release> | verify <release>');
}
