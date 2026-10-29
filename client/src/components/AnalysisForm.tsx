import { useState, type FormEvent } from "react";
import { ApiError, analysesApi, type Analysis } from "../api/client";

const CHAINS = [
  { id: 11155111, name: "Sepolia" },
  { id: 80002, name: "Polygon Amoy" },
];
type Kind = "tx" | "address" | "signRequest";
const KIND_LABEL: Record<Kind, string> = { tx: "Tx hash", address: "Address", signRequest: "Signing request" };

export function AnalysisForm({ onCreated }: { onCreated: (a: Analysis) => void }) {
  const [kind, setKind] = useState<Kind>("tx");
  const [chainId, setChainId] = useState(CHAINS[0].id);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let body: Record<string, unknown>;
    if (kind === "signRequest") {
      try {
        body = { kind, chainId, request: JSON.parse(value) };
      } catch {
        setError("Signing request must be valid JSON (eth_sendTransaction params)");
        return;
      }
    } else body = { kind, chainId, value: value.trim() };
    setBusy(true);
    try {
      onCreated((await analysesApi.create(body)).analysis);
      setValue("");
    } catch (err) {
      setError(err instanceof ApiError ? (err.details[0]?.message ?? err.message) : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <h2>New analysis</h2>
      <div className="tabs" role="tablist">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button
            type="button"
            role="tab"
            key={k}
            aria-selected={kind === k}
            className={kind === k ? "tab active" : "tab"}
            onClick={() => setKind(k)}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="row">
        <label className="field grow">
          <span>{KIND_LABEL[kind]}</span>
          {kind === "signRequest" ? (
            <textarea
              rows={4}
              value={value}
              placeholder='{"from":"0x…","to":"0x…","data":"0x095ea7b3…","value":"0x0"}'
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <input
              value={value}
              placeholder={kind === "tx" ? "0x… (66 chars)" : "0x… (42 chars)"}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </label>
        <label className="field">
          <span>Network</span>
          <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      <div className="row between">
        <small className="muted">WalletLens never signs or sends anything.</small>
        <button className="primary" disabled={busy || !value.trim()}>
          {busy ? "Analysing…" : "Analyse"}
        </button>
      </div>
    </form>
  );
}
