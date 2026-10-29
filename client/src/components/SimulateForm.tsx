import { useState, type FormEvent } from "react";
import { useAccount } from "wagmi";
import { isAddress, isHex, parseEther, toHex } from "viem";
import { ApiError, analysesApi, type Analysis } from "../api/client";
import { CHAINS, SUPPORTED_CHAIN_IDS } from "../wallet/config";

const DEMO_FROM = "0x2222222222222222222222222222222222222222";
const DEMO_TOKEN = "0x1111111111111111111111111111111111111111";
const DEMO_SPENDER = "3333333333333333333333333333333333333333";
/** Demo presets that match the server's offline fixtures. Clearly labelled as demo data. */
const PRESETS = [
  {
    label: "Unlimited approve",
    to: DEMO_TOKEN,
    value: "",
    data: `0x095ea7b3${DEMO_SPENDER.padStart(64, "0")}${"f".repeat(64)}`,
  },
  { label: "Plain transfer", to: "0x4444444444444444444444444444444444444444", value: "0.01", data: "" },
  { label: "Unknown call", to: DEMO_TOKEN, value: "", data: "0xdeadbeef" },
];

interface Fields {
  from: string;
  to: string;
  value: string;
  data: string;
}

function validate(f: Fields): Partial<Record<keyof Fields, string>> {
  const e: Partial<Record<keyof Fields, string>> = {};
  if (!isAddress(f.from, { strict: false })) e.from = "Enter a valid 0x address";
  if (f.to && !isAddress(f.to, { strict: false })) e.to = "Enter a valid 0x address";
  if (f.value) {
    try {
      if (parseEther(f.value) < 0n) e.value = "Must be positive";
    } catch {
      e.value = "Enter an amount like 0.01";
    }
  }
  if (f.data && !isHex(f.data)) e.data = "Must be 0x-prefixed hex";
  if (!f.to && !f.data) e.to = "Add a recipient or calldata";
  return e;
}

/**
 * Builds an UNSIGNED transaction request and sends it to the API for analysis.
 * Nothing here talks to the wallet beyond reading the connected address and chain.
 */
export function SimulateForm({ chainId, onCreated }: { chainId: number; onCreated: (a: Analysis) => void }) {
  const { address, chainId: walletChain } = useAccount();
  const [mode, setMode] = useState<"build" | "paste">("build");
  const [raw, setFields] = useState<Fields>({ from: "", to: "", value: "", data: "" });
  const [json, setJson] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // "from" falls back to the connected address while the user hasn't typed one.
  const fields: Fields = { ...raw, from: raw.from || address || "" };

  const effectiveChain = walletChain && SUPPORTED_CHAIN_IDS.includes(walletChain) ? walletChain : chainId;
  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setFields({ ...raw, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    let request: Record<string, string>;
    if (mode === "paste") {
      try {
        request = JSON.parse(json);
      } catch {
        setApiError("Paste valid JSON with from, to, value and data fields");
        return;
      }
    } else {
      const v = validate(fields);
      setErrors(v);
      if (Object.keys(v).length) return;
      request = { from: fields.from };
      if (fields.to) request.to = fields.to;
      if (fields.value) request.value = toHex(parseEther(fields.value));
      if (fields.data) request.data = fields.data;
    }
    setBusy(true);
    try {
      onCreated((await analysesApi.create({ kind: "signRequest", chainId: effectiveChain, request })).analysis);
    } catch (err) {
      setApiError(
        err instanceof ApiError ? (err.details[0]?.message ?? err.message) : "Network error, is the API running?",
      );
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof Fields, label: string, placeholder: string, hint?: string) => {
    const msg = errors[k] ?? hint;
    return (
      <div className="field">
        <label htmlFor={`sim-${k}`}>{label}</label>
        <input
          id={`sim-${k}`}
          name={k}
          value={fields[k]}
          placeholder={placeholder}
          onChange={set(k)}
          aria-invalid={!!errors[k]}
          aria-describedby={msg ? `sim-${k}-msg` : undefined}
          spellCheck={false}
          autoComplete="off"
        />
        {msg && (
          <small id={`sim-${k}-msg`} className={errors[k] ? "error" : "muted"}>
            {msg}
          </small>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={submit} noValidate className="simulate" aria-label="Simulate signing request">
      <div className="row between">
        <div className="seg" role="radiogroup" aria-label="Input mode">
          {(["build", "paste"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={mode === m ? "on" : ""}
              onClick={() => setMode(m)}
            >
              {m === "build" ? "Build" : "Paste JSON"}
            </button>
          ))}
        </div>
        {mode === "build" && (
          <div className="row presets" aria-label="Demo presets">
            <span className="muted small">Demo:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="chip-btn"
                onClick={() => {
                  setErrors({});
                  setFields({ from: address ?? (fields.from || DEMO_FROM), to: p.to, value: p.value, data: p.data });
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "build" ? (
        <div className="grid2">
          <div className="from-row">
            {field(
              "from",
              "From",
              "0x… sender",
              address ? "Prefilled from your connected wallet" : "Connect a wallet to prefill",
            )}
            {address && fields.from.toLowerCase() !== address.toLowerCase() && (
              <button type="button" className="link-btn small" onClick={() => setFields({ ...fields, from: address })}>
                Use connected address
              </button>
            )}
          </div>
          {field("to", "To", "0x… contract or recipient")}
          {field("value", "Value (native token)", "0.0", "In ETH / POL, converted to wei")}
          <div className="field">
            <label htmlFor="sim-data">Calldata</label>
            <textarea
              id="sim-data"
              name="data"
              rows={3}
              value={fields.data}
              placeholder="0x… (optional)"
              onChange={set("data")}
              aria-invalid={!!errors.data}
              spellCheck={false}
            />
            {errors.data && <small className="error">{errors.data}</small>}
          </div>
        </div>
      ) : (
        <label className="field">
          <span>Unsigned transaction (JSON)</span>
          <textarea
            rows={5}
            value={json}
            spellCheck={false}
            placeholder='{"from":"0x…","to":"0x…","data":"0x095ea7b3…","value":"0x0"}'
            onChange={(e) => setJson(e.target.value)}
          />
        </label>
      )}

      {apiError && (
        <div role="alert" className="alert">
          {apiError}
        </div>
      )}
      <div className="row between">
        <small className="muted">
          Analysed on {CHAINS.find((c) => c.id === effectiveChain)?.name}. Never signed, never sent.
        </small>
        <button className="primary" disabled={busy} aria-busy={busy}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" /> Analysing…
            </>
          ) : (
            "Simulate & analyse"
          )}
        </button>
      </div>
    </form>
  );
}
