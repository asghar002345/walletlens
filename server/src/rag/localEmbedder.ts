import type { Embedder } from "./types.js";

const STOP = new Set(
  "a an and are as at be by can for from has have if in into is it its of on or so than that the their then this to was when which with you your not no only any all one".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((t) => !STOP.has(t) && t.length > 1)
    .map((t) => (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

/** FNV-1a 32-bit hash, so the same token always lands in the same dimension. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic offline embedding: hashed unigrams and bigrams with log term frequency, L2-normalised.
 * It is keyword similarity, not semantics, but it is free, instant and reproducible in tests and CI.
 */
export class LocalHashEmbedder implements Embedder {
  readonly name = "local-hash-v1";
  constructor(readonly dims = 1024) {}

  async embed(texts: string[]) {
    return texts.map((t) => this.vector(t));
  }

  vector(text: string): number[] {
    const tokens = tokenize(text);
    const counts = new Map<number, number>();
    const add = (f: string, w: number) => {
      const i = hash(f) % this.dims;
      counts.set(i, (counts.get(i) ?? 0) + w);
    };
    tokens.forEach((t, i) => {
      add(t, 1);
      if (i > 0) add(`${tokens[i - 1]}_${t}`, 0.5);
    });
    const v = new Array<number>(this.dims).fill(0);
    for (const [i, c] of counts) v[i] = 1 + Math.log(c);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}
