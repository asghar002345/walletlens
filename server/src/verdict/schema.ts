import { z } from "zod";

export const RISK_LEVELS = ["low", "medium", "high", "unknown"] as const;
export const ACTION_KINDS = [
  "native-transfer",
  "token-transfer",
  "approval",
  "operator-approval",
  "signature-approval",
  "contract-call",
  "unknown",
] as const;

/** Evidence ref: "tool:<toolName>" for a tool that ran successfully, or "note:<noteId>" for a retrieved note. */
const evidenceRef = z
  .string()
  .regex(/^(tool:[A-Za-z]+|note:[a-z0-9-]+)$/, 'Evidence must be "tool:<name>" or "note:<id>"');

export const verdictSchema = z
  .object({
    summary: z.string().trim().min(1).max(600),
    actions: z
      .array(z.object({ kind: z.enum(ACTION_KINDS), description: z.string().trim().min(1).max(300) }).strict())
      .max(10),
    riskLevel: z.enum(RISK_LEVELS),
    reasons: z
      .array(
        z.object({ text: z.string().trim().min(1).max(400), evidence: z.array(evidenceRef).min(1).max(6) }).strict(),
      )
      .max(10),
    citations: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(10),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.riskLevel === "unknown" && !DONT_KNOW.test(v.summary))
      ctx.addIssue({
        code: "custom",
        path: ["summary"],
        message: `riskLevel "unknown" requires a "don't know" summary`,
      });
    if (v.riskLevel !== "unknown" && v.reasons.length === 0)
      ctx.addIssue({ code: "custom", path: ["reasons"], message: "A known risk level needs at least one reason" });
  });

export type Verdict = z.infer<typeof verdictSchema>;
export const DONT_KNOW = /\b(don['’]t|do not) know\b/i;

/** What the analysis actually produced, used to check that every reference points at real evidence. */
export interface EvidenceContext {
  okTools: Set<string>;
  retrievedNoteIds: Set<string>;
}

export type VerdictCheck = { ok: true; verdict: Verdict } | { ok: false; errors: string[] };

/** Parse model text into a verdict: JSON (code fences allowed) → Zod shape → evidence references. */
export function checkVerdict(text: string | null, ev: EvidenceContext): VerdictCheck {
  const raw = (text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["Output is not valid JSON"] };
  }
  const parsed = verdictSchema.safeParse(json);
  if (!parsed.success)
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "verdict"}: ${i.message}`) };
  const v = parsed.data;
  const errors: string[] = [];
  v.reasons.forEach((r, i) =>
    r.evidence.forEach((e) => {
      const [kind, id] = e.split(":");
      if (kind === "tool" && !ev.okTools.has(id)) errors.push(`reasons.${i}: tool "${id}" did not run successfully`);
      if (kind === "note" && !ev.retrievedNoteIds.has(id)) errors.push(`reasons.${i}: note "${id}" was not retrieved`);
    }),
  );
  v.citations.forEach((c) => {
    if (!ev.retrievedNoteIds.has(c)) errors.push(`citations: note "${c}" was not retrieved`);
  });
  if (v.riskLevel !== "unknown" && ev.okTools.size === 0 && ev.retrievedNoteIds.size === 0)
    errors.push('No evidence was gathered, so riskLevel must be "unknown"');
  return errors.length ? { ok: false, errors } : { ok: true, verdict: v };
}

export const unknownVerdict = (why: string): Verdict => ({
  summary: `I don't know. ${why}`,
  actions: [],
  riskLevel: "unknown",
  reasons: [],
  citations: [],
});

/** JSON shape shown to the model in the prompt. */
export const VERDICT_FORMAT = `{"summary": string, "actions": [{"kind": ${ACTION_KINDS.map((k) => `"${k}"`).join("|")}, "description": string}], "riskLevel": "low"|"medium"|"high"|"unknown", "reasons": [{"text": string, "evidence": ["tool:<toolName>" | "note:<noteId>", ...]}], "citations": ["<noteId>", ...]}`;
