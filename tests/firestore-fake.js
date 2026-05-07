'use strict';
const clone = (value) => value === undefined ? undefined : structuredClone(value);
function firestoreFake() {
  const records = new Map(), transactions = []; let pending = Promise.resolve();
  const snapshot = (id, source = records) => ({ id, exists: source.has(id), data: () => clone(source.get(id)) });
  const reference = (id) => ({ id, async get() { return snapshot(id); }, async set(value) { records.set(id, clone(value)); } });
  function query(filters = [], orders = [], cursor, count = Infinity) {
    return {
      where(field, op, value) { return query([...filters, [field, op, value]], orders, cursor, count); },
      orderBy(field, direction = 'asc') { return query(filters, [...orders, [typeof field === 'string' ? field : '__name__', direction]], cursor, count); },
      startAfter(...values) { return query(filters, orders, values, count); },
      limit(value) { return query(filters, orders, cursor, value); },
      async get() {
        let rows = [...records].filter(([, value]) => filters.every(([key, op, expected]) => {
          const actual = value[key];
          return op === '==' ? actual === expected : op === 'in' ? expected.includes(actual) : op === '>=' ? actual >= expected : op === '<=' ? actual <= expected : actual < expected;
        }));
        const values = ([id, value]) => orders.map(([key]) => key === '__name__' ? id : value[key]);
        const compare = (a, b) => { for (let i = 0; i < orders.length; i++) { const c = a[i] < b[i] ? -1 : a[i] > b[i] ? 1 : 0; if (c) return orders[i][1] === 'desc' ? -c : c; } return 0; };
        rows.sort((a, b) => compare(values(a), values(b)));
        if (cursor) rows = rows.filter((row) => compare(values(row), cursor) > 0);
        return { docs: rows.slice(0, count).map(([id]) => snapshot(id)) };
      },
    };
  }
  const db = {
    failCommit: false,
    collection() { return { ...query(), doc: reference }; },
    // Serialize transactions like Firestore pessimistic transactions, with atomic rollback.
    runTransaction(callback) {
      const run = pending.then(async () => {
        const staged = new Map(records); const writes = []; let wrote = false;
        const transaction = {
          async get(ref) { if (wrote) throw new Error('Firestore reads must precede writes'); return snapshot(ref.id, staged); },
          create(ref, value) { wrote = true; if (staged.has(ref.id)) throw new Error('Document exists'); staged.set(ref.id, clone(value)); writes.push(ref.id); },
          set(ref, value) { wrote = true; staged.set(ref.id, clone(value)); writes.push(ref.id); },
        };
        const result = await callback(transaction);
        if (db.failCommit) throw Object.assign(new Error('Backend unavailable'), { code: 14 });
        records.clear(); for (const [id, value] of staged) records.set(id, value);
        transactions.push(writes); return result;
      });
      pending = run.catch(() => {}); return run;
    },
  };
  return { db, records, transactions };
}
function storageFake() {
  const objects = new Map(), signing = [];
  const storage = { bucket: () => ({ file: (path) => ({
    async save(body, options) { if (options.preconditionOpts.ifGenerationMatch === 0 && objects.has(path)) throw Object.assign(new Error('Exists'), { code: 412 }); objects.set(path, String(body)); },
    async download() { if (!objects.has(path)) throw new Error('Missing object'); return [Buffer.from(objects.get(path))]; },
    async getSignedUrl(options) { signing.push(options); return [`https://storage.googleapis.com/private/${path}?signature=test`]; },
  }) }) };
  return { storage, objects, signing };
}
module.exports = { firestoreFake, storageFake };
