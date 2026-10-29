export interface ProviderCaps {
  perMinute: number;
  perDay: number;
}

export interface AppConfig {
  jwtSecret: string;
  clientOrigin: string;
  secureCookies: boolean;
  /** true (default) = no keys needed: fixture chain data, mocked LLM and embeddings. */
  mockMode: boolean;
  /** Dev-only fallback drill, e.g. "groq:503,gemini:cap". Ignored in production. */
  faultInject?: string;
  rpcUrls: { 11155111?: string; 80002?: string };
  apiRateLimit: { windowMs: number; max: number };
  caps: { rpc: ProviderCaps; groq: ProviderCaps; gemini: ProviderCaps; geminiEmbed: ProviderCaps };
  txCacheTtlSec: number;
  groqApiKey?: string;
  groqModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiEmbedModel?: string;
  /** true only when MONGODB_URI is an Atlas cluster with the vector index from knowledge/atlas-vector-index.json. */
  atlasVectorSearch: boolean;
  vectorIndex: string;
}

const int = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 16) throw new Error("JWT_SECRET must be set (min 16 chars)");
  const cap = (name: string, perMinute: number, perDay: number): ProviderCaps => ({
    perMinute: int(env[`${name}_PER_MINUTE`], perMinute),
    perDay: int(env[`${name}_PER_DAY`], perDay),
  });
  return {
    jwtSecret,
    clientOrigin: env.CLIENT_ORIGIN ?? "http://localhost:5173",
    secureCookies: env.NODE_ENV === "production",
    mockMode: env.MOCK_MODE !== "false",
    faultInject: env.NODE_ENV === "production" ? undefined : env.LLM_FAULT_INJECT || undefined,
    rpcUrls: { 11155111: env.SEPOLIA_RPC_URL || undefined, 80002: env.AMOY_RPC_URL || undefined },
    apiRateLimit: { windowMs: int(env.API_RATE_WINDOW_MS, 60_000), max: int(env.API_RATE_MAX, 60) },
    // Conservative defaults, well below the published free-tier limits.
    caps: {
      rpc: cap("RPC", 60, 5_000),
      groq: cap("GROQ", 10, 500),
      gemini: cap("GEMINI", 5, 200),
      geminiEmbed: cap("GEMINI_EMBED", 30, 500),
    },
    txCacheTtlSec: int(env.TX_CACHE_TTL_SEC, 86_400),
    groqApiKey: env.GROQ_API_KEY || undefined,
    groqModel: env.GROQ_MODEL || undefined,
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    geminiModel: env.GEMINI_MODEL || undefined,
    geminiEmbedModel: env.GEMINI_EMBED_MODEL || undefined,
    atlasVectorSearch: env.ATLAS_VECTOR_SEARCH === "true",
    vectorIndex: env.ATLAS_VECTOR_INDEX || "knowledge_vector_index",
  };
}
