import {
  ProviderError,
  type ChatMessage,
  type ChatResult,
  type FetchLike,
  type LlmProvider,
  type ToolDeclaration,
} from "./types.js";

/** Gemini generateContent with function calling (free tier). Only constructed when GEMINI_API_KEY is set. */
export class GeminiProvider implements LlmProvider {
  readonly name = "gemini" as const;
  constructor(
    private apiKey: string,
    private model = "gemini-3.5-flash-lite",
    private fetchFn: FetchLike = (u, i) => fetch(u, i),
  ) {}

  async chat(messages: ChatMessage[], tools: ToolDeclaration[]): Promise<ChatResult> {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    const contents = mergeToolTurns(messages.filter((m) => m.role !== "system").map(toGemini));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const res = await this.fetchFn(url, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [
          {
            functionDeclarations: tools.map(({ name, description, parameters }) => ({
              name,
              description,
              parameters: stripUnsupported(parameters),
            })),
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    });
    if (!res.ok) throw new ProviderError("gemini", res.status, `HTTP ${res.status}`);
    const body = (await res.json()) as {
      candidates?: {
        content?: {
          parts?: {
            text?: string;
            thought?: boolean;
            thoughtSignature?: string;
            functionCall?: { name: string; args: unknown };
          }[];
        };
      }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const parts = body.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
    return {
      content: text || null,
      toolCalls: parts
        .filter((p) => p.functionCall)
        .map((p, i) => ({
          id: `gemini-${i}`,
          name: p.functionCall!.name,
          args: p.functionCall!.args,
          ...(p.thoughtSignature ? { signature: p.thoughtSignature } : {}),
        })),
      usage: {
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      },
      model: this.model,
    };
  }
}

function toGemini(m: Exclude<ChatMessage, { role: "system" }>) {
  if (m.role === "tool")
    return { role: "user", parts: [{ functionResponse: { name: m.name, response: { content: m.content } } }] };
  if (m.role === "assistant")
    return {
      role: "model",
      parts: [
        ...(m.content ? [{ text: m.content }] : []),
        ...(m.toolCalls ?? []).map((c) => ({
          functionCall: { name: c.name, args: c.args },
          ...(c.signature ? { thoughtSignature: c.signature } : {}),
        })),
      ],
    };
  return { role: "user", parts: [{ text: m.content }] };
}

type GeminiContent = { role: string; parts: Record<string, unknown>[] };

/** Gemini expects all function responses for one model turn in a single user turn. */
function mergeToolTurns(contents: GeminiContent[]) {
  const out: GeminiContent[] = [];
  for (const c of contents) {
    const prev = out[out.length - 1];
    const isResp = (x: GeminiContent) => x.parts.every((p) => "functionResponse" in p);
    if (prev && prev.role === "user" && c.role === "user" && isResp(prev) && isResp(c)) prev.parts.push(...c.parts);
    else out.push({ role: c.role, parts: [...c.parts] });
  }
  return out;
}

/** Gemini's schema subset rejects additionalProperties. */
function stripUnsupported(schema: Record<string, unknown>) {
  const { additionalProperties: _drop, ...rest } = schema;
  return rest;
}
