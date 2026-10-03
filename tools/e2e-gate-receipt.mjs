import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildIdentity, sourceIdentity, newReceipt, recordResult, finishReceipt, saveReceipt, evidenceFile } from './gate-receipt.mjs';

let pass = 0, fail = 0;
const check = async (label, test) => {
  try { await test(); pass++; console.log(`  PASS  ${label}`); }
  catch (error) { fail++; console.log(`  FAIL  ${label}: ${error.message}`); }
};
const source = { commit: 'abc123', dirty: false, sha256: 'source' };
const fixtures = { sha256: 'fixtures', files: [{ path: 'synthetic', sha256: 'fixture' }] };
const build = { root: 'dist', sha256: 'build', files: [{ path: 'index.html', sha256: 'html' }] };
const result = (file = 'one.mjs', status = 'pass') => ({ file, status, code: status === 'fail' ? 1 : 0,
  resultLine: '== RESULT: 1 passed, 0 failed ==', timedOut: false, interrupted: false,
  log: { path: 'one.log', sha256: 'a'.repeat(64), bytes: 40 } });
function ready(scope = 'full') {
  const receipt = newReceipt({ scope, files: ['one.mjs', 'two.mjs'], source: { ...source }, fixtures: structuredClone(fixtures), buildRoot: 'dist' });
  receipt.build.state = 'pass'; receipt.build.before = structuredClone(build);
  recordResult(receipt, result()); recordResult(receipt, result('two.mjs'));
  return receipt;
}
const finish = (receipt, changes = {}) => finishReceipt(receipt, { source: { ...source }, fixtures: structuredClone(fixtures), build: structuredClone(build), exitCode: 0, ...changes });

