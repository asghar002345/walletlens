import type { ChatMessage, ChatResult, LlmProvider, ToolCallRequest } from "./types.js";
import { estimateTokens } from "./types.js";

interface Input {
  kind: "tx" | "address" | "signRequest";
  chainId: number;
  value?: string;
  request?: { from: string; to?: string; data?: string };
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
    if (decoded?.functionName === "transfer") terms.push("ERC-20 transfer");
    if (decoded?.kind === "native-transfer") terms.push("plain native transfer address poisoning");
    if (decoded?.kind === "unknown") terms.push("unknown function selector blind signing");
    if (suspicious(contract)) terms.push("token name instructions prompt injection metadata");
    if (approvals?.approvals?.some((a) => a.unlimited)) terms.push("unlimited approval revoke");
    if (terms.length) add("retrieveNotes", { query: terms.join(" "), k: 3 });
  }

  private draft(input: Input, results: Map<string, unknown>): string {
    const decoded = unwrap(results.get("decodeCalldata")) as
      { kind?: string; functionName?: string; standard?: string; flags?: string[] } | undefined;
    const contract = unwrap(results.get("lookupContract")) as ContractView | undefined;
    const notes = (unwrap(results.get("retrieveNotes")) as { notes?: { noteId: string }[] } | undefined)?.notes ?? [];
    const parts: string[] = [];
    if (input.kind === "address")
      parts.push(contract?.isContract ? "The address is a contract." : "The address is not a contract.");
    if (decoded?.kind === "native-transfer") parts.push("Plain native-token transfer with no contract call.");
    if (decoded?.kind === "call") parts.push(`Calls ${decoded.standard} ${decoded.functionName}.`);
    if (decoded?.kind === "unknown") parts.push("The function selector is not recognised, so its effect is unknown.");
    if (decoded?.flags?.includes("unlimited-approval")) parts.push("It grants an unlimited allowance to the spender.");
    if (suspicious(contract))
      parts.push("The token metadata contains instruction-like text, which was ignored and is itself a warning sign.");
    if (parts.length === 0) parts.push("Not enough evidence to explain this. I don't know.");
    else if (notes.length)
      parts.push(
        `Background: ${notes
          .slice(0, 2)
          .map((n) => `[${n.noteId}]`)
          .join(" ")}.`,
      );
    return `Draft (mock): ${parts.join(" ")}`;
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
/** Tool messages are wrapped as { untrusted_tool_output: { ok, data } }. */
const unwrap = (v: unknown) =>
  (v as { untrusted_tool_output?: { data?: unknown } } | null)?.untrusted_tool_output?.data;
