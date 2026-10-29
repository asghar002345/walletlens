import { useEffect, useState } from "react";
import { analysesApi, type Analysis } from "../api/client";
import { useAuth } from "../auth";
import { AnalysisForm } from "../components/AnalysisForm";

const CHAIN_NAME: Record<number, string> = { 11155111: "Sepolia", 80002: "Polygon Amoy" };
const short = (v = "") => (v.length > 18 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v);

export function Dashboard() {
  const { user, logout } = useAuth();
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null);
  const [mockMode, setMockMode] = useState(false);

  useEffect(() => {
    analysesApi.list().then((r) => setAnalyses(r.analyses));
    analysesApi.health().then((h) => setMockMode(h.mockMode));
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">WalletLens</div>
        <div className="row">
          <span className="muted small">{user?.email}</span>
          <button className="ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      {mockMode && (
        <div className="notice" role="status">
          Mock mode: chain data and AI responses come from offline fixtures. No API keys are used.
        </div>
      )}
      <main className="content">
        <AnalysisForm onCreated={(a) => setAnalyses((prev) => [a, ...(prev ?? [])])} />
        <section className="card">
          <h2>Recent analyses</h2>
          {analyses === null ? (
            <p className="muted">Loading…</p>
          ) : analyses.length === 0 ? (
            <div className="empty">
              <p>No analyses yet.</p>
              <p className="muted small">Paste a testnet tx hash, an address or an unsigned signing request above.</p>
            </div>
          ) : (
            <ul className="list">
              {analyses.map((a) => (
                <li key={a.id}>
                  <span className="pill">{a.input.kind}</span>
                  <code>{short(a.input.value ?? a.input.request?.to)}</code>
                  <span className="muted small">{CHAIN_NAME[a.chainId]}</span>
                  <span className={`pill ${a.mode}`}>{a.mode}</span>
                  <span className="pill">{a.status === "pending" ? "verdict pending" : a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
