import { QuotaExceededError } from "../services/quota.js";
import { ProviderError, type ChatMessage, type ChatResult, type LlmProvider, type ToolDeclaration } from "./types.js";

export interface FallbackEvent {
  from: string;
  to: string;
  reason: string;
  at: string;
}

const describe = (err: unknown) =>
  err instanceof QuotaExceededError
    ? `${err.window} cap reached`
    : err instanceof ProviderError
      ? `HTTP ${err.status}`
      : err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
        ? "timed out"
        : "request failed";

/**
 * Tries providers in order (Groq → Gemini → mock). On any error or cap it moves to the next one and
 * records why. Within one analysis it stays on the provider that worked, so steps aren't mixed.
 */
export class FallbackProvider implements LlmProvider {
  private index = 0;
  private events: FallbackEvent[] = [];

  constructor(private providers: LlmProvider[]) {
    if (providers.length === 0) throw new Error("FallbackProvider needs at least one provider");
  }

  get name() {
    return this.providers[this.index].name;
  }

  /** A fresh, independent chain for one analysis run. */
  forRun() {
    return new FallbackProvider(this.providers);
  }

  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  async chat(messages: ChatMessage[], tools: ToolDeclaration[]): Promise<ChatResult> {
    for (;;) {
      const current = this.providers[this.index];
      const started = Date.now();
      try {
        const res = { ...(await current.chat(messages, tools)), provider: current.name };
        console.info(JSON.stringify({ event: "llm_call", provider: current.name, ok: true, ms: Date.now() - started }));
        return res;
      } catch (err) {
        console.info(
          JSON.stringify({
            event: "llm_call",
            provider: current.name,
            ok: false,
            reason: describe(err),
            ms: Date.now() - started,
          }),
        );
        const next = this.providers[this.index + 1];
        if (!next) throw err;
        this.events.push({ from: current.name, to: next.name, reason: describe(err), at: new Date().toISOString() });
        this.index++;
      }
    }
  }
}
