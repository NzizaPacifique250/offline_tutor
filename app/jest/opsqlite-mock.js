/* eslint-env jest */
// An in-memory stand-in for @op-engineering/op-sqlite.
//
// It is not SQL. It answers the handful of statement shapes the application
// issues (a COUNT, the content_version lookup and upsert) and records every
// statement it receives, so tests can assert on what the importer did without
// a native database.

function makeDb() {
  const log = [];
  const versions = new Map();

  const execute = async (sql, params = []) => {
    log.push({ sql, params });
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/^SELECT COUNT\(\*\) AS n/i.test(s)) {
      return { rows: [{ n: 0 }], rowsAffected: 0 };
    }
    if (/^SELECT version FROM content_version/i.test(s)) {
      const v = versions.get(params[0]);
      return { rows: v ? [{ version: v }] : [], rowsAffected: 0 };
    }
    if (/^INSERT INTO content_version/i.test(s)) {
      versions.set(params[0], params[1]);
      return { rows: [], rowsAffected: 1, insertId: 1 };
    }
    if (/^INSERT/i.test(s)) {
      return { rows: [], rowsAffected: 1, insertId: log.length };
    }
    return { rows: [], rowsAffected: 0 };
  };

  const tx = { execute, commit: async () => {}, rollback: async () => {} };
  return {
    execute,
    executeSync: (sql, params) => {
      log.push({ sql, params });
      return { rows: [], rowsAffected: 0 };
    },
    executeBatch: async commands => {
      for (const [sql, params] of commands) {
        await execute(sql, params);
      }
      return { rowsAffected: commands.length };
    },
    transaction: async fn => fn(tx),
    getDbPath: () => '/mock/tutor.db',
    close: () => {},
    delete: () => {},
    __log: log,
  };
}

module.exports = {
  open: jest.fn(() => makeDb()),
  __makeDb: makeDb,
};
