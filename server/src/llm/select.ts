import type { AppConfig } from "../config.js";
import { FallbackProvider } from "./fallback.js";
import { GeminiProvider } from "./gemini.js";
import { GroqProvider } from "./groq.js";
import { MockProvider } from "./mock.js";
import { QuotaGuardedProvider } from "./quotaProvider.js";
import { ProviderError, type FetchLike, type LlmProvider } from "./types.js";
import { QuotaExceededError } from "../services/quota.js";

/**
 * Mock unless MOCK_MODE=false and at least one key exists. Live: Groq → Gemini → mock, each live
 * provider behind its own free-tier caps. Any error or cap moves to the next and is recorded.
 */
export function selectProvider(config: AppConfig, fetchFn?: FetchLike): LlmProvider {
  if (config.faultInject) return faultChain(config.faultInject);
  if (config.mockMode) return new MockProvider();
  const live: LlmProvider[] = [];
  if (config.groqApiKey)
    live.push(
      new QuotaGuardedProvider(new GroqProvider(config.groqApiKey, config.groqModel, fetchFn), config.caps.groq),
    );
  if (config.geminiApiKey)
    live.push(
      new QuotaGuardedProvider(
        new GeminiProvider(config.geminiApiKey, config.geminiModel, fetchFn),
        config.caps.gemini,
      ),
    );
  if (live.length === 0) return new MockProvider();
  return new FallbackProvider([...live, new MockProvider()]);
}

/** Simulated failing providers for the fallback drill: "groq:503,gemini:cap" → Groq errors, Gemini is capped, mock answers. */
export function faultChain(spec: string): LlmProvider {
  const failing = spec
    .split(",")
    .map((p) => p.trim().split(":"))
    .filter(([name]) => name)
    .map(([name, fault]): LlmProvider => ({
      name,
      chat: async () => {
        throw fault === "cap"
          ? new QuotaExceededError(name, "minute")
          : new ProviderError(name, Number(fault) || 500, `HTTP ${fault}`);
      },
    }));
  return new FallbackProvider([...failing, new MockProvider()]);
}
