import { DONT_KNOW } from "../src/verdict/schema.js";

export type Risk = "low" | "medium" | "high" | "unknown";

export interface CaseResult {
  id: string;
  label: "malicious" | "benign" | "no-evidence";
  category: string;
  expectedRisk: Risk;
  predictedRisk: Risk;
  summary: string;
  verdictStatus: "valid" | "repaired" | "fallback";
  citationsValid: boolean;
  relevantNotes: string[];
  retrieved: string[];
  provider: string;
  latencyMs: number;
  tokens: number;
  toolCalls: number;
}

const ratio = (n: number, d: number) => (d === 0 ? 1 : Math.round((n / d) * 1000) / 1000);

/** Retrieval: recall@k over the ranked retrieved list, and reciprocal rank of the first relevant note. */
export function retrievalScores(results: CaseResult[], k = 3) {
  const scored = results.filter((r) => r.relevantNotes.length > 0);
  const per = scored.map((r) => {
    const top = r.retrieved.slice(0, k);
    const hits = top.filter((id) => r.relevantNotes.includes(id)).length;
    const rank = r.retrieved.findIndex((id) => r.relevantNotes.includes(id));
    return { id: r.id, recall: hits / Math.min(k, r.relevantNotes.length), rr: rank === -1 ? 0 : 1 / (rank + 1) };
  });
  const mean = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : 1;
  return {
    cases: scored.length,
    [`recallAt${k}`]: mean(per.map((p) => p.recall)),
    mrr: mean(per.map((p) => p.rr)),
    perCase: per,
  };
}

/** Verdict: accuracy, detection, false alarms, "unknown" behaviour, and citation validity, scored independently of retrieval. */
export function verdictScores(results: CaseResult[]) {
  const n = results.length;
  const correct = results.filter((r) => r.predictedRisk === r.expectedRisk).length;
  const malicious = results.filter((r) => r.label === "malicious");
  const benign = results.filter((r) => r.label === "benign");
  const expectedUnknown = results.filter((r) => r.expectedRisk === "unknown");
  const predictedUnknown = results.filter((r) => r.predictedRisk === "unknown");
  const unknownOk = (r: CaseResult) => r.predictedRisk === "unknown" && DONT_KNOW.test(r.summary);
  const levels: Risk[] = ["low", "medium", "high", "unknown"];
  const confusion = Object.fromEntries(
    levels.map((e) => [
      e,
      Object.fromEntries(
        levels.map((p) => [p, results.filter((r) => r.expectedRisk === e && r.predictedRisk === p).length]),
      ),
    ]),
  );
  return {
    cases: n,
    riskAccuracy: ratio(correct, n),
    maliciousFlaggedRecall: ratio(
      malicious.filter((r) => r.predictedRisk === "high" || r.predictedRisk === "medium").length,
      malicious.length,
    ),
    benignFalseHighRate: ratio(benign.filter((r) => r.predictedRisk === "high").length, benign.length),
    unknownRecall: ratio(expectedUnknown.filter(unknownOk).length, expectedUnknown.length),
    unknownPrecision: ratio(
      predictedUnknown.filter((r) => r.expectedRisk === "unknown").length,
      predictedUnknown.length,
    ),
    citationValidity: ratio(results.filter((r) => r.citationsValid).length, n),
    firstTryValidRate: ratio(results.filter((r) => r.verdictStatus === "valid").length, n),
    confusion,
  };
}

export function gate(scores: Record<string, number>, thresholds: Record<string, number>) {
  return Object.entries(thresholds).map(([key, min]) => {
    const isMax = key.endsWith(".max");
    const metric = isMax ? key.slice(0, -4) : key;
    const value = scores[metric];
    const pass = value !== undefined && (isMax ? value <= min : value >= min);
    return { metric, op: isMax ? "<=" : ">=", threshold: min, value, pass };
  });
}
