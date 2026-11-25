import { ObjectId } from 'mongodb';
export const tables = {};
const clone = (x) => (x == null ? x : structuredClone(JSON.parse(JSON.stringify(x))));
const get = (r, k) => k.split('.').reduce((v, p) => v?.[p], r);
const match = (r, q = {}) =>
  Object.entries(q).every(([k, v]) => {
    if (k === '$and') return v.every((x) => match(r, x));
    if (k === '$or') return v.some((x) => match(r, x));
    const a = get(r, k);
    if (v === null) return a == null;
    if (v && typeof v === 'object' && !v.toHexString) {
      if (v.$in) return v.$in.some((x) => String(a) === String(x));
      if ('$ne' in v) return String(a) !== String(v.$ne);
      if ('$gte' in v || '$lte' in v)
        return a != null && (!('$gte' in v) || a >= v.$gte) && (!('$lte' in v) || a <= v.$lte);
    }
    return String(a) === String(v);
  });
const set = (r, k, v) => {
  const parts = k.split('.');
  let obj = r;
  for (const part of parts.slice(0, -1)) obj = obj[part] ??= {};
  obj[parts.at(-1)] = clone(v);
};
export default {
  collection(name) {
    const rows = (tables[name] ||= []);
    return {
      async dropIndex() {
        return 'fixture';
      },
      async createIndex() {
        return 'fixture';
      },
      async findOne(q) {
        return clone(rows.find((r) => match(r, q)) || null);
      },
      async countDocuments(q) {
        return rows.filter((r) => match(r, q)).length;
      },
      find(q) {
        let data = rows.filter((r) => match(r, q)).map(clone),
          start = 0,
          size = Infinity;
        return {
          map(fn) {
            data = data.map(fn);
            return this;
          },
          sort(sort) {
            data.sort((a, b) => {
              for (const [k, dir] of Object.entries(sort)) {
                if (a[k] !== b[k]) return (a[k] > b[k] ? 1 : -1) * dir;
              }
              return 0;
            });
            return this;
          },
          skip(n) {
            start = n;
            return this;
          },
          limit(n) {
            size = n;
            return this;
          },
          async toArray() {
            return data.slice(start, start + size);
          },
        };
      },
      aggregate(stages) {
        let data = rows.filter((r) => match(r, stages[0].$match));
        const group = stages[1].$group;
        const buckets = new Map();
        for (const r of data) {
          const key = String(r[group._id.slice(1)]);
          if (!buckets.has(key)) buckets.set(key, { _id: r[group._id.slice(1)], count: 0, sum: 0 });
          const g = buckets.get(key);
          g.count++;
          g.sum += r.rating;
        }
        return {
          async toArray() {
            return [...buckets.values()].map((g) =>
              group.average
                ? { _id: g._id, count: g.count, average: g.sum / g.count }
                : { _id: g._id, count: g.count },
            );
          },
        };
      },
      async updateOne(q, update, { upsert } = {}) {
        let row = rows.find((r) => match(r, q));
        if (!row && upsert) {
          row = { _id: new ObjectId().toString(), ...clone(update.$setOnInsert) };
          rows.push(row);
        }
        if (!row) return { matchedCount: 0 };
        for (const [k, v] of Object.entries(update.$set || {})) set(row, k, v);
        return { matchedCount: 1 };
      },
      async insertOne(doc) {
        const _id = doc._id || new ObjectId();
        rows.push(clone({ ...doc, _id }));
        return { insertedId: _id };
      },
      async updateMany(q, u) {
        let n = 0;
        for (const row of rows)
          if (match(row, q)) {
            for (const [k, v] of Object.entries(u.$set || {})) set(row, k, v);
            n++;
          }
        return { matchedCount: n };
      },
      async deleteMany(q) {
        let n = 0;
        for (let i = rows.length - 1; i >= 0; i--)
          if (match(rows[i], q)) {
            rows.splice(i, 1);
            n++;
          }
        return { deletedCount: n };
      },
      async deleteOne(q) {
        const i = rows.findIndex((r) => match(r, q));
        if (i >= 0) rows.splice(i, 1);
        return { deletedCount: i >= 0 ? 1 : 0 };
      },
    };
  },
};
