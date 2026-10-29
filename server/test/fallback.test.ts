import { beforeEach, describe, expect, it, vi } from "vitest";
import { Analysis } from "../src/models/analysis.js";
import { Usage } from "../src/models/usage.js";
import { FallbackProvider } from "../src/llm/fallback.js";
import { MockProvider } from "../src/llm/mock.js";
import { faultChain, selectProvider } from "../src/llm/select.js";
import { ProviderError, type LlmProvider } from "../src/llm/types.js";
import { QuotaExceededError } from "../src/services/quota.js";
import { percentile } from "../src/routes/metrics.js";
import { loggedInAgent, makeApp, testConfig } from "./helpers.js";

const SEPOLIA = 11155111;
const APPROVE_TX = "0x" + "b2".repeat(32);
const ok = (name: string): LlmProvider => ({
  name,
  chat: vi.fn(async () => ({ content: "{}", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: name })),
});
const failing = (name: string, err: Error): LlmProvider => ({ name, chat: vi.fn(async () => Promise.reject(err)) });

beforeEach(async () => {
  await Promise.all([Analysis.deleteMany({}), Usage.deleteMany({})]);
});

describe("FallbackProvider", () => {
  it("uses the primary when it works", async () => {
    const chain = new FallbackProvider([ok("groq"), ok("gemini")]);
    expect((await chain.chat([], [])).provider).toBe("groq");
    expect(chain.takeEvents()).toEqual([]);
  });

  it("moves Groq → Gemini on HTTP error and records why", async () => {
    const gemini = ok("gemini");
    const chain = new FallbackProvider([failing("groq", new ProviderError("groq", 429, "x")), gemini]);
    expect((await chain.chat([], [])).provider).toBe("gemini");
    expect(chain.takeEvents()).toMatchObject([{ from: "groq", to: "gemini", reason: "HTTP 429" }]);
    // sticky within the run: the next step goes straight to Gemini
    await chain.chat([], []);
    expect(gemini.chat).toHaveBeenCalledTimes(2);
  });

  it("falls through a cap and a timeout to mock; forRun starts fresh", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    const groq = failing("groq", new QuotaExceededError("groq", "day"));
    const chain = new FallbackProvider([groq, failing("gemini", timeout), ok("mock")]);
    expect((await chain.chat([], [])).provider).toBe("mock");
    expect(chain.takeEvents().map((e) => e.reason)).toEqual(["day cap reached", "timed out"]);
    await chain.forRun().chat([], []);
    expect(groq.chat).toHaveBeenCalledTimes(2);
  });

  it("rethrows when the last provider fails", async () => {
    await expect(new FallbackProvider([failing("groq", new Error("boom"))]).chat([], [])).rejects.toThrow("boom");
  });
});

describe("selectProvider", () => {
  it("mock by default, Groq → Gemini → mock chain in live mode", () => {
    expect(selectProvider(testConfig())).toBeInstanceOf(MockProvider);
    const live = selectProvider(testConfig({ mockMode: false, groqApiKey: "k", geminiApiKey: "k" }));
    expect(live).toBeInstanceOf(FallbackProvider);
    expect(live.name).toBe("groq");
    expect(selectProvider(testConfig({ mockMode: false }))).toBeInstanceOf(MockProvider);
  });

  it("ignores the fault drill in production config", async () => {
    const { loadConfig } = await import("../src/config.js");
    const prod = loadConfig({ JWT_SECRET: "x".repeat(20), NODE_ENV: "production", LLM_FAULT_INJECT: "groq:503" });
    expect(prod.faultInject).toBeUndefined();
  });
});

describe("fallback through the API + metrics", () => {
  it("records fallbacks and notices on the analysis, and the dashboard reports them", async () => {
    const app = makeApp({}, { llm: faultChain("groq:503,gemini:cap") });
    const agent = await loggedInAgent(app);
    const { body } = await agent.post("/api/analyses").send({ kind: "tx", chainId: SEPOLIA, value: APPROVE_TX });
    expect(body.analysis.verdict.riskLevel).toBe("high");
    expect(body.analysis.trace.fallbacks).toHaveLength(2);
    expect(body.analysis.notices.join(" ")).toMatch(/groq HTTP 503; switched to gemini/);
    expect(body.analysis.notices.join(" ")).toMatch(/switched to mock/);

    const m = await agent.get("/api/metrics");
    expect(m.status).toBe(200);
    expect(m.body.analyses).toBe(1);
    expect(m.body.fallbacks.runsWithFallback).toBe(1);
    expect(m.body.fallbacks.byPath.map((p: { path: string }) => p.path)).toContain("groq → gemini (HTTP 503)");
    expect(m.body.providers[0]).toMatchObject({ provider: "mock" });
    expect(m.body.providers[0].latencyMs.p95).toBeGreaterThanOrEqual(0);
    expect(m.body.tools.length).toBeGreaterThan(0);
    expect(m.body.quota.map((q: { provider: string }) => q.provider)).toEqual(["groq", "gemini", "geminiEmbed", "rpc"]);
  });

  it("metrics require auth and only cover the caller's analyses", async () => {
    const app = makeApp();
    const a = await loggedInAgent(app);
    await a.post("/api/analyses").send({ kind: "tx", chainId: SEPOLIA, value: APPROVE_TX });
    const b = await loggedInAgent(app);
    expect((await b.get("/api/metrics")).body.analyses).toBe(0);
  });

  it("percentile uses nearest rank", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 95)).toBe(100);
  });
});
