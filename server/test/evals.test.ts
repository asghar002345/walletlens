import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gate, retrievalScores, verdictScores, type CaseResult } from "../evals/metrics.js";
import { evalConfig } from "../evals/run.js";

const base: CaseResult = {
  id: "x",
  label: "benign",
  category: "c",
  expectedRisk: "low",
  predictedRisk: "low",
  summary: "",
  verdictStatus: "valid",
  citationsValid: true,
  relevantNotes: [],
  retrieved: [],
  provider: "mock",
  latencyMs: 0,
  tokens: 0,
  toolCalls: 0,
};

describe("eval metrics", () => {
  it("scores retrieval recall@3 and MRR only on labelled cases", () => {
    const r = retrievalScores([
      { ...base, relevantNotes: ["a"], retrieved: ["z", "a"] },
      { ...base, relevantNotes: ["b", "c"], retrieved: ["b", "x", "y", "c"] },
      { ...base },
    ]);
    expect(r.cases).toBe(2);
    expect(r.recallAt3).toBe(0.75);
    expect(r.mrr).toBe(0.75);
  });

  it("scores verdicts: accuracy, detection, false alarms, unknown and citations", () => {
    const v = verdictScores([
      { ...base, label: "malicious", expectedRisk: "high", predictedRisk: "medium" },
      { ...base, predictedRisk: "high", citationsValid: false },
      { ...base, label: "no-evidence", expectedRisk: "unknown", predictedRisk: "unknown", summary: "I don't know." },
      { ...base, predictedRisk: "unknown", summary: "I don't know." },
    ]);
    expect(v.riskAccuracy).toBe(0.25);
    expect(v.maliciousFlaggedRecall).toBe(1);
    expect(v.benignFalseHighRate).toBe(0.5);
    expect(v.unknownRecall).toBe(1);
    expect(v.unknownPrecision).toBe(0.5);
    expect(v.citationValidity).toBe(0.75);
  });

  it("gates on minimums and .max ceilings", () => {
    const g = gate({ a: 0.9, b: 0.1 }, { a: 0.95, "b.max": 0.2, c: 1 });
    expect(g.map((x) => x.pass)).toEqual([false, true, false]);
  });

  it("uses eval-specific caps, not the app's", () => {
    const c = evalConfig({ EVAL_GROQ_PER_DAY: "7", GROQ_PER_DAY: "999" });
    expect(c.caps.groq.perDay).toBe(7);
    expect(c.mockMode).toBe(true);
    expect(evalConfig({ MOCK_MODE: "false" }).delayMs).toBe(4000);
  });

  it("the eval set has >= 20 labelled cases covering the required attacks", () => {
    const cases = JSON.parse(readFileSync(new URL("../evals/cases.json", import.meta.url), "utf8")) as CaseResult[];
    expect(cases.length).toBeGreaterThanOrEqual(20);
    const cats = new Set(cases.map((c) => c.category));
    for (const c of ["prompt-injection", "permit", "operator", "poisoning"]) expect(cats).toContain(c);
    expect(cases.filter((c) => c.label === "benign").length).toBeGreaterThanOrEqual(5);
    expect(cases.filter((c) => c.label === "malicious").length).toBeGreaterThanOrEqual(10);
  });
});
