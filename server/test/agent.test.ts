import { beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { Types } from "mongoose";
import { FixtureChainReader } from "../src/chain/fixtureReader.js";
import { GuardedChainReader } from "../src/chain/guardedReader.js";
import { LocalRetriever } from "../src/rag/retrievers.js";
import { ToolCall } from "../src/models/toolCall.js";
import { MAX_STEPS, runAgent } from "../src/llm/agent.js";
import { MockProvider } from "../src/llm/mock.js";
import { QuotaExceededError } from "../src/services/quota.js";
import type { ChatMessage, ChatResult, LlmProvider } from "../src/llm/types.js";

const fixtures = FixtureChainReader.fromFile(fileURLToPath(new URL("../fixtures/chain/sepolia.json", import.meta.url)));
const ctx = {
  chain: new GuardedChainReader(null, fixtures, { perMinute: 1, perDay: 1 }, 60),
  retriever: new LocalRetriever(),
};
const SEPOLIA = 11155111;

/** A provider that replays scripted replies, for testing the loop's handling of model behaviour. */
class ScriptedProvider implements LlmProvider {
  readonly name = "groq" as const;
  seen: ChatMessage[][] = [];
  constructor(private replies: (Partial<ChatResult> | Error)[]) {}
  async chat(messages: ChatMessage[]) {
    this.seen.push([...messages]);
    const r = this.replies.shift() ?? { content: "done" };
    if (r instanceof Error) throw r;
    return { content: null, toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 }, model: "scripted", ...r };
  }
}

beforeEach(async () => {
  await ToolCall.deleteMany({});
});

describe("runAgent with the mock provider", () => {
  it("investigates an approve tx with all four tools and logs each call", async () => {
    const analysisId = new Types.ObjectId();
    const run = await runAgent(
      analysisId,
      { kind: "tx", chainId: SEPOLIA, value: "0x" + "b2".repeat(32) },
      new MockProvider(),
      ctx,
    );
    const tools = (await ToolCall.find({ analysisId }).sort({ _id: 1 })).map((t) => t.tool);
    expect(tools).toEqual(["getTx", "decodeCalldata", "lookupContract", "getTokenApprovals", "retrieveNotes"]);
    expect(run.verdict.riskLevel).toBe("high");
    expect(run.verdictStatus).toBe("valid");
    expect(run.verdict.citations).toContain("std-erc20-unlimited");
    expect(run.steps.at(-1)?.final).toBe(true);
    expect(run.totals.toolCalls).toBe(5);
    expect(run.citations.length).toBeGreaterThan(0);
    expect(run.citations.every((id) => run.retrieved.some((r) => r.noteId === id))).toBe(true);
    expect(run.totals.inputTokens).toBeGreaterThan(0);
  });

  it("is not steered by an injected token name and flags it instead", async () => {
    const run = await runAgent(
      new Types.ObjectId(),
      { kind: "tx", chainId: SEPOLIA, value: "0x" + "d4".repeat(32) },
      new MockProvider(),
      ctx,
    );
    expect(run.verdict.riskLevel).toBe("high");
    expect(run.verdict.reasons.map((r) => r.text).join(" ")).toMatch(/instruction-like text/);
    expect(run.verdict.citations).toContain("scam-token-name-injection");
  });

  it("says it doesn't know when there is no evidence", async () => {
    const run = await runAgent(
      new Types.ObjectId(),
      { kind: "signRequest", chainId: SEPOLIA, request: { from: "0x2222222222222222222222222222222222222222" } },
      new MockProvider(),
      ctx,
    );
    expect(run.verdict.riskLevel).toBe("unknown");
    expect(run.verdict.summary).toMatch(/I don't know/);
  });
});

describe("runAgent loop mechanics", () => {
  it("feeds tool output back wrapped as untrusted data and logs invalid model args", async () => {
    const p = new ScriptedProvider([
      { toolCalls: [{ id: "1", name: "getTx", args: { chainId: SEPOLIA, hash: "nope" } }] },
      { content: "final answer" },
    ]);
    const analysisId = new Types.ObjectId();
    const run = await runAgent(analysisId, { kind: "tx" }, p, ctx);
    // "final answer" is not JSON, the repair reply ("done") isn't either, so the verdict falls back to unknown.
    expect(run.verdictStatus).toBe("fallback");
    expect(run.verdict.riskLevel).toBe("unknown");
    const toolMsg = p.seen[1].find((m) => m.role === "tool");
    expect(toolMsg && "content" in toolMsg && JSON.parse(toolMsg.content)).toMatchObject({
      untrusted_tool_output: { ok: false },
    });
    expect(await ToolCall.countDocuments({ analysisId, ok: false })).toBe(1);
    expect(p.seen[0][0].content).toMatch(/UNTRUSTED DATA/);
  });

  it(`stops after ${MAX_STEPS} steps`, async () => {
    const loop = Array.from({ length: 20 }, () => ({
      toolCalls: [{ id: "x", name: "decodeCalldata", args: { data: "0x" } }],
    }));
    const run = await runAgent(new Types.ObjectId(), {}, new ScriptedProvider(loop), ctx);
    expect(run.steps).toHaveLength(MAX_STEPS);
    expect(run.verdict).toMatchObject({ riskLevel: "unknown" });
    expect(run.verdict.summary).toMatch(/I don't know/);
  });

  it("falls back to the mock model with a notice when the provider cap is hit", async () => {
    const p = new ScriptedProvider([new QuotaExceededError("groq", "day")]);
    const run = await runAgent(
      new Types.ObjectId(),
      { kind: "address", chainId: SEPOLIA, value: "0x1111111111111111111111111111111111111111" },
      p,
      ctx,
    );
    expect(run.provider).toBe("mock");
    expect(run.notices.join(" ")).toMatch(/groq day cap reached/);
    expect(run.verdictStatus).toBe("valid");
  });
});
