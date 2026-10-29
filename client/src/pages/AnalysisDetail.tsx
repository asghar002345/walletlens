import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, analysesApi, type Analysis, type ToolCallLog } from "../api/client";
import { VerdictCard } from "../components/VerdictCard";

const CHAIN_NAME: Record<number, string> = { 11155111: "Sepolia", 80002: "Polygon Amoy" };

/** Walk a tool result and collect any untrusted strings the server flagged as instruction-like. */
function suspiciousTexts(v: unknown, out: string[] = []): string[] {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.untrusted === true && o.suspicious === true && typeof o.text === "string") out.push(o.text);
    Object.values(o).forEach((x) => suspiciousTexts(x, out));
  }
  return out;
}

function ToolCallRow({ call, index, anchor }: { call: ToolCallLog; index: number; anchor: boolean }) {
  const flagged = suspiciousTexts(call.result);
  return (
    <li className={`toolcall ${call.ok ? "" : "failed"}`} id={anchor ? `tool-${call.tool}` : undefined}>
      <details>
        <summary>
          <span className="idx">{index + 1}</span>
          <code className="tool">{call.tool}</code>
          <span className={`pill ${call.ok ? "ok" : "bad"}`}>{call.ok ? "ok" : "rejected"}</span>
          {call.cached && <span className="pill">cached</span>}
          {flagged.length > 0 && <span className="pill warn">untrusted text flagged</span>}
          <span className="muted small push">{call.latencyMs} ms</span>
        </summary>
        <div className="io">
          <div>
            <h4>Arguments (Zod-validated)</h4>
            <pre>{JSON.stringify(call.args, null, 2)}</pre>
          </div>
          <div>
            <h4>{call.ok ? "Result" : "Error"}</h4>
            <pre>{call.ok ? JSON.stringify(call.result, null, 2) : call.error}</pre>
          </div>
        </div>
        {flagged.map((t) => (
          <p key={t} className="flag small">
            Chain data contained instruction-like text, treated as data and not followed: <q>{t}</q>
          </p>
        ))}
      </details>
    </li>
  );
}

export function AnalysisDetail() {
  const { id = "" } = useParams();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [calls, setCalls] = useState<ToolCallLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([analysesApi.get(id), analysesApi.toolCalls(id)])
      .then(([a, t]) => {
        setAnalysis(a.analysis);
        setCalls(t.toolCalls);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Network error"));
  }, [id]);

  if (error)
    return (
      <main className="content">
        <div role="alert" className="alert">
          {error}
        </div>
        <Link to="/">← Back</Link>
      </main>
    );
  if (!analysis) return <p className="muted center">Loading…</p>;
  const t = analysis.trace;
  const target = analysis.input.value ?? analysis.input.request?.to ?? "";

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand plain">
          WalletLens
        </Link>
        <Link to="/" className="small">
          ← All analyses
        </Link>
      </header>
      {analysis.notices.length > 0 && (
        <div className="notice" role="status">
          {analysis.notices.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
      )}
      <main className="content">
        {analysis.verdict && (
          <VerdictCard verdict={analysis.verdict} status={t?.verdictStatus} retrieved={t?.retrieved} />
        )}
        <section className="card">
          <div className="row between">
            <h2>Analysis</h2>
            <div className="row">
              <span className="pill">{analysis.input.kind}</span>
              <span className="pill">{CHAIN_NAME[analysis.chainId]}</span>
              <span className={`pill ${analysis.mode}`}>{analysis.mode}</span>
            </div>
          </div>
          <code className="target">{target}</code>
          {t && (
            <>
              <div className="stats">
                <div>
                  <b>{t.totals.toolCalls}</b>
                  <span>tool calls</span>
                </div>
                <div>
                  <b>{t.steps.length}</b>
                  <span>model steps</span>
                </div>
                <div>
                  <b>{t.totals.inputTokens + t.totals.outputTokens}</b>
                  <span>tokens{t.provider === "mock" ? " (est.)" : ""}</span>
                </div>
                <div>
                  <b>{t.totals.latencyMs} ms</b>
                  <span>model time</span>
                </div>
              </div>
            </>
          )}
        </section>

        {t && (
          <section className="card">
            <h2>Trace</h2>
            <ol className="trace">
              {t.steps.map((s) => (
                <li key={s.step}>
                  <span className="idx">{s.step}</span>
                  <div>
                    <div className="small">
                      <b>{s.provider}</b> <span className="muted">{s.model}</span>
                    </div>
                    <div className="muted small">
                      {s.final
                        ? "Answered"
                        : `Requested ${s.toolCalls.map((c) => `${c.name}${c.ok ? "" : " (rejected)"}`).join(", ")}`}{" "}
                      · {s.inputTokens}→{s.outputTokens} tokens · {s.latencyMs} ms
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {t && (
          <section className="card">
            <h2>Retrieved notes</h2>
            <p className="muted small">
              Curated WalletLens notes returned by <code>retrieveNotes</code>, ranked by similarity. Cited notes are the
              ones the explanation relies on.
            </p>
            {(t.retrieved?.length ?? 0) === 0 ? (
              <p className="muted">No notes were retrieved for this analysis.</p>
            ) : (
              <ul className="notes">
                {t.retrieved!.map((n) => (
                  <li key={n.noteId} id={`note-${n.noteId}`} className={t.citations?.includes(n.noteId) ? "cited" : ""}>
                    <div className="row between">
                      <b>{n.title}</b>
                      <span className="row">
                        {t.citations?.includes(n.noteId) && <span className="pill ok">cited</span>}
                        <span className="pill">score {n.score.toFixed(2)}</span>
                      </span>
                    </div>
                    <code className="muted small">{n.noteId}</code>
                    <div className="sources small">
                      {n.sources.map((src) => (
                        <a key={src} href={src} target="_blank" rel="noreferrer noopener">
                          {src.replace(/^https?:\/\//, "")}
                        </a>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="card">
          <h2>Tool-call log</h2>
          <p className="muted small">
            Every call is validated and stored in MongoDB. Read-only: no tool can sign or send.
          </p>
          {calls.length === 0 ? (
            <p className="muted">No tool calls recorded.</p>
          ) : (
            <ul className="toolcalls">
              {calls.map((c, i) => (
                <ToolCallRow
                  key={c.id}
                  call={c}
                  index={i}
                  anchor={calls.findIndex((x) => x.tool === c.tool && x.ok) === i}
                />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
