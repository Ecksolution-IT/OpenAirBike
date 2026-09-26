import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { createMemoryRepositories } from '../src/persistence/memory/memoryRepositories';
import { configure, migrate } from '../src/persistence/sqlite/migrate';
import { createSqlRepositories } from '../src/persistence/sqlite/sqlRepositories';
import { repositoryContract } from './repositoryContract';

const sqlite3Promise = sqlite3InitModule();

repositoryContract('in-memory', async () => createMemoryRepositories());

repositoryContract('SQLite (in-memory, Node)', async () => {
  const sqlite3 = await sqlite3Promise;
  const db = new sqlite3.oo1.DB(':memory:', 'c');
  configure(db);
  migrate(db);
  return createSqlRepositories(db);
});
