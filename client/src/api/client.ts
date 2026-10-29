export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Analysis {
  id: string;
  chainId: number;
  input: { kind: "tx" | "address" | "signRequest"; value?: string; request?: Record<string, string> };
  chainData: unknown;
  status: "pending" | "complete" | "failed";
  mode: "mock" | "live";
  notices: string[];
  trace: Trace | null;
  createdAt: string;
}

export interface TraceStep {
  step: number;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: { name: string; ok: boolean; error?: string }[];
  final: boolean;
}

export interface RetrievedRef {
  noteId: string;
  title: string;
  score: number;
  sources: string[];
}

export interface Trace {
  draft: string;
  retrieved?: RetrievedRef[];
  citations?: string[];
  provider: string;
  steps: TraceStep[];
  totals: { inputTokens: number; outputTokens: number; latencyMs: number; toolCalls: number };
}

export interface ToolCallLog {
  id: string;
  tool: string;
  args: unknown;
  ok: boolean;
  result?: unknown;
  error?: string;
  latencyMs: number;
  cached: boolean;
  createdAt: string;
}

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: FieldError[] = [],
  ) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error?.message ?? "Request failed", body.error?.details);
  return body as T;
}

const post = <T>(path: string, data?: unknown) =>
  api<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });

export const authApi = {
  me: () => api<{ user: User }>("/auth/me"),
  login: (email: string, password: string) => post<{ user: User }>("/auth/login", { email, password }),
  register: (name: string, email: string, password: string) =>
    post<{ user: User }>("/auth/register", { name, email, password }),
  logout: () => post<void>("/auth/logout"),
};

export const analysesApi = {
  list: () => api<{ analyses: Analysis[] }>("/analyses"),
  create: (input: Record<string, unknown>) => post<{ analysis: Analysis }>("/analyses", input),
  get: (id: string) => api<{ analysis: Analysis }>(`/analyses/${id}`),
  toolCalls: (id: string) => api<{ toolCalls: ToolCallLog[] }>(`/analyses/${id}/toolcalls`),
  health: () => api<{ ok: boolean; mockMode: boolean }>("/health"),
};
