import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(repo, 'design-approvals', 'APPROVALS.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const printHashes = process.argv.includes('--print-hashes');
const allowed = new Set(registry.allowedStatuses || []);
const normalized = value => value.replaceAll('\\', '/');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function filesUnder(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true })
    .flatMap(entry => filesUnder(path.join(target, entry.name)));
}

function artifactHash(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return hash(fs.readFileSync(target));
  const body = filesUnder(target)
    .sort((a, b) => a.localeCompare(b))
    .map(file => `${normalized(path.relative(target, file))}\0${hash(fs.readFileSync(file))}\n`)
    .join('');
  return hash(body);
}

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: repo });
  return new Set(output.toString('utf8').split('\0').filter(Boolean).map(normalized));
}

assert.equal(registry.schemaVersion, 1, 'unsupported design approval schema');
assert.ok(Array.isArray(registry.manifests) && registry.manifests.length, 'registry has no manifests');
assert.deepEqual(registry.canonicalReportData, {
  seasonId: '2025-st-joseph-mavericks-jv',
  seasonName: '2025 St. Joseph Mavericks - JV',
  sourcePath: 'C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/2025-st-joseph-mavericks-jv/season.json',
  access: 'read-only-copy',
  appliesTo: 'reports.*',
}, 'canonical Reports data authority changed or is incomplete');

const tracked = trackedFiles();
const surfaceIds = new Set();
const artifactPaths = new Set();
let checkedFiles = 0;

for (const manifestRel of registry.manifests) {
  const rel = normalized(manifestRel);
  assert.ok(tracked.has(rel), `manifest is not tracked: ${rel}`);
  const manifestPath = path.join(repo, rel);
  assert.ok(fs.existsSync(manifestPath), `manifest is missing: ${rel}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.ok(manifest.surfaceId, `manifest has no surfaceId: ${rel}`);
  assert.ok(!surfaceIds.has(manifest.surfaceId), `duplicate surfaceId: ${manifest.surfaceId}`);
  surfaceIds.add(manifest.surfaceId);
  assert.ok(allowed.has(manifest.designStatus), `invalid design status for ${manifest.surfaceId}`);
  assert.ok(allowed.has(manifest.productionStatus), `invalid production status for ${manifest.surfaceId}`);

  const artifact = manifest.canonicalArtifact;
  assert.ok(artifact?.path && artifact.sha256, `canonical artifact is incomplete for ${manifest.surfaceId}`);
  const artifactRel = normalized(artifact.path);
  assert.ok(!artifactPaths.has(artifactRel), `canonical artifact is reused by multiple surfaces: ${artifactRel}`);
  artifactPaths.add(artifactRel);
  assert.ok(!artifactRel.startsWith('design-archive/'), `archived artifact cannot be canonical: ${artifactRel}`);
  const artifactPath = path.join(repo, artifactRel);
  assert.ok(fs.existsSync(artifactPath), `canonical artifact is missing: ${artifactRel}`);
  const files = filesUnder(artifactPath);
  assert.equal(files.length, artifact.fileCount, `canonical file count changed: ${artifactRel}`);
  for (const file of files) {
    const fileRel = normalized(path.relative(repo, file));
    assert.ok(tracked.has(fileRel), `canonical artifact is not tracked: ${fileRel}`);
  }
  checkedFiles += files.length;
  const actualHash = artifactHash(artifactPath);
  if (printHashes) console.log(`${artifactRel}|${files.length}|${actualHash}`);
  else assert.equal(actualHash, artifact.sha256, `canonical artifact changed after approval: ${artifactRel}`);

  for (const evidenceKey of ['decisionRecord', 'approvalEvidence']) {
    if (!manifest[evidenceKey]) continue;
    const evidenceRel = normalized(manifest[evidenceKey]);
    const evidencePath = path.join(repo, evidenceRel);
    assert.ok(fs.existsSync(evidencePath), `${evidenceKey} is missing for ${manifest.surfaceId}: ${evidenceRel}`);
    assert.ok(tracked.has(evidenceRel), `${evidenceKey} is not tracked for ${manifest.surfaceId}: ${evidenceRel}`);
  }
}

for (const release of registry.releases || []) {
  assert.ok(allowed.has(release.status), `invalid release status for ${release.version}`);
  assert.ok(release.evidence, `release evidence missing for ${release.version}`);
  const evidenceRel = normalized(release.evidence);
  assert.ok(fs.existsSync(path.join(repo, evidenceRel)), `release evidence is missing: ${evidenceRel}`);
  assert.ok(tracked.has(evidenceRel), `release evidence is not tracked: ${evidenceRel}`);
}

if (!printHashes) console.log(`Design approvals: ${surfaceIds.size} surfaces, ${checkedFiles} canonical files, 0 violations`);
