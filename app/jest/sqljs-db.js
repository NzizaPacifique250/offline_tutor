/* eslint-env jest */
// A real SQLite engine for tests, wrapped in the slice of the op-sqlite API
// the application uses (execute, transaction, getDbPath).
//
// The recorder in opsqlite-mock.js answers a few statement shapes and logs the
// rest; it cannot tell whether a CREATE TABLE, a migration or a SELECT is
// actually right. sql.js (SQLite compiled to WebAssembly) can, so the learner
// store and the content layer are tested against it.

const initSqlJs = require('sql.js');

async function makeSqlDb() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const execute = async (sql, params = []) => {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params.map(p => (p === undefined ? null : p)));
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      const rowsAffected = db.getRowsModified();
      let insertId;
      if (/^\s*INSERT/i.test(sql)) {
        insertId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
      }
      return { rows, rowsAffected, insertId };
    } finally {
      stmt.free();
    }
  };

  const transaction = async fn => {
    await execute('BEGIN');
    try {
      await fn({ execute, commit: async () => {}, rollback: async () => {} });
      await execute('COMMIT');
    } catch (e) {
      await execute('ROLLBACK');
      throw e;
    }
  };

  return {
    execute,
    transaction,
    getDbPath: () => ':memory:',
    close: () => db.close(),
    /** Raw access for assertions. */
    __raw: db,
  };
}

module.exports = { makeSqlDb };
