import { useId, useState, type FormEvent } from "react";
import { ApiError, analysesApi, type Analysis } from "../api/client";
import { CHAINS } from "../wallet/config";
import { SimulateForm } from "./SimulateForm";

type Kind = "signRequest" | "tx" | "address";
const KIND_LABEL: Record<Kind, string> = {
  signRequest: "Simulate signing request",
  tx: "Transaction hash",
  address: "Address",
};

export function AnalysisForm({ onCreated }: { onCreated: (a: Analysis) => void }) {
  const [kind, setKind] = useState<Kind>("signRequest");
  const [chainId, setChainId] = useState<number>(CHAINS[0].id);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onCreated((await analysesApi.create({ kind, chainId, value: value.trim() })).analysis);
      setValue("");
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.details[0]?.message ?? err.message) : "Network error, is the API running?",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <div className="row between">
        <h2 id={`${id}-h`}>New analysis</h2>
        <label className="inline-field">
          <span className="muted small">Network</span>
          <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tabs" role="tablist" aria-label="Input type">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button
            type="button"
            role="tab"
            id={`${id}-${k}`}
            key={k}
            aria-selected={kind === k}
            aria-controls={`${id}-panel`}
            className={kind === k ? "tab active" : "tab"}
            onClick={() => {
              setKind(k);
              setError(null);
            }}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${kind}`}>
        {kind === "signRequest" ? (
          <SimulateForm chainId={chainId} onCreated={onCreated} />
        ) : (
          <form onSubmit={onSubmit} noValidate className="stack">
            <label className="field">
              <span>{KIND_LABEL[kind]}</span>
              <input
                value={value}
                spellCheck={false}
                autoComplete="off"
                placeholder={kind === "tx" ? "0x… (66 characters)" : "0x… (42 characters)"}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={!!error}
              />
            </label>
            {error && (
              <div role="alert" className="alert">
                {error}
              </div>
            )}
            <div className="row between">
              <small className="muted">Read-only lookup on public testnet data.</small>
              <button className="primary" disabled={busy || !value.trim()} aria-busy={busy}>
                {busy ? (
                  <>
                    <span className="spinner" aria-hidden="true" /> Analysing…
                  </>
                ) : (
                  "Analyse"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
