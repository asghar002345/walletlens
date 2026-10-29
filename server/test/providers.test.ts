import { describe, expect, it, vi } from "vitest";
import { GroqProvider } from "../src/llm/groq.js";
import { GeminiProvider } from "../src/llm/gemini.js";
import { ProviderError, type ChatMessage } from "../src/llm/types.js";

const tools = [
  { name: "getTx", description: "d", parameters: { type: "object", properties: {}, additionalProperties: false } },
];
const messages: ChatMessage[] = [
  { role: "system", content: "sys" },
  { role: "user", content: "hi" },
  { role: "assistant", content: null, toolCalls: [{ id: "c1", name: "getTx", args: { a: 1 } }] },
  { role: "tool", toolCallId: "c1", name: "getTx", content: "{}" },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("GroqProvider (no network; fetch is faked)", () => {
  it("maps messages and tools to the OpenAI format and parses tool calls", async () => {
    const fetchFn = vi.fn(async () =>
      json({
        model: "m",
        choices: [
          { message: { content: null, tool_calls: [{ id: "t", function: { name: "getTx", arguments: '{"x":1}' } }] } },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      }),
    );
    const r = await new GroqProvider("key", "m", fetchFn).chat(messages, tools);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/api\.groq\.com/);
    const body = JSON.parse(String(init.body));
    expect(body.messages[2].tool_calls[0].function.arguments).toBe('{"a":1}');
    expect(body.messages[3]).toEqual({ role: "tool", tool_call_id: "c1", content: "{}" });
    expect(r.toolCalls).toEqual([{ id: "t", name: "getTx", args: { x: 1 } }]);
    expect(r.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
  });

  it("turns unparseable tool args into a rejectable object and HTTP errors into ProviderError", async () => {
    const bad = vi.fn(async () =>
      json({
        model: "m",
        choices: [
          { message: { content: null, tool_calls: [{ id: "t", function: { name: "getTx", arguments: "{" } }] } },
        ],
      }),
    );
    expect((await new GroqProvider("k", "m", bad).chat(messages, tools)).toolCalls[0].args).toHaveProperty(
      "__unparseable",
    );
    await expect(new GroqProvider("k", "m", async () => json({}, 429)).chat(messages, tools)).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});

describe("GeminiProvider (no network; fetch is faked)", () => {
  it("uses systemInstruction, functionResponse parts and strips additionalProperties", async () => {
    const fetchFn = vi.fn(async () =>
      json({
        candidates: [{ content: { parts: [{ functionCall: { name: "getTx", args: { y: 2 } } }] } }],
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2 },
      }),
    );
    const r = await new GeminiProvider("key", "gemini-x", fetchFn).chat(messages, tools);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/models\/gemini-x:generateContent/);
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.contents).toHaveLength(3);
    expect(body.contents[2].parts[0].functionResponse.name).toBe("getTx");
    expect(body.tools[0].functionDeclarations[0].parameters).not.toHaveProperty("additionalProperties");
    expect(r.toolCalls[0]).toMatchObject({ name: "getTx", args: { y: 2 } });
  });
});
