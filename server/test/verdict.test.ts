import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { Types } from "mongoose";
import { checkVerdict, unknownVerdict, verdictSchema, type Verdict } from "../src/verdict/schema.js";
import { FixtureChainReader } from "../src/chain/fixtureReader.js";
import { GuardedChainReader } from "../src/chain/guardedReader.js";
import { LocalRetriever } from "../src/rag/retrievers.js";
import { runAgent } from "../src/llm/agent.js";
import { MockProvider } from "../src/llm/mock.js";
import type { ChatMessage, ChatResult, LlmProvider } from "../src/llm/types.js";

const fixtures = FixtureChainReader.fromFile(fileURLToPath(new URL("../fixtures/chain/sepolia.json", import.meta.url)));
const ctx = {
  chain: new GuardedChainReader(null, fixtures, { perMinute: 1, perDay: 1 }, 60),
  retriever: new LocalRetriever(),
};
const SEPOLIA = 11155111;
const ev = { okTools: new Set(["decodeCalldata"]), retrievedNoteIds: new Set(["std-erc20-unlimited"]) };
const good: Verdict = {
  summary: "High risk: unlimited approval.",
  actions: [{ kind: "approval", description: "Approves unlimited spending." }],
  riskLevel: "high",
  reasons: [{ text: "Unlimited allowance.", evidence: ["tool:decodeCalldata", "note:std-erc20-unlimited"] }],
  citations: ["std-erc20-unlimited"],
};
const run = (value: string) =>
  runAgent(new Types.ObjectId(), { kind: "tx", chainId: SEPOLIA, value }, new MockProvider(), ctx);

describe("verdict schema and evidence checks", () => {
  it("accepts a well-formed verdict, also inside a code fence", () => {
    expect(checkVerdict(JSON.stringify(good), ev).ok).toBe(true);
    expect(checkVerdict("```json\n" + JSON.stringify(good) + "\n```", ev).ok).toBe(true);
  });

  it("rejects non-JSON, bad enums, extra keys and reasons without evidence", () => {
    expect(checkVerdict("not json", ev)).toMatchObject({ ok: false, errors: ["Output is not valid JSON"] });
    expect(checkVerdict(JSON.stringify({ ...good, riskLevel: "safe" }), ev).ok).toBe(false);
    expect(checkVerdict(JSON.stringify({ ...good, extra: 1 }), ev).ok).toBe(false);
    expect(checkVerdict(JSON.stringify({ ...good, reasons: [{ text: "x", evidence: [] }] }), ev).ok).toBe(false);
    expect(checkVerdict(JSON.stringify({ ...good, reasons: [] }), ev).ok).toBe(false);
  });

  it("rejects references to tools that didn't run and notes that weren't retrieved", () => {
    const bad = { ...good, reasons: [{ text: "x", evidence: ["tool:getTx", "note:made-up"] }], citations: ["made-up"] };
    const r = checkVerdict(JSON.stringify(bad), ev);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/getTx.*did not run[\s\S]*made-up.*not retrieved/);
  });

  it('requires "unknown" to say it doesn\'t know, and forces "unknown" with no evidence', () => {
    const unknownBad = { ...good, riskLevel: "unknown", summary: "Looks fine." };
    expect(checkVerdict(JSON.stringify(unknownBad), ev).ok).toBe(false);
    expect(verdictSchema.safeParse(unknownVerdict("No data.")).success).toBe(true);
    const none = { okTools: new Set<string>(), retrievedNoteIds: new Set<string>() };
    const lowNoEvidence = {
      ...good,
      riskLevel: "low",
      reasons: [{ text: "x", evidence: ["tool:getTx"] }],
      citations: [],
    };
    expect(checkVerdict(JSON.stringify(lowNoEvidence), none).ok).toBe(false);
  });
});

