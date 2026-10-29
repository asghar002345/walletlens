import type { RetrievedRef, Verdict } from "../api/client";

const RISK_LABEL = { high: "High risk", medium: "Medium risk", low: "Low risk", unknown: "Unknown" } as const;
const STATUS_LABEL = {
  valid: "Schema-validated",
  repaired: "Validated after 1 repair",
  fallback: "Model output rejected; fallback",
} as const;

function EvidenceChip({ ref_, notes }: { ref_: string; notes: Map<string, RetrievedRef> }) {
  const [kind, id] = ref_.split(":");
  if (kind === "note")
    return (
      <a className="chip note" href={`#note-${id}`} title={notes.get(id)?.title}>
        {id}
      </a>
    );
  return (
    <a className="chip tool" href={`#tool-${id}`}>
      {id}
    </a>
  );
}

export function VerdictCard({
  verdict,
  status,
  retrieved = [],
}: {
  verdict: Verdict;
  status?: keyof typeof STATUS_LABEL;
  retrieved?: RetrievedRef[];
}) {
  const notes = new Map(retrieved.map((n) => [n.noteId, n]));
  return (
    <section className={`card verdict risk-${verdict.riskLevel}`} aria-label="Verdict">
      <div className="row between">
        <h2>Verdict</h2>
        <div className="row">
          {status && <span className="pill">{STATUS_LABEL[status]}</span>}
          <span className={`badge risk-${verdict.riskLevel}`} data-testid="risk-badge">
            {RISK_LABEL[verdict.riskLevel]}
          </span>
        </div>
      </div>
      <p className="summary">{verdict.summary}</p>

      {verdict.actions.length > 0 && (
        <div>
          <h3>What it does</h3>
          <ul className="actions">
            {verdict.actions.map((a, i) => (
              <li key={i}>
                <span className="pill">{a.kind}</span> {a.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {verdict.reasons.length > 0 && (
        <div>
          <h3>Why</h3>
          <ol className="reasons">
            {verdict.reasons.map((r, i) => (
              <li key={i}>
                <span>{r.text}</span>
                <span className="evidence">
                  {r.evidence.map((e) => (
                    <EvidenceChip key={e} ref_={e} notes={notes} />
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="row small">
        <span className="muted">Citations:</span>
        {verdict.citations.length === 0 ? (
          <span className="muted">none</span>
        ) : (
          verdict.citations.map((c) => (
            <a key={c} href={`#note-${c}`} className="pill cite-pill">
              {notes.get(c)?.title ?? c}
            </a>
          ))
        )}
      </div>
      <p className="muted small">
        WalletLens is read-only and never signs. This is an automated assessment from on-chain data and curated notes,
        not a guarantee.
      </p>
    </section>
  );
}
