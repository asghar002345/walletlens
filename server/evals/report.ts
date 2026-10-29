/* eslint-disable @typescript-eslint/no-explicit-any */
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function renderMarkdown(r: any): string {
  const v = r.verdict;
  const lines = [
    `# WalletLens eval report (${r.mode} mode)`,
    "",
    `> ${r.note}`,
    "",
    `Cases: **${r.cases}** · Gate: **${r.gate.pass ? "PASS" : "FAIL"}**`,
    "",
    "## Verdict",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| riskLevel accuracy | ${pct(v.riskAccuracy)} |`,
    `| Malicious flagged (high or medium) | ${pct(v.maliciousFlaggedRecall)} |`,
    `| Benign marked high (false alarm) | ${pct(v.benignFalseHighRate)} |`,
    `| Unknown recall (no-evidence cases answered "unknown" + "don't know") | ${pct(v.unknownRecall)} |`,
    `| Unknown precision | ${pct(v.unknownPrecision)} |`,
    `| Citation validity | ${pct(v.citationValidity)} |`,
    `| Valid on first try | ${pct(v.firstTryValidRate)} |`,
    "",
    "Confusion (rows = expected, columns = predicted):",
    "",
    "| | low | medium | high | unknown |",
    "| --- | --- | --- | --- | --- |",
    ...["low", "medium", "high", "unknown"].map(
      (e) => `| **${e}** | ${["low", "medium", "high", "unknown"].map((p) => v.confusion[e][p]).join(" | ")} |`,
    ),
    "",
    "## Retrieval",
    "",
    `Scored on ${r.retrieval.cases} cases that have labelled relevant notes.`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| recall@3 | ${r.retrieval.recallAt3.toFixed(3)} |`,
    `| MRR | ${r.retrieval.mrr.toFixed(3)} |`,
    "",
    "## Fallback drill",
    "",
    `Primary fails with an HTTP error, secondary hits its cap, run finishes on the mock model: **${r.fallbackDrill.pass ? "pass" : "fail"}**`,
    `(providers used: ${r.fallbackDrill.providers.join(" → ")}; fallbacks: ${r.fallbackDrill.fallbacks.length}).`,
    "",
    "## Gate",
    "",
    "| Metric | Value | Threshold | Result |",
    "| --- | --- | --- | --- |",
    ...r.gate.checks.map((c: any) => `| ${c.metric} | ${c.value} | ${c.op} ${c.threshold} | ${c.pass ? "✅" : "❌"} |`),
    "",
    "## Cases",
    "",
    "| Case | Label | Expected | Predicted | Status | Top retrieved |",
    "| --- | --- | --- | --- | --- | --- |",
    ...r.results.map(
      (c: any) =>
        `| ${c.id} | ${c.label} | ${c.expectedRisk} | ${c.predictedRisk === c.expectedRisk ? c.predictedRisk : `**${c.predictedRisk}**`} | ${c.verdictStatus} | ${c.retrieved[0] ?? "—"} |`,
    ),
    "",
  ];
  return lines.join("\n");
}
