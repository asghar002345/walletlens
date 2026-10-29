import { Types } from "mongoose";
import { FallbackProvider } from "../src/llm/fallback.js";
import { MockProvider } from "../src/llm/mock.js";
import { runAgent } from "../src/llm/agent.js";
import { ProviderError, type LlmProvider } from "../src/llm/types.js";
import { QuotaExceededError } from "../src/services/quota.js";
import type { ToolContext } from "../src/tools/index.js";

const failing = (name: string, err: Error): LlmProvider => ({
  name,
  chat: async () => {
    throw err;
  },
});

/** Primary returns HTTP 503, secondary is over its cap: the run must finish on mock with a valid verdict. */
export async function fallbackDrill(ctx: ToolContext) {
  const chain = new FallbackProvider([
    failing("groq", new ProviderError("groq", 503, "HTTP 503")),
    failing("gemini", new QuotaExceededError("gemini", "minute")),
    new MockProvider(),
  ]);
  const run = await runAgent(
    new Types.ObjectId(),
    { kind: "tx", chainId: 11155111, value: `0x${"e1".repeat(32)}` },
    chain,
    ctx,
  );
  const providers = [...new Set([...run.fallbacks.map((f) => f.from), run.provider])];
  const pass =
    run.fallbacks.length === 2 &&
    run.provider === "mock" &&
    run.verdictStatus === "valid" &&
    run.verdict.riskLevel === "high" &&
    run.notices.some((n) => n.includes("switched to mock"));
  return {
    pass,
    providers,
    fallbacks: run.fallbacks.map(({ from, to, reason }) => ({ from, to, reason })),
    notices: run.notices,
  };
}
