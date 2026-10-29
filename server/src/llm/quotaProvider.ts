import type { ProviderCaps } from "../config.js";
import { reserve } from "../services/quota.js";
import type { ChatMessage, LlmProvider, ToolDeclaration } from "./types.js";

/** Reserve against the provider's free-tier caps before every live call. */
export class QuotaGuardedProvider implements LlmProvider {
  constructor(
    private inner: LlmProvider,
    private caps: ProviderCaps,
  ) {}
  get name() {
    return this.inner.name;
  }
  async chat(messages: ChatMessage[], tools: ToolDeclaration[]) {
    await reserve(this.inner.name, this.caps);
    return this.inner.chat(messages, tools);
  }
}
