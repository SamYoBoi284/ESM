#!/usr/bin/env node
/**
 * scripts/release.js
 *
 * Single source of truth for cutting an ESM release.
 *
 * Pipeline:
 *   1.  Parse the requested bump type (patch | minor | major) from argv
 *   2.  Verify Git is installed
 *   3.  Verify working tree is clean (unless --force)
 *   4.  Read current version from package.json and compute the new version
 *   5.  Update package.json with the new version and commit that change
 *   6.  Check whether tag v<newVersion> exists locally
 *   7.  Create the tag if missing
 *   8.  Check whether the tag exists on origin
 *   9.  Push the tag if missing on origin
 *   10. Clean dist/ then run `electron-builder --publish never`
 *   11. Verify build artifacts exist in dist/
 *   12. Connect to the GitHub REST API (no gh CLI, no octokit)
 *   13. Read token from process.env.GH_TOKEN
 *   14. Create the GitHub Release if it doesn't exist
 *   15. Reuse the GitHub Release if it already exists
 *   16. Delete any pre-existing assets with the same filenames
 *   17. Upload latest.yml, the installer, and the blockmap
 *   18. Print a success summary
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const FORCE = true;
const VALID_BUMPS = ['patch', 'minor', 'major'];
let packageJsonBackup = null;

const colors = {
  reset: '\x1b[0m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m',
};
function log(msg) { console.log(msg); }
function step(n, msg) { console.log(`${colors.cyan}[${n}]${colors.reset} ${msg}`); }
function ok(msg) { console.log(`${colors.green}  ✓ ${msg}${colors.reset}`); }
function warn(msg) { console.log(`${colors.yellow}  ! ${msg}${colors.reset}`); }
function restorePackageJsonIfNeeded() {
  if (packageJsonBackup !== null) {
    try { fs.writeFileSync(PACKAGE_JSON_PATH, packageJsonBackup, 'utf8'); warn('Restored original package.json (release aborted before the version-bump commit).'); }
    catch (err) { console.error(`${colors.red}${colors.bold}CRITICAL: failed to restore package.json backup: ${err.message}${colors.reset}`); }
    finally { packageJsonBackup = null; }
  }
}
function fail(msg) { restorePackageJsonIfNeeded(); console.error(`${colors.red}${colors.bold}✗ ${msg}${colors.reset}`); process.exit(1); }
function run(cmd, { allowFailure = false, inherit = false, cwd = ROOT_DIR } = {}) {
  try {
    const output = execSync(cmd, { cwd, stdio: inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
    return typeof output === 'string' ? output.trim() : '';
  } catch (err) { if (allowFailure) return null; throw err; }
}
function parseBumpType() {
  const args = process.argv.slice(2).filter((a) => a !== '--force');
  const bumpArgs = args.filter((a) => VALID_BUMPS.includes(a));
  const unknownArgs = args.filter((a) => !VALID_BUMPS.includes(a) && !a.startsWith('--'));
  if (bumpArgs.length === 0) fail('Missing or invalid release type.');
  if (bumpArgs.length > 1) fail(`Multiple release types specified (${bumpArgs.join(', ')}). Please supply exactly one of: patch, minor, major.`);
  return bumpArgs[0];
}
function readPackageJson() {
  if (!fs.existsSync(PACKAGE_JSON_PATH)) fail(`package.json not found at ${PACKAGE_JSON_PATH}`);
  try { return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8')); }
  catch (err) { fail(`Failed to parse package.json: ${err.message}`); }
}
function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) fail(`package.json version "${version}" is not valid semver (expected MAJOR.MINOR.PATCH).`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}
function bumpVersion(currentVersion, bumpType) {
  const { major, minor, patch } = parseSemver(currentVersion);
  if (bumpType === 'major') return `${major + 1}.0.0`;
  if (bumpType === 'minor') return `${major}.${minor + 1}.0`;
  if (bumpType === 'patch') return `${major}.${minor}.${patch + 1}`;
  fail(`Unknown bump type "${bumpType}".`);
}
function writePackageJsonAtomic(pkg) {
  const tmpPath = `${PACKAGE_JSON_PATH}.tmp`;
  try { fs.writeFileSync(tmpPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8'); fs.renameSync(tmpPath, PACKAGE_JSON_PATH); }
  catch (err) { if (fs.existsSync(tmpPath)) { try { fs.unlinkSync(tmpPath); } catch {} } fail(`Failed to write package.json: ${err.message}`); }
}
function bumpAndCommitVersion(pkg, rawOriginal, newVersion) {
  packageJsonBackup = rawOriginal; pkg.version = newVersion; writePackageJsonAtomic(pkg); ok(`package.json version updated to ${newVersion}.`);
  run('git add package.json');
  const commitResult = run(`git commit -m "chore(release): bump version to ${newVersion}"`, { allowFailure: true });
  if (commitResult === null) fail('Failed to commit the version bump to package.json.');
  ok(`Committed version bump: chore(release): bump version to ${newVersion}`); packageJsonBackup = null; pushCurrentBranchIfPossible();
}
function pushCurrentBranchIfPossible() {
  const hasUpstream = Boolean(run('git rev-parse --abbrev-ref --symbolic-full-name @{u}', { allowFailure: true }));
  if (!hasUpstream) { warn('No upstream branch configured; skipping push of the version-bump commit.'); return; }
  run('git push'); ok('Pushed version-bump commit to origin.');
}
function resolveGitHubRepo(pkg) {
  const envOwner = process.env.GH_OWNER, envRepo = process.env.GH_REPO;
  if (envOwner && envRepo) return { owner: envOwner, repo: envRepo };
  const repoField = pkg.repository;
  const repoUrl = typeof repoField === 'string' ? repoField : repoField && repoField.url;
  if (!repoUrl) fail('Could not determine GitHub owner/repo.');
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/);
  if (!match) fail(`Could not parse GitHub owner/repo from repository URL: ${repoUrl}`);
  return { owner: match[1], repo: match[2] };
}
function verifyGitInstalled() { const versionOutput = run('git --version', { allowFailure: true }); if (!versionOutput) fail('Git does not appear to be installed or is not on PATH.'); ok(`Git detected: ${versionOutput}`); }
function verifyCleanWorkingTree() {
  const status = run('git status --porcelain', { allowFailure: true });
  if (status === null) fail('Failed to run "git status". Is this a Git repository?');
  if (status.length > 0) { if (FORCE) { warn('Working tree has uncommitted changes, continuing because --force was supplied.'); return; } console.error(status); fail('Working tree is not clean. Commit/stash your changes or re-run with --force.'); }
  ok('Working tree is clean.');
}
function tagExistsLocally(tag) { return Boolean(run(`git rev-parse --verify --quiet "refs/tags/${tag}"`, { allowFailure: true })); }
function createLocalTag(tag) { run(`git tag "${tag}"`); ok(`Created local tag ${tag}.`); }
function tagExistsOnRemote(tag) { const result = run(`git ls-remote --tags origin "refs/tags/${tag}"`, { allowFailure: true }); return Boolean(result && result.length > 0); }
function pushTag(tag) { run(`git push origin "${tag}"`); ok(`Pushed tag ${tag} to origin.`); }
function handleTagging(tag) { if (tagExistsLocally(tag)) ok(`Tag ${tag} already exists locally.`); else createLocalTag(tag); if (tagExistsOnRemote(tag)) ok(`Tag ${tag} already exists on origin.`); else pushTag(tag); }
function cleanDistDir() { if (fs.existsSync(DIST_DIR)) { fs.rmSync(DIST_DIR, { recursive: true, force: true }); ok('Removed existing dist/ folder.'); } else ok('dist/ folder does not exist yet, nothing to clean.'); }
function runElectronBuilder() { log('  Running electron-builder --publish never (this may take a while)...'); run('npx --no-install electron-builder --publish never', { inherit: true }); ok('electron-builder finished.'); }
function verifyArtifacts(expectedFiles) {
  const missing = expectedFiles.filter((fileName) => !fs.existsSync(path.join(DIST_DIR, fileName)));
  if (missing.length > 0) fail(`Missing expected build artifact(s) in dist/: ${missing.join(', ')}`);
  expectedFiles.forEach((f) => ok(`Found dist/${f}`));
}
const GITHUB_API = 'https://api.github.com';
function githubHeaders(token, extra = {}) { return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'esm-release-script', ...extra }; }
async function githubRequest(url, token, options = {}) {
  const res = await fetch(url, { ...options, headers: githubHeaders(token, options.headers) });
  if (!res.ok && res.status !== 404) { let body; try { body = await res.json(); } catch { body = await res.text(); } throw new Error(`GitHub API ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`); }
  return res;
}
async function getReleaseByTag(owner, repo, tag, token) { const res = await githubRequest(`${GITHUB_API}/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`, token); if (res.status === 404) return null; return res.json(); }
async function createRelease(owner, repo, tag, token, body) {
  const res = await githubRequest(`${GITHUB_API}/repos/${owner}/${repo}/releases`, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: tag, name: tag, body: body || undefined, generate_release_notes: !body }) });
  return res.json();
}
async function getOrCreateRelease(owner, repo, tag, token, body) { const existing = await getReleaseByTag(owner, repo, tag, token); if (existing) { ok(`Reusing existing GitHub release for ${tag}.`); return existing; } const created = await createRelease(owner, repo, tag, token, body); ok(`Created new GitHub release for ${tag}.`); return created; }
function readReleaseNotesFile() { const notesPath = path.join(ROOT_DIR, 'RELEASE_NOTES.md'); if (!fs.existsSync(notesPath)) return null; const content = fs.readFileSync(notesPath, 'utf8').trim(); return content || null; }
async function deleteExistingAssetsByName(owner, repo, release, fileNames, token) {
  const res = await githubRequest(`${GITHUB_API}/repos/${owner}/${repo}/releases/${release.id}/assets`, token); const assets = await res.json();
  for (const fileName of fileNames) { const match = assets.find((a) => a.name === fileName); if (match) { await githubRequest(`${GITHUB_API}/repos/${owner}/${repo}/releases/assets/${match.id}`, token, { method: 'DELETE' }); ok(`Removed pre-existing asset "${fileName}" from release.`); } }
}
function mimeTypeFor(fileName) { if (fileName.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable'; if (fileName.endsWith('.yml') || fileName.endsWith('.yaml')) return 'text/yaml'; if (fileName.endsWith('.blockmap')) return 'application/octet-stream'; return 'application/octet-stream'; }
async function uploadAsset(release, filePath, token) {
  const fileName = path.basename(filePath);
  const stat = fs.statSync(filePath);
  const fileStream = fs.createReadStream(filePath);
  const baseUploadUrl = release.upload_url.replace(/\{.*\}$/, '');
  const url = `${baseUploadUrl}?name=${encodeURIComponent(fileName)}`;
  const res = await fetch(url, { method: 'POST', headers: githubHeaders(token, { 'Content-Type': mimeTypeFor(fileName), 'Content-Length': stat.size }), body: fileStream, duplex: 'half' });
  if (!res.ok) { let body; try { body = await res.json(); } catch { body = await res.text(); } throw new Error(`Failed to upload asset "${fileName}" (${res.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`); }
  const asset = await res.json(); ok(`Uploaded asset "${fileName}".`); return asset;
}
async function main() {
  log(`${colors.bold}ESM Release Script${colors.reset}`); log(FORCE ? 'Mode: --force (clean working tree check skipped)\n' : '');
  step(1, 'Parsing release arguments'); const bumpType = parseBumpType(); ok(`Release type: ${bumpType}`);
  step(2, 'Verifying Git is installed'); verifyGitInstalled();
  step(3, 'Verifying working tree is clean'); verifyCleanWorkingTree();
  step(4, 'Reading current version from package.json'); const rawOriginal = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'); const pkg = readPackageJson(); const currentVersion = pkg.version; if (!currentVersion) fail('package.json has no "version" field.'); const newVersion = bumpVersion(currentVersion, bumpType); const tag = `v${newVersion}`; ok(`Current version: ${currentVersion}`); ok(`New version:     ${newVersion}  (${bumpType} bump, tag: ${tag})`); const { owner, repo } = resolveGitHubRepo(pkg); ok(`GitHub target: ${owner}/${repo}`);
  step(5, `Updating package.json to ${newVersion} and committing`); bumpAndCommitVersion(pkg, rawOriginal, newVersion);
  step(6, `Checking/creating tag ${tag} locally and on origin`); handleTagging(tag);
  step(10, 'Cleaning dist/ and building the app with electron-builder (--publish never)'); cleanDistDir(); runElectronBuilder();
  step(11, 'Verifying build artifacts exist in dist/'); const exeName = `ESM-Setup-${newVersion}.exe`; const blockmapName = `${exeName}.blockmap`; const yamlName = 'latest.yml'; const expectedFiles = [exeName, blockmapName, yamlName]; verifyArtifacts(expectedFiles);
  step(12, 'Connecting to the GitHub REST API'); const token = process.env.GH_TOKEN; if (!token) fail('GH_TOKEN environment variable is not set.'); ok('GH_TOKEN found.');
  step(14, 'Creating or reusing the GitHub release'); const releaseNotesBody = readReleaseNotesFile(); if (releaseNotesBody) ok('Using RELEASE_NOTES.md as the release changelog body.'); else warn('No RELEASE_NOTES.md found (or it was empty) — falling back to GitHub\'s auto-generated notes.'); const release = await getOrCreateRelease(owner, repo, tag, token, releaseNotesBody);
  step(16, 'Removing any pre-existing assets with the same filenames'); await deleteExistingAssetsByName(owner, repo, release, expectedFiles, token);
  step(17, 'Uploading release assets'); const uploaded = []; for (const fileName of [yamlName, exeName, blockmapName]) { const filePath = path.join(DIST_DIR, fileName); await uploadAsset(release, filePath, token); uploaded.push(fileName); }
  step(18, 'Done'); console.log(''); console.log(`${colors.green}${colors.bold}✔ Release completed successfully${colors.reset}`); console.log(`  Previous version: ${currentVersion}`); console.log(`  New version:      ${newVersion}  (${bumpType})`); console.log(`  Tag:              ${tag}`); console.log(`  Release URL:      ${release.html_url}`); console.log('  Uploaded assets:'); uploaded.forEach((f) => console.log(`    - ${f}`)); console.log('');
}
main().catch((err) => { fail(err && err.message ? err.message : String(err)); });