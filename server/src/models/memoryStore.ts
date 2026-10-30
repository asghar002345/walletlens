// Plain in-process store used by the Vercel demo (WALLETLENS_STORE=memory): no MongoDB at all.
// It implements only the small subset of the Mongoose model API that WalletLens uses. Data lives in
// the function instance's memory and is lost when the instance is recycled.
import { Types } from "mongoose";

type Rec = Record<string, unknown>;
type Projection = Record<string, 0 | 1> | string | undefined;

export interface MemoryModelOptions {
  timestamps?: boolean;
  defaults?: () => Rec;
  /** Fields hidden unless explicitly selected (mirrors `select: false`). */
  hidden?: string[];
  /** toJSON transform for non-lean documents (mirrors the schema's toJSON option). */
  toJSON?: (ret: Rec) => Rec;
}

export const isMemoryStore = () => process.env.WALLETLENS_STORE === "memory";

const clone = <T>(v: T): T => structuredClone(v);
const eq = (a: unknown, b: unknown) =>
  a instanceof Date || b instanceof Date
    ? new Date(a as string).getTime() === new Date(b as string).getTime()
    : String(a) === String(b);
const cmp = (a: unknown, b: unknown) => {
  const x = a instanceof Date ? a.getTime() : (a as number);
  const y = b instanceof Date ? b.getTime() : (b as number);
  return x < y ? -1 : x > y ? 1 : 0;
};

function matchValue(value: unknown, cond: unknown): boolean {
  const values = Array.isArray(value) ? value : [value];
  if (cond && typeof cond === "object" && !(cond instanceof Date) && !(cond instanceof Types.ObjectId)) {
    return Object.entries(cond as Rec).every(([op, arg]) => {
      switch (op) {
        case "$in":
          return (arg as unknown[]).some((a) => values.some((v) => eq(v, a)));
        case "$nin":
          return !(arg as unknown[]).some((a) => values.some((v) => eq(v, a)));
        case "$ne":
          return !values.some((v) => eq(v, arg));
        case "$gt":
          return value != null && cmp(value, arg) > 0;
        case "$lt":
          return value != null && cmp(value, arg) < 0;
        default:
          throw new Error(`memory store: unsupported operator ${op}`);
      }
    });
  }
  return values.some((v) => eq(v, cond));
}

export function matches(doc: Rec, filter: Rec = {}): boolean {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === "$or") return (cond as Rec[]).some((f) => matches(doc, f));
    if (k === "$expr") throw new Error("memory store: $expr is not supported");
    return matchValue(doc[k], cond);
  });
}

function applyUpdate(doc: Rec, update: Rec, inserting: boolean) {
  const hasOps = Object.keys(update).some((k) => k.startsWith("$"));
  const set = hasOps ? ((update.$set as Rec) ?? {}) : update;
  Object.assign(doc, clone(set));
  for (const [k, n] of Object.entries((update.$inc as Rec) ?? {})) doc[k] = ((doc[k] as number) ?? 0) + (n as number);
  if (inserting) Object.assign(doc, clone((update.$setOnInsert as Rec) ?? {}));
}

