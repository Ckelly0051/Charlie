import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { SqlCatalog } from '../js/sql-catalog.js';
import { CatalogPersistence } from '../js/catalog-persistence.js';
import { TauriBackend } from '../js/storage-backend.js';

const SQL = await initSqlJs();
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  PASS  ${name}`); };
const makeFs = () => {
  const state = { db: null, fail: false };
  return { state, readDb: async () => state.db,
    writeDb: async bytes => {
      if (state.fail) throw new Error('disk down');
      state.db = bytes.slice();
    },
    readJson: async () => ({ id: 'legacy', seasonName: 'Legacy', games: [] }),
  };
};
const catalog = fs => new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
const version = (id, owner) => ({ id, label: owner, data: { owner } });

await check('a colliding version id never changes another game', async () => {
  const fs = makeFs(), cp = catalog(fs);
  assert.equal(await cp.saveVersion('season-a', 'game-a', version('shared', 'A')), 'shared');
  assert.deepEqual(await catalog(fs).getVersionScoped('season-a', 'game-a', 'shared'), { owner: 'A' });
  assert.equal(await cp.saveVersion('season-b', 'game-b', version('shared', 'B')), null);
  assert.deepEqual(await cp.getVersionScoped('season-a', 'game-a', 'shared'), { owner: 'A' });
});

await check('a failed version delete reports failure and keeps the row in memory and on disk', async () => {
  const fs = makeFs(), cp = catalog(fs);
  await cp.saveVersion('season', 'game', version('keep', 'A'));
  fs.state.fail = true;
  assert.equal(await cp.deleteVersionScoped('season', 'game', 'keep'), false);
  assert.deepEqual(await cp.getVersionScoped('season', 'game', 'keep'), { owner: 'A' });
  assert.deepEqual(await catalog(fs).getVersionScoped('season', 'game', 'keep'), { owner: 'A' });
});

await check('a failed first-run import neither claims success nor leaves an in-memory season', async () => {
  const fs = makeFs(), cp = catalog(fs);
  fs.state.fail = true;
  await assert.rejects(cp.migrateJsonSeasons(['legacy']), /did not reach disk/);
  assert.deepEqual(await cp.listSeasons(), []);
  assert.equal(fs.state.db, null);
  fs.state.fail = false;
  assert.equal(await cp.migrateJsonSeasons(['legacy']), 1);
  assert.equal((await catalog(fs).listSeasons()).length, 1);
});

await check('desktop catalog writes stage first and never overwrite the live db on failure', async () => {
  const files = new Map([['seasons/library.db', new Uint8Array([1, 2, 3])]]);
  let failStage = false, failReplace = false, replaces = 0;
  globalThis.window = globalThis;
  window.__TAURI__ = {
    fs: {
      BaseDirectory: { AppData: 14, Document: 1 },
      mkdir: async () => {},
      writeFile: async (path, bytes) => {
        assert.match(path, /^seasons\/library\.db\.pending-[\da-f-]+$/);
        files.set(path, failStage ? bytes.slice(0, 1) : bytes.slice());
        if (failStage) throw new Error('partial stage');
      },
      remove: async path => { files.delete(path); },
    },
    core: { invoke: async (command, { tempName }) => {
      assert.equal(command, 'replace_catalog_db');
      replaces++;
      if (failReplace) throw new Error('replace failed');
      files.set('seasons/library.db', files.get(`seasons/${tempName}`));
      files.delete(`seasons/${tempName}`);
    } },
  };
  const adapter = new TauriBackend()._catalogFs();
  failStage = true;
  await assert.rejects(adapter.writeDb(new Uint8Array([4, 5, 6])), /partial stage/);
  assert.deepEqual([...files.get('seasons/library.db')], [1, 2, 3]);
  assert.equal(replaces, 0);
  failStage = false; failReplace = true;
  await assert.rejects(adapter.writeDb(new Uint8Array([4, 5, 6])), /replace failed/);
  assert.deepEqual([...files.get('seasons/library.db')], [1, 2, 3]);
  assert.equal([...files.keys()].length, 1);
  failReplace = false;
  await adapter.writeDb(new Uint8Array([4, 5, 6]));
  assert.deepEqual([...files.get('seasons/library.db')], [4, 5, 6]);
});

console.log(`\n== RESULT: ${passed} passed, 0 failed ==`);
