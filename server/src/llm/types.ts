export interface ToolCallRequest {
  id: string;
  name: string;
  args: unknown;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCallRequest[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatResult {
  content: string | null;
  toolCalls: ToolCallRequest[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  /** Set by FallbackProvider: which provider actually answered. */
  provider?: string;
}

/** Every LLM backend (mock, Groq, Gemini) implements this, so the loop and tests don't care which one runs. */
export interface LlmProvider {
  readonly name: string;
  chat(messages: ChatMessage[], tools: ToolDeclaration[]): Promise<ChatResult>;
  /** Optional: a fresh per-run instance (used by FallbackProvider to stay sticky within one analysis). */
  forRun?(): LlmProvider;
  /** Optional: fallback events since the last call. */
  takeEvents?(): { from: string; to: string; reason: string; at: string }[];
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class ProviderError extends Error {
  constructor(
    public provider: string,
    public status: number,
    message: string,
  ) {
    super(`${provider}: ${message}`);
  }
}

export const estimateTokens = (text: string) => Math.ceil(text.length / 4);
