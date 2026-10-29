import {
  ProviderError,
  type ChatMessage,
  type ChatResult,
  type FetchLike,
  type LlmProvider,
  type ToolDeclaration,
} from "./types.js";

/** Groq's OpenAI-compatible chat API (free tier). Only constructed when GROQ_API_KEY is set. */
export class GroqProvider implements LlmProvider {
  readonly name = "groq" as const;
  constructor(
    private apiKey: string,
    private model = "llama-3.3-70b-versatile",
    private fetchFn: FetchLike = fetch,
  ) {}

  async chat(messages: ChatMessage[], tools: ToolDeclaration[]): Promise<ChatResult> {
    const res = await this.fetchFn("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: messages.map(toOpenAi),
        tools: tools.map((t) => ({ type: "function", function: t })),
        tool_choice: "auto",
      }),
    });
    if (!res.ok) throw new ProviderError("groq", res.status, `HTTP ${res.status}`);
    const body = (await res.json()) as {
      model: string;
      choices: {
        message: {
          content: string | null;
          tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        };
      }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const msg = body.choices[0]?.message;
    return {
      content: msg?.content ?? null,
      toolCalls: (msg?.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.function.name,
        args: parseArgs(c.function.arguments),
      })),
      usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 },
      model: body.model,
    };
  }
}

function toOpenAi(m: ChatMessage) {
  if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
  if (m.role === "assistant")
    return {
      role: "assistant",
      content: m.content,
      tool_calls: m.toolCalls?.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    };
  return m;
}

/** Bad JSON from the model becomes an object the Zod check will reject (and log), rather than a crash. */
function parseArgs(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { __unparseable: s.slice(0, 200) };
  }
}
