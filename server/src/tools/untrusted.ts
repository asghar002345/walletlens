/**
 * Anything read from the chain (token names, symbols, calldata strings) is attacker-controlled.
 * We never put it in instructions; we pass it as data, sanitised and wrapped, and flag text
 * that looks like it is trying to instruct the model.
 */
const MAX_LEN = 80;
const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|above) (instructions|prompts?)/i,
  /\b(system|assistant)\s*:/i,
  /\byou are (now )?(an?|the)\b/i,
  /\b(mark|report|classify|treat)\b.{0,30}\b(safe|benign|low risk)\b/i,
  /\bdisregard\b/i,
  /<\/?(system|instructions?|prompt)>/i,
  /\b(claim|free)[\s-]*(airdrop|reward)/i,
];

export interface UntrustedText {
  /** Marker so the model (and the UI) can tell this is quoted chain data. */
  untrusted: true;
  text: string | null;
  truncated: boolean;
  suspicious: boolean;
}

export function untrustedText(raw: unknown): UntrustedText {
  if (typeof raw !== "string") return { untrusted: true, text: null, truncated: false, suspicious: false };
  // Strip control and zero-width / bidi characters that can hide text.
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").trim();
  const truncated = clean.length > MAX_LEN;
  return {
    untrusted: true,
    text: truncated ? `${clean.slice(0, MAX_LEN)}…` : clean,
    truncated,
    suspicious: INJECTION_PATTERNS.some((p) => p.test(clean)),
  };
}