await check('complete clean full gate is eligible, never installed approval', () => {
  const receipt = finish(ready());
  assert.equal(receipt.outcome, 'pass'); assert.equal(receipt.releaseEligible, true);
  assert.equal(receipt.installedApproval, 'not-assessed'); assert(receipt.finishedAt);
});
for (const scope of ['focused', 'self-test']) await check(`${scope} cannot certify the full gate`, () => {
  const receipt = finish(ready(scope));
  assert.equal(receipt.outcome, 'pass'); assert.equal(receipt.releaseEligible, false);
});
await check('standalone runner self-test needs no app bundle and remains ineligible', () => {
  const receipt = ready('self-test'); receipt.build.state = 'not-required'; receipt.build.before = null;
  assert.equal(finish(receipt, { build: null }).outcome, 'pass'); assert.equal(receipt.releaseEligible, false);
});
await check('all filenames must be unique and the plan nonempty', () => {
  for (const files of [[], ['one', 'one']]) assert.throws(() => newReceipt({ scope: 'full', files, source, fixtures }), /unique nonempty/);
});
await check('unknown, duplicate and invalid outcomes are refused', () => {
  const receipt = ready();
  assert.throws(() => recordResult(receipt, result()), /duplicate/);
  assert.throws(() => recordResult(receipt, result('unknown')), /Unexpected/);
  const empty = newReceipt({ scope: 'full', files: ['one.mjs'], source, fixtures });
  assert.throws(() => recordResult(empty, result('one.mjs', 'green')), /Invalid/);
});
await check('unfinished receipt is explicitly incomplete and ineligible', () => {
  const receipt = newReceipt({ scope: 'full', files: ['one'], source, fixtures });
  assert.equal(receipt.state, 'running'); assert.equal(receipt.outcome, 'incomplete'); assert.equal(receipt.releaseEligible, false);
});
await check('not-run results cannot be hidden by a zero exit code', () => {
  const receipt = ready(); receipt.results[1] = { file: 'two.mjs', status: 'not-run' };
  assert.equal(finish(receipt).outcome, 'fail'); assert.equal(receipt.releaseEligible, false);
});
await check('failed result cannot be hidden by a zero runner exit', () => {
  const receipt = ready(); receipt.results[1] = result('two.mjs', 'fail');
  assert.equal(finish(receipt).outcome, 'fail'); assert.equal(receipt.releaseEligible, false);
});
await check('skip is recorded separately and never qualifies', () => {
  const receipt = ready(); receipt.results[1] = result('two.mjs', 'skip');
  assert.equal(finish(receipt).outcome, 'skipped'); assert.equal(receipt.releaseEligible, false);
});
await check('nonzero runner exit overrides green harnesses', () => {
  const receipt = finish(ready(), { exitCode: 1 }); assert.equal(receipt.outcome, 'fail'); assert.equal(receipt.releaseEligible, false);
});
await check('a passing label cannot conceal nonzero, timeout, interruption or log failure', () => {
  for (const change of [{ code: 1 }, { timedOut: true }, { interrupted: true }, { logError: 'disk full' }]) {
    const receipt = ready(); Object.assign(receipt.results[0], change);
    assert.equal(finish(receipt).outcome, 'fail'); assert.equal(receipt.releaseEligible, false);
  }
});
await check('missing or malformed log fingerprint cannot certify a run', () => {
  for (const log of [null, { sha256: 'fake', bytes: 40 }, { sha256: 'a'.repeat(64), bytes: -1 }]) {
    const receipt = ready(); receipt.results[0].log = log;
    assert.equal(finish(receipt).outcome, 'fail'); assert.equal(receipt.releaseEligible, false);
  }
});
await check('interruption or teardown error is retained', () => {
  const receipt = finish(ready(), { error: 'Gate interrupted' });
  assert.equal(receipt.outcome, 'fail'); assert.deepEqual(receipt.errors, ['Gate interrupted']);
});
await check('dirty source cannot be certified by a clean end state', () => {
  const receipt = ready(); receipt.source.before.dirty = true;
  assert.equal(finish(receipt).releaseEligible, false);
});
await check('dirty end state also prevents certification', () => assert.equal(finish(ready(), { source: { ...source, dirty: true } }).releaseEligible, false));
await check('changed source content fails the run', () => assert.equal(finish(ready(), { source: { ...source, sha256: 'changed' } }).outcome, 'fail'));
await check('changed commit fails even when file bytes agree', () => assert.equal(finish(ready(), { source: { ...source, commit: 'other' } }).outcome, 'fail'));
await check('changed build cannot inherit the original result', () => assert.equal(finish(ready(), { build: { ...build, sha256: 'changed' } }).outcome, 'fail'));
await check('changed fixtures fail the run', () => assert.equal(finish(ready(), { fixtures: { ...fixtures, sha256: 'changed' } }).outcome, 'fail'));
await check('missing registered fixture prevents certification', () => {
  const receipt = ready(); receipt.fixtures.before.files.push({ path: 'canonical', missing: true });
  assert.equal(finish(receipt).releaseEligible, false);
});
await check('skipped build can record passing tests, never release evidence', () => {
  const receipt = ready(); receipt.build.state = 'skipped';
  assert.equal(finish(receipt).outcome, 'pass'); assert.equal(receipt.releaseEligible, false);
});
await check('failed build cannot borrow a pre-existing bundle', () => {
  const receipt = ready(); receipt.build.state = 'fail';
  assert.equal(finish(receipt).outcome, 'fail'); assert.equal(receipt.releaseEligible, false);
});
await check('overridden app root is named and ineligible', () => {
  const receipt = ready(); receipt.environment.appRootOverride = 'another-build';
  assert.equal(finish(receipt).releaseEligible, false);
});
await check('unavailable end fingerprints fail closed', () => assert.equal(finish(ready(), { source: null, fixtures: null, build: null }).outcome, 'fail'));