class MemoryQuery<T> implements PromiseLike<T> {
  private sortSpec?: Record<string, 1 | -1>;
  private limitN?: number;
  private isLean = false;
  private extraSelect: Projection;
  constructor(
    private readonly run: (q: {
      sort?: Record<string, 1 | -1>;
      limit?: number;
      lean: boolean;
      select: Projection;
    }) => T,
  ) {}
  sort(s: Record<string, 1 | -1>) {
    this.sortSpec = s;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  select(p: Projection) {
    this.extraSelect = p;
    return this;
  }
  lean() {
    this.isLean = true;
    return this;
  }
  exec() {
    return Promise.resolve().then(() =>
      this.run({ sort: this.sortSpec, limit: this.limitN, lean: this.isLean, select: this.extraSelect }),
    );
  }
  then<A = T, B = never>(
    ok?: ((v: T) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ) {
    return this.exec().then(ok, fail);
  }
}

export function createMemoryModel(opts: MemoryModelOptions = {}) {
  const rows: Rec[] = [];
  const hidden = opts.hidden ?? [];
  let seq = 0;

  function project(row: Rec, projection: Projection, extra: Projection): Rec {
    const out = clone(row);
    const specs = [projection, extra].filter(Boolean) as (Record<string, 0 | 1> | string)[];
    const parsed = specs.map((s) =>
      typeof s === "string"
        ? Object.fromEntries(
            s
              .split(/\s+/)
              .filter(Boolean)
              .map((f) => (f.startsWith("+") ? [f, 1] : [f, 1])),
          )
        : s,
    );
    const plus = new Set(
      parsed.flatMap((p) =>
        Object.keys(p)
          .filter((k) => k.startsWith("+"))
          .map((k) => k.slice(1)),
      ),
    );
    for (const h of hidden) if (!plus.has(h) && !parsed.some((p) => p[h] === 1)) delete out[h];
    for (const p of parsed) {
      const inc = Object.entries(p)
        .filter(([k, v]) => v === 1 && !k.startsWith("+"))
        .map(([k]) => k);
      if (inc.length) for (const k of Object.keys(out)) if (k !== "_id" && !inc.includes(k)) delete out[k];
      for (const [k, v] of Object.entries(p)) if (v === 0) delete out[k];
    }
    return out;
  }

  function hydrate(row: Rec, data: Rec) {
    const doc = data as Rec & { save(): Promise<unknown>; toJSON(): Rec; id: string };
    Object.defineProperties(doc, {
      id: { get: () => String(doc._id), enumerable: false },
      save: {
        enumerable: false,
        value: async () => {
          const plain = { ...doc };
          if (opts.timestamps) plain.updatedAt = new Date();
          Object.assign(row, clone(plain));
          doc.updatedAt = plain.updatedAt;
          return doc;
        },
      },
      toJSON: {
        enumerable: false,
        value: () => {
          const ret = clone({ ...doc });
          return opts.toJSON ? opts.toJSON(ret) : ret;
        },
      },
    });
    return doc;
  }

  function select(filter: Rec | undefined, q: { sort?: Record<string, 1 | -1>; limit?: number }) {
    let out = rows.filter((r) => matches(r, filter));
    if (q.sort) {
      const entries = Object.entries(q.sort);
      out = [...out].sort((a, b) => {
        for (const [k, dir] of entries) {
          const c = k === "_id" ? cmp(rows.indexOf(a), rows.indexOf(b)) : cmp(a[k], b[k]);
          if (c) return c * dir;
        }
        return 0;
      });
    }
    return q.limit ? out.slice(0, q.limit) : out;
  }

  function insert(data: Rec): Rec {
    const now = new Date(Date.now() + seq++ / 1000);
    const row: Rec = {
      _id: new Types.ObjectId().toHexString(), // string ids survive structuredClone
      ...(opts.defaults?.() ?? {}),
      ...clone(data),
      ...(opts.timestamps ? { createdAt: now, updatedAt: now } : {}),
    };
    rows.push(row);
    return row;
  }

  function upsertOne(filter: Rec, update: Rec, upsert?: boolean) {
    const row = rows.find((r) => matches(r, filter));
    if (row) {
      applyUpdate(row, update, false);
      if (opts.timestamps) row.updatedAt = new Date();
      return row;
    }
    if (!upsert) return null;
    const created = insert(
      Object.fromEntries(
        Object.entries(filter).filter(([k, v]) => !k.startsWith("$") && (typeof v !== "object" || v === null)),
      ),
    );
    applyUpdate(created, update, true);
    return created;
  }

  return {
    async create(data: Rec) {
      const row = insert(data);
      return hydrate(row, project(row, undefined, undefined));
    },
    find(filter?: Rec, projection?: Projection) {
      return new MemoryQuery((q) =>
        select(filter, q).map((r) => {
          const data = project(r, projection, q.select);
          return q.lean ? data : hydrate(r, data);
        }),
      );
    },
    findOne(filter?: Rec, projection?: Projection) {
      return new MemoryQuery((q) => {
        const r = select(filter, q)[0];
        if (!r) return null;
        const data = project(r, projection, q.select);
        return q.lean ? data : hydrate(r, data);
      });
    },
    findById(id: unknown) {
      return this.findOne({ _id: id });
    },
    async exists(filter: Rec) {
      const r = rows.find((x) => matches(x, filter));
      return r ? { _id: r._id } : null;
    },
    async updateOne(filter: Rec, update: Rec, o: { upsert?: boolean } = {}) {
      upsertOne(filter, update, o.upsert);
      return { acknowledged: true };
    },
    async updateMany(filter: Rec, update: Rec) {
      for (const r of rows.filter((x) => matches(x, filter))) applyUpdate(r, update, false);
      return { acknowledged: true };
    },
    async findOneAndUpdate(filter: Rec, update: Rec, o: { upsert?: boolean } = {}) {
      const r = upsertOne(filter, update, o.upsert);
      return r ? hydrate(r, project(r, undefined, undefined)) : null;
    },
    async deleteMany(filter: Rec) {
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], filter)) rows.splice(i, 1);
      return { acknowledged: true };
    },
    /** Only the $match / $group ($push, $sum of $cond) / $sort stages used by the metrics route. */
    async aggregate(pipeline: Rec[]) {
      let out: Rec[] = rows.map((r) => clone(r));
      const val = (row: Rec, expr: unknown): unknown => {
        if (typeof expr === "string" && expr.startsWith("$")) return row[expr.slice(1)];
        if (expr && typeof expr === "object" && "$cond" in expr) {
          const [c, a, b] = (expr as { $cond: unknown[] }).$cond;
          return val(row, c) ? val(row, a) : val(row, b);
        }
        return expr;
      };
      for (const stage of pipeline) {
        if (stage.$match) out = out.filter((r) => matches(r, stage.$match as Rec));
        else if (stage.$group) {
          const { _id, ...acc } = stage.$group as Rec;
          const groups = new Map<string, Rec>();
          for (const r of out) {
            const key = val(r, _id);
            const g = groups.get(String(key)) ?? { _id: key };
            for (const [f, spec] of Object.entries(acc as Record<string, Rec>)) {
              if ("$push" in spec) g[f] = [...((g[f] as unknown[]) ?? []), val(r, spec.$push)];
              else if ("$sum" in spec) g[f] = ((g[f] as number) ?? 0) + Number(val(r, spec.$sum));
              else throw new Error("memory store: unsupported accumulator");
            }
            groups.set(String(key), g);
          }
          out = [...groups.values()];
        } else if (stage.$sort) {
          const entries = Object.entries(stage.$sort as Record<string, 1 | -1>);
          out.sort((a, b) => {
            for (const [k, d] of entries) {
              const c = cmp(a[k], b[k]) || String(a[k]).localeCompare(String(b[k]));
              if (c) return c * d;
            }
            return 0;
          });
        } else throw new Error("memory store: unsupported aggregate stage");
      }
      return out;
    },
    async bulkWrite(ops: { updateOne: { filter: Rec; update: Rec; upsert?: boolean } }[]) {
      for (const op of ops) upsertOne(op.updateOne.filter, op.updateOne.update, op.updateOne.upsert);
      return { ok: 1 };
    },
  };
}

/** Same shape as the schemas' toJSON transform: expose `id`, drop `_id` and `__v`. */
export const idTransform = (ret: Record<string, unknown>) => {
  ret.id = String(ret._id);
  delete ret._id;
  delete ret.__v;
  return ret;
};
