import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("refuses to start without a strong JWT secret", () => {
    expect(() => loadConfig({})).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ JWT_SECRET: "short" })).toThrow();
  });
  it("enables secure cookies in production", () => {
    expect(loadConfig({ JWT_SECRET: "x".repeat(32), NODE_ENV: "production" }).secureCookies).toBe(true);
  });
});