const scratch = await mkdtemp(resolve(tmpdir(), 'giq-receipt-'));
try {
  const root = resolve(scratch, 'dist'); await mkdir(root);
  await writeFile(resolve(root, 'index.html'), '<html>test</html>');
  await mkdir(resolve(root, 'assets')); await writeFile(resolve(root, 'assets/app.js'), 'first');
  const before = await buildIdentity(root);
  await check('build manifest identifies every served file', () => assert.deepEqual(before.files.map(file => file.path), ['assets/app.js', 'index.html']));
  await check('identical build fingerprints are deterministic', async () => assert.equal((await buildIdentity(root)).sha256, before.sha256));
  await writeFile(resolve(root, 'assets/app.js'), 'second');
  await check('changed asset changes the bundle fingerprint', async () => assert.notEqual((await buildIdentity(root)).sha256, before.sha256));
  await writeFile(resolve(root, 'assets/extra.css'), 'body{}');
  await check('added asset changes the bundle fingerprint', async () => {
    const extra = await buildIdentity(root); await rm(resolve(root, 'assets/extra.css'));
    assert.notEqual(extra.sha256, (await buildIdentity(root)).sha256);
  });
  await check('missing index cannot be treated as a build', async () => {
    const empty = resolve(scratch, 'empty'); await mkdir(empty);
    await assert.rejects(buildIdentity(empty), /entry missing/);
  });
  await check('build links are refused instead of fingerprinting external folders', async () => {
    const link = resolve(root, 'external'); await symlink(resolve(scratch, 'empty'), link, process.platform === 'win32' ? 'junction' : 'dir');
    try { await assert.rejects(buildIdentity(root), /symbolic link/); } finally { await rm(link); }
  });
  const path = resolve(scratch, 'receipt.json'); const receipt = ready();
  await saveReceipt(path, receipt); await saveReceipt(path, finish(receipt));
  await check('receipt updates round-trip the complete machine-readable evidence', async () => assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), receipt));
  await check('log evidence is hashed with a relative path, not its contents', async () => {
    await writeFile(resolve(scratch, 'one.log'), 'private diagnostic');
    const evidence = await evidenceFile(resolve(scratch, 'one.log'), scratch);
    assert.equal(evidence.path, 'one.log'); assert.equal(evidence.bytes, 18); assert.equal(evidence.sha256.length, 64);
    assert(!JSON.stringify(evidence).includes('private diagnostic'));
  });
  await check('missing log fails closed', async () => assert.rejects(evidenceFile(resolve(scratch, 'absent.log'), scratch), /log missing/));
  await check('failed receipt replacement is surfaced, not claimed durable', async () => {
    await writeFile(`${path}.pending`, 'incomplete write');
    await assert.rejects(saveReceipt(path, receipt), /EEXIST/);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), receipt);
  });
  const repo = resolve(scratch, 'repo'); await mkdir(repo);
  const git = (args) => promisify(execFile)('git', args, { cwd: repo, windowsHide: true });
  await git(['init', '-q']);
  await writeFile(resolve(repo, '.gitignore'), '/artifacts/\n');
  await writeFile(resolve(repo, 'app.js'), 'first');
  await git(['add', '--', '.gitignore', 'app.js']);
  await git(['-c', 'user.name=Receipt Test', '-c', 'user.email=receipt@example.invalid', 'commit', '-qm', 'fixture']);
  const clean = await sourceIdentity(repo);
  await check('source identity records a real clean commit', () => assert(clean.commit.length === 40 && !clean.dirty && clean.sha256.length === 64));
  await writeFile(resolve(repo, 'app.js'), 'second');
  const edited = await sourceIdentity(repo);
  await check('tracked edits are dirty and change the source fingerprint', () => assert(edited.dirty && edited.sha256 !== clean.sha256));
  await writeFile(resolve(repo, 'new-test.mjs'), 'untracked');
  const untracked = await sourceIdentity(repo);
  await check('untracked nonignored code participates in the source fingerprint', () => assert(untracked.dirty && untracked.sha256 !== edited.sha256));
  await mkdir(resolve(repo, 'artifacts')); await writeFile(resolve(repo, 'artifacts/receipt.json'), '{}');
  await check('ignored receipts do not invalidate their own source fingerprint', async () => assert.deepEqual(await sourceIdentity(repo), untracked));
  await rm(resolve(repo, 'app.js'));
  await check('deleted tracked source changes the fingerprint without being mistaken for clean', async () => {
    const deleted = await sourceIdentity(repo); assert(deleted.dirty && deleted.sha256 !== untracked.sha256);
  });
} finally {
  assert.equal(dirname(scratch), resolve(tmpdir()));
  assert(scratch.startsWith(resolve(tmpdir(), 'giq-receipt-')));
  await rm(scratch, { recursive: true, force: true });
}
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
process.exitCode = fail ? 1 : 0;
