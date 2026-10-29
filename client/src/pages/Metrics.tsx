import { useEffect, useState } from "react";
import { metricsApi, type LatencyStats, type Metrics } from "../api/client";
import { AppHeader } from "../components/AppHeader";

const LABEL: Record<string, string> = {
  groq: "Groq",
  gemini: "Gemini",
  geminiEmbed: "Gemini embeddings",
  rpc: "Testnet RPC",
  mock: "Mock (offline)",
};
const label = (p: string) => LABEL[p] ?? p;
const ms = (v: number | null) => (v === null ? "—" : `${v} ms`);
const n = (v: number) => v.toLocaleString();

function Stat({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="muted small">{title}</span>
      <strong>{value}</strong>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

function LatencyCells({ s }: { s: LatencyStats }) {
  return (
    <>
      <td className="num">{ms(s.p50)}</td>
      <td className="num">{ms(s.p95)}</td>
    </>
  );
}

export function MetricsPage() {
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    metricsApi
      .get()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const total = data ? Object.values(data.verdictStatus).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="shell">
      <AppHeader />
      <main id="main" className="content" aria-busy={!data && !error}>
        <div className="stack">
          <div>
            <h1>Latency, tokens and fallbacks</h1>
            <p className="muted">
              From the traces of your last {data ? data.analyses : "…"} analyses and today&apos;s quota counters.
              {data?.mode === "mock" && " Mock mode: latencies are local and tokens are estimates."}
            </p>
          </div>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          {!data && !error && <div className="skeleton" style={{ height: 120 }} />}
          {data && data.analyses === 0 && (
            <section className="card empty">
              <p>No completed analyses yet. Run one from the Analyses page and come back.</p>
            </section>
          )}
          {data && data.analyses > 0 && (
            <>
              <section className="stats" aria-label="Summary">
                <Stat title="Analyses" value={n(data.analyses)} />
                <Stat
                  title="Run latency p50 / p95"
                  value={`${ms(data.runLatencyMs.p50)} / ${ms(data.runLatencyMs.p95)}`}
                />
                <Stat
                  title="Runs with a fallback"
                  value={n(data.fallbacks.runsWithFallback)}
                  hint={`${Math.round((data.fallbacks.runsWithFallback / data.analyses) * 100)}% of runs`}
                />
                <Stat
                  title="Verdicts valid first try"
                  value={`${Math.round(((data.verdictStatus.valid ?? 0) / Math.max(1, total)) * 100)}%`}
                  hint={`${data.verdictStatus.repaired ?? 0} repaired · ${data.verdictStatus.fallback ?? 0} fell back`}
                />
              </section>

              <section className="card" aria-labelledby="prov-h">
                <h2 id="prov-h">Model providers</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Provider</th>
                        <th scope="col" className="num">
                          Steps
                        </th>
                        <th scope="col" className="num">
                          p50
                        </th>
                        <th scope="col" className="num">
                          p95
                        </th>
                        <th scope="col" className="num">
                          Input tokens
                        </th>
                        <th scope="col" className="num">
                          Output tokens
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.providers.map((p) => (
                        <tr key={p.provider}>
                          <th scope="row">{label(p.provider)}</th>
                          <td className="num">{n(p.steps)}</td>
                          <LatencyCells s={p.latencyMs} />
                          <td className="num">{n(p.inputTokens)}</td>
                          <td className="num">{n(p.outputTokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="grid-even">
                <section className="card" aria-labelledby="fb-h">
                  <h2 id="fb-h">Fallbacks</h2>
                  {data.fallbacks.byPath.length === 0 ? (
                    <p className="muted small">No provider switches recorded.</p>
                  ) : (
                    <ul className="plainlist">
                      {data.fallbacks.byPath.map((f) => (
                        <li key={f.path} className="row">
                          <code>{f.path}</code>
                          <span className="pill warn push">{f.count}×</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="card" aria-labelledby="q-h">
                  <h2 id="q-h">Free-tier quota today</h2>
                  <ul className="plainlist">
                    {data.quota.map((q) => {
                      const pct = Math.min(100, Math.round((q.usedToday / Math.max(1, q.perDay)) * 100));
                      return (
                        <li key={q.provider}>
                          <div className="row">
                            <span>{label(q.provider)}</span>
                            <span className="muted small push">
                              {n(q.usedToday)} / {n(q.perDay)} per day · {q.perMinute}/min
                            </span>
                          </div>
                          <div
                            className={`meter ${pct >= 80 ? "hot" : ""}`}
                            role="meter"
                            aria-label={`${label(q.provider)} daily quota used`}
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </div>

              <section className="card" aria-labelledby="tools-h">
                <h2 id="tools-h">Tools</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Tool</th>
                        <th scope="col" className="num">
                          Calls
                        </th>
                        <th scope="col" className="num">
                          Rejected
                        </th>
                        <th scope="col" className="num">
                          Cached
                        </th>
                        <th scope="col" className="num">
                          p50
                        </th>
                        <th scope="col" className="num">
                          p95
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tools.map((t) => (
                        <tr key={t.tool}>
                          <th scope="row">
                            <code>{t.tool}</code>
                          </th>
                          <td className="num">{n(t.calls)}</td>
                          <td className="num">{n(t.errors)}</td>
                          <td className="num">{n(t.cached)}</td>
                          <LatencyCells s={t.latencyMs} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
