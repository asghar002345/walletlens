import { Router } from "express";
import { Analysis } from "../models/analysis.js";
import { ToolCall } from "../models/toolCall.js";
import { usageToday } from "../services/quota.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppConfig } from "../config.js";
import type { AgentRun } from "../llm/agent.js";

/** Nearest-rank percentile; null when there are no samples. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

const stats = (xs: number[]) => ({ count: xs.length, p50: percentile(xs, 50), p95: percentile(xs, 95) });

/** Latency/token/fallback/quota dashboard data, computed from the caller's own stored traces. */
export function metricsRouter(config: AppConfig) {
  const router = Router();
  router.use(requireAuth(config.jwtSecret));

  router.get("/", async (req, res) => {
    const analyses = await Analysis.find({ userId: req.userId, status: "complete" })
      .sort({ createdAt: -1 })
      .limit(500)
      .select("trace createdAt")
      .lean();
    const runs = analyses.map((a) => a.trace as AgentRun | null).filter((t): t is AgentRun => !!t);

    const byProvider = new Map<string, { latency: number[]; input: number; output: number; steps: number }>();
    const fallbackCounts = new Map<string, number>();
    const verdictStatus: Record<string, number> = { valid: 0, repaired: 0, fallback: 0 };
    const runLatency: number[] = [];
    for (const run of runs) {
      verdictStatus[run.verdictStatus] = (verdictStatus[run.verdictStatus] ?? 0) + 1;
      runLatency.push(run.steps.reduce((s, x) => s + x.latencyMs, 0));
      for (const step of run.steps) {
        const p = byProvider.get(step.provider) ?? { latency: [], input: 0, output: 0, steps: 0 };
        p.latency.push(step.latencyMs);
        p.input += step.inputTokens;
        p.output += step.outputTokens;
        p.steps++;
        byProvider.set(step.provider, p);
      }
      for (const f of run.fallbacks ?? []) {
        const key = `${f.from} → ${f.to} (${f.reason})`;
        fallbackCounts.set(key, (fallbackCounts.get(key) ?? 0) + 1);
      }
    }

    const tools = await ToolCall.aggregate<{ _id: string; latencies: number[]; errors: number; cached: number }>([
      { $match: { analysisId: { $in: analyses.map((a) => a._id) } } },
      {
        $group: {
          _id: "$tool",
          latencies: { $push: "$latencyMs" },
          errors: { $sum: { $cond: ["$ok", 0, 1] } },
          cached: { $sum: { $cond: ["$cached", 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const quotaNames = { groq: "groq", gemini: "gemini", geminiEmbed: "geminiEmbed", rpc: "rpc" } as const;
    const quota = await Promise.all(
      (Object.keys(quotaNames) as (keyof typeof quotaNames)[]).map(async (key) => ({
        provider: key,
        usedToday: await usageToday(quotaNames[key]),
        perDay: config.caps[key].perDay,
        perMinute: config.caps[key].perMinute,
      })),
    );

    res.json({
      mode: config.mockMode ? "mock" : "live",
      analyses: runs.length,
      runLatencyMs: stats(runLatency),
      providers: [...byProvider].map(([provider, p]) => ({
        provider,
        steps: p.steps,
        latencyMs: stats(p.latency),
        inputTokens: p.input,
        outputTokens: p.output,
      })),
      fallbacks: {
        runsWithFallback: runs.filter((r) => (r.fallbacks ?? []).length > 0).length,
        byPath: [...fallbackCounts].map(([path, count]) => ({ path, count })),
      },
      verdictStatus,
      tools: tools.map((t) => ({
        tool: t._id,
        calls: t.latencies.length,
        errors: t.errors,
        cached: t.cached,
        latencyMs: stats(t.latencies),
      })),
      quota,
    });
  });
  return router;
}
