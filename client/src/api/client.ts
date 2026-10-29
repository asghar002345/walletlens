export interface User {
  id: string;
  name: string;
  email: string;
}

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export interface Verdict {
  summary: string;
  actions: { kind: string; description: string }[];
  riskLevel: RiskLevel;
  reasons: { text: string; evidence: string[] }[];
  citations: string[];
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
  verdict: Verdict | null;
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
  verdictStatus?: "valid" | "repaired" | "fallback";
  verdictErrors?: string[];
  citations?: string[];
  provider: string;
  steps: TraceStep[];
  fallbacks?: { from: string; to: string; reason: string; at: string }[];
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

export interface LatencyStats {
  count: number;
  p50: number | null;
  p95: number | null;
}

export interface Metrics {
  mode: "mock" | "live";
  analyses: number;
  runLatencyMs: LatencyStats;
  providers: { provider: string; steps: number; latencyMs: LatencyStats; inputTokens: number; outputTokens: number }[];
  fallbacks: { runsWithFallback: number; byPath: { path: string; count: number }[] };
  verdictStatus: Record<string, number>;
  tools: { tool: string; calls: number; errors: number; cached: number; latencyMs: LatencyStats }[];
  quota: { provider: string; usedToday: number; perDay: number; perMinute: number }[];
}

export const metricsApi = { get: () => api<Metrics>("/metrics") };
