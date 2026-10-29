import type { ChatMessage, ChatResult, LlmProvider, ToolCallRequest } from "./types.js";
import { estimateTokens } from "./types.js";

interface Input {
  kind: "tx" | "address" | "signRequest";
  chainId: number;
  value?: string;
  request?: { from: string; to?: string; data?: string; value?: string };
}

/**
 * Deterministic offline "model". It plans the same tool sequence a careful analyst would and then
 * writes a short draft. It reads tool outputs only as data, so injected text cannot steer it.
 */
export class MockProvider implements LlmProvider {
  readonly name = "mock" as const;

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const user = messages.find((m) => m.role === "user");
    const input = JSON.parse(
      (user?.content ?? "").match(/<analysis_input>([\s\S]*)<\/analysis_input>/)?.[1] ?? "{}",
    ) as Input;
    const results = new Map<string, unknown>();
    for (const m of messages) if (m.role === "tool") results.set(m.name, safeParse(m.content));
    const called = new Set(results.keys());
    const next = this.plan(input, results).find((c) => !called.has(c.name));

    const prompt = messages.map((m) => ("content" in m ? (m.content ?? "") : "")).join("\n");
    if (next) {
      return { content: null, toolCalls: [next], usage: usage(prompt, JSON.stringify(next)), model: "mock-planner-v1" };
    }
    const content = this.draft(input, results);
    return { content, toolCalls: [], usage: usage(prompt, content), model: "mock-planner-v1" };
  }

  private plan(input: Input, results: Map<string, unknown>): ToolCallRequest[] {
    const { chainId } = input;
    const calls: ToolCallRequest[] = [];
    const add = (name: string, args: unknown) => calls.push({ id: `mock-${calls.length + 1}`, name, args });
    let from: string | undefined;
    let to: string | undefined;
    let data: string | undefined;

    if (input.kind === "tx") {
      add("getTx", { chainId, hash: input.value });
      const tx = unwrap(results.get("getTx")) as { from?: string; to?: string | null; input?: string } | undefined;
      if (!tx) return calls;
      ({ from, data } = { from: tx.from, data: tx.input });
      to = tx.to ?? undefined;
    } else if (input.kind === "signRequest") {
      ({ from, to, data } = input.request ?? { from: "" });
      // A value-only request to a recipient is a plain native transfer; decode "0x" to say so.
      if (!data && to && input.request?.value) data = "0x";
    } else {
      add("lookupContract", { chainId, address: input.value });
      add("getTokenApprovals", { chainId, owner: input.value });
      if (results.has("getTokenApprovals")) this.addRetrieval(add, results);
      return calls;
    }
    if (data) add("decodeCalldata", { data });
    if (to) add("lookupContract", { chainId, address: to });
    const decoded = unwrap(results.get("decodeCalldata")) as { functionName?: string } | undefined;
    if (from && to && decoded?.functionName === "approve")
      add("getTokenApprovals", { chainId, owner: from, token: to });
    // Retrieve background only once the evidence tools have run, so the query reflects what was found.
    if (calls.every((c) => results.has(c.name))) this.addRetrieval(add, results);
    return calls;
  }

  /** Build a retrieval query from evidence flags (never from untrusted text itself). */
  private addRetrieval(add: (name: string, args: unknown) => void, results: Map<string, unknown>) {
    const decoded = unwrap(results.get("decodeCalldata")) as
      { kind?: string; functionName?: string; flags?: string[] } | undefined;
    const contract = unwrap(results.get("lookupContract")) as ContractView | undefined;
    const approvals = unwrap(results.get("getTokenApprovals")) as { approvals?: { unlimited: boolean }[] } | undefined;
    const terms: string[] = [];
    if (decoded?.flags?.includes("unlimited-approval")) terms.push("unlimited ERC-20 approve allowance");
    else if (decoded?.functionName === "approve") terms.push("ERC-20 approve allowance spender");
    if (decoded?.flags?.includes("operator-approval-all")) terms.push("setApprovalForAll operator drainer");
    if (decoded?.flags?.includes("offchain-signature-approval")) terms.push("permit signature phishing");
    if (decoded?.flags?.includes("zero-value-transfer")) terms.push("zero-value transfer address poisoning lookalike");
    else if (decoded?.functionName === "transfer") terms.push("ERC-20 transfer");
    if (decoded?.functionName === "transferFrom") terms.push("transferFrom allowance");
    if (decoded?.flags?.includes("revoke-approval")) terms.push("revoke approval");
    if (decoded?.kind === "native-transfer") terms.push("plain native transfer address poisoning");
    if (decoded?.kind === "unknown") terms.push("unknown function selector blind signing");
    if (suspicious(contract)) terms.push("token name instructions prompt injection metadata");
    if (approvals?.approvals?.some((a) => a.unlimited)) terms.push("unlimited approval revoke");
    // Boost notes whose tags match what decodeCalldata / lookupContract flagged.
    const boostTags = [
      ...(decoded?.flags?.includes("unlimited-approval") ? ["unlimited"] : []),
      ...(decoded?.flags?.includes("operator-approval-all") ? ["operator"] : []),
      ...(decoded?.flags?.includes("offchain-signature-approval") ? ["permit"] : []),
      ...(decoded?.kind === "native-transfer" ? ["native"] : []),
      ...(decoded?.flags?.includes("zero-value-transfer") ? ["poisoning"] : []),
      ...(decoded?.flags?.includes("revoke-approval") ? ["revoke"] : []),
      ...(decoded?.kind === "unknown" ? ["decoding"] : []),
      ...(suspicious(contract) ? ["prompt-injection"] : []),
    ];
    if (terms.length)
      add("retrieveNotes", { query: terms.join(" "), k: 3, ...(boostTags.length ? { boostTags } : {}) });
  }

  /** Deterministic rules → a verdict that passes the same schema and evidence checks as a real model's. */
  private draft(input: Input, results: Map<string, unknown>): string {
    const ok = (name: string) => (results.get(name) as Wrapped | null)?.untrusted_tool_output?.ok === true;
    const decoded = ok("decodeCalldata")
      ? (unwrap(results.get("decodeCalldata")) as
          { kind?: string; functionName?: string; standard?: string; flags?: string[]; args?: unknown[] } | undefined)
      : undefined;
    const contract = ok("lookupContract")
      ? (unwrap(results.get("lookupContract")) as ContractView | undefined)
      : undefined;
    const approvals = ok("getTokenApprovals")
      ? (unwrap(results.get("getTokenApprovals")) as { approvals?: { unlimited: boolean }[] } | undefined)
      : undefined;
    const tx = ok("getTx")
      ? (unwrap(results.get("getTx")) as { found?: boolean; value?: string; from?: string } | undefined)
      : undefined;
    const notes = ok("retrieveNotes")
      ? ((unwrap(results.get("retrieveNotes")) as { notes?: { noteId: string; tags: string[] }[] } | undefined)
          ?.notes ?? [])
      : [];
    const noteFor = (...tags: string[]) => notes.find((n) => tags.some((t) => n.tags.includes(t)))?.noteId;
    const withNote = (evidence: string[], ...tags: string[]) => {
      const id = noteFor(...tags);
      return id ? [...evidence, `note:${id}`] : evidence;
    };

    const actions: { kind: string; description: string }[] = [];
    const reasons: { text: string; evidence: string[] }[] = [];
    let risk: "low" | "medium" | "high" | "unknown" = "unknown";
    const raise = (r: "low" | "medium" | "high") => {
      const order = ["unknown", "low", "medium", "high"];
      if (order.indexOf(r) > order.indexOf(risk)) risk = r;
    };
    const tokenLabel = contract?.token ? "the token contract" : "the target contract";

    if (decoded?.kind === "native-transfer") {
      actions.push({
        kind: "native-transfer",
        description: `Sends ${tx?.value ?? input.request?.value ?? "a"} wei of the native testnet token.`,
      });
      reasons.push({
        text: "Plain value transfer with no contract call and no approval.",
        evidence: withNote(["tool:decodeCalldata"], "native"),
      });
      raise("low");
    }
    const zero = decoded?.flags?.includes("zero-value-transfer");
    if (decoded?.kind === "call" && decoded.functionName === "transfer") {
      actions.push({
        kind: "token-transfer",
        description: `Transfers ${zero ? "zero" : ""} ${decoded.standard} tokens from the sender.`.replace("  ", " "),
      });
      if (zero) {
        reasons.push({
          text: "A zero-value token transfer moves nothing; it is commonly used to plant lookalike addresses in history (address poisoning).",
          evidence: withNote(["tool:decodeCalldata"], "poisoning"),
        });
        raise("medium");
      } else {
        reasons.push({
          text: "A direct token transfer grants no ongoing spending rights.",
          evidence: ["tool:decodeCalldata"],
        });
        raise("low");
      }
    }
    if (decoded?.kind === "call" && decoded.functionName === "transferFrom") {
      const owner = String((decoded.args as unknown[] | undefined)?.[0] ?? "").toLowerCase();
      const spoofed = !!tx?.from && owner !== "" && tx.from.toLowerCase() !== owner;
      actions.push({
        kind: "token-transfer",
        description: `Moves ${decoded.standard} tokens out of ${owner || "an owner"} using transferFrom.`,
      });
      if (zero && spoofed) {
        reasons.push({
          text: "Zero-value transferFrom sent by a third party on the owner's behalf: a classic address-poisoning pattern.",
          evidence: withNote(["tool:getTx", "tool:decodeCalldata"], "poisoning"),
        });
        raise("high");
      } else if (zero) {
        reasons.push({
          text: "Zero-value transferFrom, often used for address poisoning.",
          evidence: withNote(["tool:decodeCalldata"], "poisoning"),
        });
        raise("medium");
      } else {
        reasons.push({
          text: "Moves tokens using an existing allowance.",
          evidence: withNote(["tool:decodeCalldata"], "approval"),
        });
        raise("medium");
      }
    }
    if (decoded?.flags?.includes("revoke-operator")) {
      actions.push({ kind: "operator-approval", description: "Removes an operator's collection-wide approval." });
      reasons.push({
        text: "Revoking an operator approval reduces risk.",
        evidence: withNote(["tool:decodeCalldata"], "operator"),
      });
      raise("low");
    }
    if (decoded?.kind === "call" && decoded.functionName === "approve") {
      const unlimited = decoded.flags?.includes("unlimited-approval");
      actions.push({
        kind: "approval",
        description: decoded.flags?.includes("revoke-approval")
          ? `Revokes a spender's allowance on ${tokenLabel}.`
          : `Approves a spender to move ${unlimited ? "an unlimited amount" : "a limited amount"} of ${tokenLabel}'s tokens.`,
      });
      if (decoded.flags?.includes("revoke-approval")) {
        reasons.push({
          text: "Sets the allowance to zero, which revokes the spender's access.",
          evidence: withNote(["tool:decodeCalldata"], "revoke"),
        });
        raise("low");
      } else if (unlimited) {
        reasons.push({
          text: "Unlimited allowance: the spender can take the full balance now and any tokens received later.",
          evidence: withNote(["tool:decodeCalldata"], "unlimited"),
        });
        raise("high");
      } else {
        reasons.push({
          text: "Limited allowance to a spender.",
          evidence: withNote(["tool:decodeCalldata"], "approval"),
        });
        raise("medium");
      }
    }
    if (decoded?.flags?.includes("operator-approval-all")) {
      actions.push({ kind: "operator-approval", description: "Lets an operator move every NFT in the collection." });
      reasons.push({
        text: "Collection-wide operator approval.",
        evidence: withNote(["tool:decodeCalldata"], "operator"),
      });
      raise("high");
    }
    if (decoded?.flags?.includes("offchain-signature-approval")) {
      actions.push({ kind: "signature-approval", description: "Grants an allowance by signature (permit)." });
      reasons.push({
        text: "Permit-style approval that can be submitted later by anyone holding it.",
        evidence: withNote(["tool:decodeCalldata"], "permit"),
      });
      raise("high");
    }
    if (decoded?.kind === "unknown") {
      actions.push({
        kind: "unknown",
        description: `Calls an unrecognised function (${(decoded as { selector?: string }).selector}).`,
      });
      reasons.push({
        text: "The function selector is not in the known ABI set, so its effect cannot be verified.",
        evidence: withNote(["tool:decodeCalldata"], "decoding"),
      });
      raise("medium");
    }
    if (suspicious(contract)) {
      reasons.push({
        text: "Token metadata contains instruction-like text aimed at reviewers; it was treated as data and is a warning sign.",
        evidence: withNote(["tool:lookupContract"], "prompt-injection"),
      });
      raise("high");
    }
    if (approvals?.approvals?.some((a) => a.unlimited)) {
      reasons.push({
        text: "The owner already has at least one unlimited allowance outstanding.",
        evidence: withNote(["tool:getTokenApprovals"], "revoke", "unlimited"),
      });
      if (input.kind === "address") raise("medium");
    }
    if (input.kind === "address" && contract) {
      actions.push({
        kind: "contract-call",
        description: contract.isContract ? "Address is a contract." : "Address is an externally owned account.",
      });
      if (risk === "unknown") {
        reasons.push({
          text: "No risky approvals or flags were found for this address.",
          evidence: ["tool:lookupContract"],
        });
        raise("low");
      }
    }

    const citations = [
      ...new Set(
        reasons
          .flatMap((r) => r.evidence)
          .filter((e) => e.startsWith("note:"))
          .map((e) => e.slice(5)),
      ),
    ];
    if (risk === "unknown") {
      return JSON.stringify({
        summary: "I don't know: there was not enough evidence to explain this request.",
        actions: [],
        riskLevel: "unknown",
        reasons: [],
        citations: [],
      });
    }
    const summary =
      risk === "high"
        ? `High risk: ${reasons[0].text}`
        : risk === "medium"
          ? `Medium risk: ${reasons[0].text}`
          : `Low risk: ${reasons[0].text}`;
    return JSON.stringify({ summary, actions, riskLevel: risk, reasons, citations });
  }
}

type ContractView = {
  isContract?: boolean;
  token?: { symbol?: { suspicious?: boolean }; name?: { suspicious?: boolean } } | null;
};
const suspicious = (c?: ContractView) => !!(c?.token?.name?.suspicious || c?.token?.symbol?.suspicious);
const usage = (prompt: string, out: string) => ({
  inputTokens: estimateTokens(prompt),
  outputTokens: estimateTokens(out),
});
const safeParse = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
type Wrapped = { untrusted_tool_output?: { ok?: boolean; data?: unknown } };
/** Tool messages are wrapped as { untrusted_tool_output: { ok, data } }. */
const unwrap = (v: unknown) =>
  (v as { untrusted_tool_output?: { data?: unknown } } | null)?.untrusted_tool_output?.data;
