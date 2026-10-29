import type { AppConfig } from "../config.js";
import { GeminiProvider } from "./gemini.js";
import { GroqProvider } from "./groq.js";
import { MockProvider } from "./mock.js";
import { QuotaGuardedProvider } from "./quotaProvider.js";
import type { LlmProvider } from "./types.js";

/** Mock unless MOCK_MODE=false and a key exists. Groq is primary; the full Groq→Gemini fallback is milestone 7. */
export function selectProvider(config: AppConfig): LlmProvider {
  if (config.mockMode) return new MockProvider();
  if (config.groqApiKey)
    return new QuotaGuardedProvider(new GroqProvider(config.groqApiKey, config.groqModel), config.caps.groq);
  if (config.geminiApiKey)
    return new QuotaGuardedProvider(new GeminiProvider(config.geminiApiKey, config.geminiModel), config.caps.gemini);
  return new MockProvider();
}
