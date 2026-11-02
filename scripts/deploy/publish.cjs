const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { verifyRelease } = require('./artifact.cjs');

function publish(release, repository, remote, env, transportEnv = process.env) {
  release = path.resolve(release);
  repository = path.resolve(repository);
  const metadata = verifyRelease(release, env);
  fs.mkdirSync(repository); // A fresh Git repo, never reuse the source checkout.
  const git = (args, network = false) => execFileSync('git', args, {
    cwd: repository, encoding: 'utf8', env: network ? transportEnv : process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  git(['init', '--quiet']);
  git(['remote', 'add', 'origin', remote]);
  // A failed network/auth request is fatal; only an empty successful response
  // means the branch does not exist. Never turn a fetch failure into an orphan.
  const head = git(['ls-remote', '--heads', 'origin', 'refs/heads/deploy'], true);
  if (head) {
    git(['fetch', '--no-tags', 'origin', 'refs/heads/deploy:refs/remotes/origin/deploy'], true);
    const parent = git(['rev-parse', 'refs/remotes/origin/deploy']);
    assert.equal(parent, head.split(/\s+/)[0], 'Deploy changed while fetching; retry manually');
    git(['checkout', '--quiet', '-b', 'deploy', parent]);
    git(['rm', '-r', '--quiet', '--ignore-unmatch', '.']);
  } else git(['checkout', '--quiet', '--orphan', 'deploy']);
  // Only verified static files and declarative metadata are copied, never code.
  for (const name of ['dist', 'release.json', 'SHA256SUMS']) {
    fs.cpSync(path.join(release, name), path.join(repository, name), { recursive: true, errorOnExist: true, force: false });
  }
  // Recheck the complete destination inventory as well as the downloaded copy.
  verifyRelease(repository, env, { gitRepository: true });
  git(['add', '--', 'dist', 'release.json', 'SHA256SUMS']);
  git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', `release: ${metadata.buildId} from ${metadata.sourceSha}`]);
  const artifactSha = git(['rev-parse', 'HEAD']);
  // A normal fast-forward push also rejects races with external publishers.
  git(['push', 'origin', 'HEAD:refs/heads/deploy'], true);
  return { artifactSha, ...metadata };
}

module.exports = { publish };
if (require.main === module) {
  const [release, repository] = process.argv.slice(2);
  assert(release && repository, 'Usage: publish.cjs <release> <new-repository>');
  assert(process.env.GITHUB_REF === 'refs/heads/main', 'Dispatch must use main');
  assert(process.env.GH_TOKEN, 'Missing GitHub token');
  const result = publish(release, repository, `https://github.com/${process.env.GITHUB_REPOSITORY}.git`, process.env, {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString('base64')}`,
  });
  const summary = `Published ${result.buildId}\n\n- Source SHA: \`${result.sourceSha}\`\n- Workflow SHA: \`${result.workflowSha}\`\n- Artifact commit (deploy): \`${result.artifactSha}\`\n- Static files: ${result.fileCount}; bytes: ${result.sizeBytes}\n- Dist SHA-256: \`${result.distSha256}\`\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