describe("mock model verdicts (offline)", () => {
  it("high risk for an unlimited approve, citing the unlimited-allowance note first", async () => {
    const r = await run("0x" + "b2".repeat(32));
    expect(r.verdictStatus).toBe("valid");
    expect(r.verdict.riskLevel).toBe("high");
    expect(r.verdict.actions[0].kind).toBe("approval");
    expect(r.retrieved[0].noteId).toBe("std-erc20-unlimited");
    expect(r.verdict.citations).toContain("std-erc20-unlimited");
  });

  it("low risk for a plain ERC-20 transfer and a native transfer", async () => {
    const erc20 = await run("0x" + "a1".repeat(32));
    expect(erc20.verdict).toMatchObject({ riskLevel: "low", actions: [{ kind: "token-transfer" }] });
    const native = await run("0x" + "c3".repeat(32));
    expect(native.verdict).toMatchObject({ riskLevel: "low", actions: [{ kind: "native-transfer" }] });
  });

  it("unknown with a don't-know summary when there is no evidence", async () => {
    const r = await runAgent(
      new Types.ObjectId(),
      { kind: "signRequest", chainId: SEPOLIA, request: { from: "0x2222222222222222222222222222222222222222" } },
      new MockProvider(),
      ctx,
    );
    expect(r.verdict).toEqual(expect.objectContaining({ riskLevel: "unknown", reasons: [], citations: [] }));
    expect(r.verdict.summary).toMatch(/I don't know/);
  });

  it("medium risk for an unrecognised selector", async () => {
    const r = await runAgent(
      new Types.ObjectId(),
      {
        kind: "signRequest",
        chainId: SEPOLIA,
        request: {
          from: "0x2222222222222222222222222222222222222222",
          to: "0x1111111111111111111111111111111111111111",
          data: "0xdeadbeef",
        },
      },
      new MockProvider(),
      ctx,
    );
    expect(r.verdict.riskLevel).toBe("medium");
    expect(r.verdict.actions[0].kind).toBe("unknown");
  });
});

class Scripted implements LlmProvider {
  readonly name = "groq" as const;
  seen: ChatMessage[][] = [];
  constructor(private replies: Partial<ChatResult>[]) {}
  async chat(m: ChatMessage[]) {
    this.seen.push([...m]);
    return {
      content: null,
      toolCalls: [],
      usage: { inputTokens: 1, outputTokens: 1 },
      model: "s",
      ...(this.replies.shift() ?? {}),
    };
  }
}
const decodeCall = { toolCalls: [{ id: "1", name: "decodeCalldata", args: { data: "0x" } }] };
const lowVerdict = {
  summary: "Low risk: plain transfer.",
  actions: [{ kind: "native-transfer", description: "Sends value." }],
  riskLevel: "low",
  reasons: [{ text: "No contract call.", evidence: ["tool:decodeCalldata"] }],
  citations: [],
};

describe("repair-retry", () => {
  it("accepts a valid verdict after one repair and tells the model what was wrong", async () => {
    const p = new Scripted([decodeCall, { content: "{ not json" }, { content: JSON.stringify(lowVerdict) }]);
    const r = await runAgent(new Types.ObjectId(), {}, p, ctx);
    expect(r.verdictStatus).toBe("repaired");
    expect(r.verdict.riskLevel).toBe("low");
    const repairPrompt = p.seen[2].at(-1);
    expect(repairPrompt?.role).toBe("user");
    expect(repairPrompt && "content" in repairPrompt && repairPrompt.content).toMatch(/not valid JSON/);
  });

  it("rejects a hallucinated citation, then falls back to unknown if the repair is still invalid", async () => {
    const hallucinated = { ...lowVerdict, citations: ["invented-note"] };
    const p = new Scripted([
      decodeCall,
      { content: JSON.stringify(hallucinated) },
      { content: JSON.stringify(hallucinated) },
    ]);
    const r = await runAgent(new Types.ObjectId(), {}, p, ctx);
    expect(r.verdictStatus).toBe("fallback");
    expect(r.verdict.riskLevel).toBe("unknown");
    expect(r.verdictErrors.join(" ")).toMatch(/invented-note/);
    expect(r.notices.join(" ")).toMatch(/failed validation twice/);
  });

  it("does not offer tools during the repair turn", async () => {
    const offered: number[] = [];
    const p: LlmProvider = {
      name: "groq",
      chat: async (_m, tools) => {
        offered.push(tools.length);
        return {
          content: offered.length === 1 ? "bad" : JSON.stringify(unknownVerdict("x")),
          toolCalls: [],
          usage: { inputTokens: 0, outputTokens: 0 },
          model: "s",
        };
      },
    };
    const r = await runAgent(new Types.ObjectId(), {}, p, ctx);
    expect(offered).toEqual([5, 0]);
    expect(r.verdictStatus).toBe("repaired");
  });
});
