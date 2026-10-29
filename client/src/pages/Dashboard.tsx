import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, analysesApi, type Analysis } from "../api/client";
import { AnalysisForm } from "../components/AnalysisForm";
import { AppHeader } from "../components/AppHeader";
import { MockBanner } from "../components/MockBanner";
import { chainName } from "../wallet/config";

const short = (v = "") => (v.length > 18 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v);
const KIND = { tx: "Tx", address: "Address", signRequest: "Sign request" } as const;

export function Dashboard() {
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    analysesApi
      .list()
      .then((r) => setAnalyses(r.analyses))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load analyses. Is the API running?"));
  }, []);

  return (
    <div className="shell">
      <AppHeader />
      <MockBanner />
      <main id="main" className="content">
        <AnalysisForm onCreated={(a) => navigate(`/analyses/${a.id}`)} />
        <section className="card" aria-labelledby="recent-h" aria-busy={analyses === null && !error}>
          <h2 id="recent-h">Recent analyses</h2>
          {error ? (
            <div role="alert" className="alert">
              {error}
            </div>
          ) : analyses === null ? (
            <ul className="list" aria-label="Loading">
              {[0, 1, 2].map((i) => (
                <li key={i} className="skeleton" />
              ))}
            </ul>
          ) : analyses.length === 0 ? (
            <div className="empty">
              <div className="empty-icon" aria-hidden="true" />
              <p>No analyses yet.</p>
              <p className="muted small">Build a signing request above, or try one of the demo presets.</p>
            </div>
          ) : (
            <ul className="list">
              {analyses.map((a) => (
                <li key={a.id}>
                  <Link className="rowlink" to={`/analyses/${a.id}`}>
                    <span className="sr-only">
                      Open {KIND[a.input.kind]} analysis {a.verdict ? `, ${a.verdict.riskLevel} risk` : ""}
                    </span>
                  </Link>
                  {a.verdict && (
                    <span className={`badge small-badge risk-${a.verdict.riskLevel}`}>{a.verdict.riskLevel}</span>
                  )}
                  <span className="pill">{KIND[a.input.kind]}</span>
                  <code>{short(a.input.value ?? a.input.request?.to ?? a.input.request?.from)}</code>
                  <span className="muted small">{chainName(a.chainId)}</span>
                  <span className={`pill ${a.mode}`}>{a.mode}</span>
                  <span className="muted small push hide-sm">{new Date(a.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
