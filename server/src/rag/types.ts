export type EmbedTask = "document" | "query";

export interface Embedder {
  readonly name: string;
  readonly dims: number;
  embed(texts: string[], task: EmbedTask): Promise<number[][]>;
}

export interface RetrievedNote {
  noteId: string;
  title: string;
  snippet: string;
  sources: string[];
  tags: string[];
  score: number;
}

export interface RetrieveResult {
  notes: RetrievedNote[];
  backend: "local" | "atlas";
  notice?: string;
}

/** Retrieval backends (offline keyword-vector or Atlas Vector Search) share this interface. */
export interface Retriever {
  search(query: string, k: number, tags?: string[]): Promise<RetrieveResult>;
}

export const noteText = (n: { title: string; body: string; tags?: string[] }) =>
  `${n.title}\n${(n.tags ?? []).join(" ")}\n${n.body}`;

export function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
