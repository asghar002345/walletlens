import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetricsPage } from "../src/pages/Metrics";
import { renderWithProviders } from "./utils";

const metrics = {
  mode: "mock",
  analyses: 3,
  runLatencyMs: { count: 3, p50: 12, p95: 40 },
  providers: [
    { provider: "mock", steps: 9, latencyMs: { count: 9, p50: 1, p95: 3 }, inputTokens: 1200, outputTokens: 300 },
  ],
  fallbacks: { runsWithFallback: 1, byPath: [{ path: "groq → gemini (HTTP 503)", count: 1 }] },
  verdictStatus: { valid: 3, repaired: 0, fallback: 0 },
  tools: [{ tool: "getTx", calls: 3, errors: 0, cached: 1, latencyMs: { count: 3, p50: 2, p95: 5 } }],
  quota: [{ provider: "groq", usedToday: 4, perDay: 500, perMinute: 10 }],
};

afterEach(() => vi.unstubAllGlobals());

describe("Metrics page", () => {
  it("shows provider latency, tokens, fallbacks and quota", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = url.includes("/metrics")
          ? metrics
          : url.includes("/auth/me")
            ? { user: { id: "1", name: "T", email: "t@x.io" } }
            : {};
        return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    renderWithProviders(<MetricsPage />);
    expect(await screen.findByRole("heading", { name: "Model providers" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Mock (offline)" })).toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText("groq → gemini (HTTP 503)")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: /Groq daily quota/ })).toHaveAttribute("aria-valuenow", "1");
  });
});
