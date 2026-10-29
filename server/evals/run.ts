// `npm run eval`: run the labelled eval set through the real tool loop and score retrieval and verdicts separately.
// Mock mode (default) needs no keys and no network: fixture chain data, offline retrieval, mock model.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { loadConfig, type AppConfig } from "../src/config.js";
import { FixtureChainReader } from "../src/chain/fixtureReader.js";
import { GuardedChainReader } from "../src/chain/guardedReader.js";
import { seedKnowledge } from "../src/rag/seed.js";
import { selectRetriever } from "../src/rag/select.js";
import { selectProvider } from "../src/llm/select.js";
import { runAgent } from "../src/llm/agent.js";
import { ToolCall } from "../src/models/toolCall.js";
import { checkVerdict } from "../src/verdict/schema.js";
import { gate, retrievalScores, verdictScores, type CaseResult } from "./metrics.js";
import { fallbackDrill } from "./drill.js";
import { renderMarkdown } from "./report.js";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const env = process.env;
const int = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

/** Evals have their own, lower caps so a run can never eat the app's free-tier quota. */
export function evalConfig(
  e: Record<string, string | undefined> = env,
): AppConfig & { delayMs: number; maxCases: number } {
  const base = loadConfig({ JWT_SECRET: "eval-runner-does-not-use-jwt", ...e });
  const cap = (name: string, perMinute: number, perDay: number) => ({
    perMinute: int(e[`EVAL_${name}_PER_MINUTE`], perMinute),
    perDay: int(e[`EVAL_${name}_PER_DAY`], perDay),
  });
  return {
    ...base,
    caps: {
      rpc: cap("RPC", 30, 500),
      groq: cap("GROQ", 6, 150),
      gemini: cap("GEMINI", 4, 80),
      geminiEmbed: cap("GEMINI_EMBED", 20, 200),
    },
    delayMs: int(e.EVAL_DELAY_MS, base.mockMode ? 0 : 4000),
    maxCases: int(e.EVAL_MAX_CASES, 1000),
  };
}

async function main() {
  const config = evalConfig();
  const cases = JSON.parse(readFileSync(here("cases.json"), "utf8")) as (Omit<CaseResult, "predictedRisk"> & {
    input: unknown;
  })[];
  const chainFixtures = FixtureChainReader.fromFile(here("chain.json"));

  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("walletlens-eval"));
  await seedKnowledge();
  const ctx = {
    chain: new GuardedChainReader(null, chainFixtures, config.caps.rpc, 60),
    retriever: selectRetriever(config),
  };
  const provider = selectProvider(config);

  const results: CaseResult[] = [];
  for (const c of cases.slice(0, config.maxCases)) {
    const id = new Types.ObjectId();
    const run = await runAgent(id, c.input, provider, ctx);
    const calls = await ToolCall.find({ analysisId: id }).lean();
    const okTools = new Set(calls.filter((t) => t.ok && t.tool !== "retrieveNotes").map((t) => t.tool));
    const firstRetrieval = calls.find((t) => t.tool === "retrieveNotes" && t.ok)?.result as
      { notes?: { noteId: string }[] } | undefined;
    const retrieved = (firstRetrieval?.notes ?? []).map((n) => n.noteId);
    const citationsValid = checkVerdict(JSON.stringify(run.verdict), {
      okTools,
      retrievedNoteIds: new Set(run.retrieved.map((r) => r.noteId)),
    }).ok;
    results.push({
      id: c.id,
      label: c.label,
      category: c.category,
      expectedRisk: c.expectedRisk,
      predictedRisk: run.verdict.riskLevel,
      summary: run.verdict.summary,
      verdictStatus: run.verdictStatus,
      citationsValid,
      relevantNotes: c.relevantNotes,
      retrieved,
      provider: run.provider,
      latencyMs: run.totals.latencyMs,
      tokens: run.totals.inputTokens + run.totals.outputTokens,
      toolCalls: run.totals.toolCalls,
    });
    if (config.delayMs) await new Promise((r) => setTimeout(r, config.delayMs));
  }

  const retrieval = retrievalScores(results, 3);
  const verdict = verdictScores(results);
  const drill = await fallbackDrill(ctx);
  const flat: Record<string, number> = {
    "verdict.riskAccuracy": verdict.riskAccuracy,
    "verdict.maliciousFlaggedRecall": verdict.maliciousFlaggedRecall,
    "verdict.benignFalseHighRate": verdict.benignFalseHighRate,
    "verdict.unknownRecall": verdict.unknownRecall,
    "verdict.unknownPrecision": verdict.unknownPrecision,
    "verdict.citationValidity": verdict.citationValidity,
    "retrieval.recallAt3": retrieval.recallAt3 as number,
    "retrieval.mrr": retrieval.mrr,
  };
  const thresholds = JSON.parse(readFileSync(here("thresholds.json"), "utf8")) as Record<string, number>;
  const checks = [
    ...gate(flat, thresholds),
    { metric: "fallbackDrill", op: "==", threshold: 1, value: drill.pass ? 1 : 0, pass: drill.pass },
  ];
  const report = {
    mode: config.mockMode ? "mock" : "live",
    note: config.mockMode
      ? "Mock mode: deterministic mock model, offline keyword retrieval and fixture chain data. Not a measure of a real LLM."
      : "Live mode: real providers with eval-specific caps.",
    cases: results.length,
    retrieval: { cases: retrieval.cases, recallAt3: retrieval.recallAt3, mrr: retrieval.mrr },
    verdict,
    fallbackDrill: drill,
    gate: { pass: checks.every((c) => c.pass), checks },
    results,
    retrievalPerCase: retrieval.perCase,
  };
  mkdirSync(here("results"), { recursive: true });
  writeFileSync(here("results/latest.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(here("results/latest.md"), renderMarkdown(report));
  await mongoose.disconnect();
  await mongo.stop();

  console.log(
    `[eval:${report.mode}] cases=${report.cases} riskAcc=${verdict.riskAccuracy} malRecall=${verdict.maliciousFlaggedRecall} ` +
      `unknown=${verdict.unknownRecall}/${verdict.unknownPrecision} citations=${verdict.citationValidity} ` +
      `recall@3=${retrieval.recallAt3} mrr=${retrieval.mrr} drill=${drill.pass} gate=${report.gate.pass ? "PASS" : "FAIL"}`,
  );
  for (const c of checks.filter((c) => !c.pass))
    console.error(`  FAIL ${c.metric}: ${c.value} (needs ${c.op} ${c.threshold})`);
  if (!report.gate.pass && env.EVAL_NO_GATE !== "true") process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
