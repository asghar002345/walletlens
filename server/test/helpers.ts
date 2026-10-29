import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/config.js";
import type { ChainReader } from "../src/chain/types.js";

export const testConfig = (o: Partial<AppConfig> = {}): AppConfig => ({
  ...loadConfig({ JWT_SECRET: "test-secret-at-least-16", API_RATE_MAX: "1000" }),
  ...o,
});
export const makeApp = (o: Partial<AppConfig> = {}, deps: { liveChain?: ChainReader | null } = {}) =>
  createApp(testConfig(o), deps);

let n = 0;
export async function loggedInAgent(app: ReturnType<typeof makeApp>) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ name: "T", email: `u${++n}@example.com`, password: "password123" });
  return agent;
}
