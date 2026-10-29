import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Analysis } from "../src/models/analysis.js";
import { CacheEntry } from "../src/models/cache.js";
import { Usage } from "../src/models/usage.js";
import { loggedInAgent, makeApp } from "./helpers.js";
import type { ChainReader } from "../src/chain/types.js";

const SEPOLIA = 11155111;
const APPROVE_TX = "0x" + "b2".repeat(32);
const TOKEN = "0x1111111111111111111111111111111111111111";

beforeEach(async () => {
  await Promise.all([Analysis.deleteMany({}), CacheEntry.deleteMany({}), Usage.deleteMany({})]);
});

describe("analyses (mock mode, default)", () => {
  const app = makeApp();

  it("requires auth", async () => {
    expect((await request(app).get("/api/analyses")).status).toBe(401);
  });

  it("creates a tx analysis from fixtures and lists it", async () => {
    const agent = await loggedInAgent(app);
    const res = await agent.post("/api/analyses").send({ kind: "tx", chainId: SEPOLIA, value: APPROVE_TX });
    expect(res.status).toBe(201);
    expect(res.body.analysis).toMatchObject({ mode: "mock", status: "pending", chainId: SEPOLIA });
    expect(res.body.analysis.chainData.input).toMatch(/^0x095ea7b3/);
    expect(res.body.analysis.notices.join(" ")).toMatch(/Mock mode/);
    const list = await agent.get("/api/analyses");
    expect(list.body.analyses).toHaveLength(1);
  });

  it("returns 404 for an unknown tx", async () => {
    const agent = await loggedInAgent(app);
    const res = await agent.post("/api/analyses").send({ kind: "tx", chainId: SEPOLIA, value: "0x" + "00".repeat(32) });
    expect(res.status).toBe(404);
  });

  it("accepts an unsigned signing request and looks up the target", async () => {
    const agent = await loggedInAgent(app);
    const res = await agent.post("/api/analyses").send({
      kind: "signRequest",
      chainId: SEPOLIA,
      request: { from: "0x2222222222222222222222222222222222222222", to: TOKEN, data: "0x095ea7b3", value: "0x0" },
    });
    expect(res.status).toBe(201);
    expect(res.body.analysis.chainData.target.isContract).toBe(true);
  });

  it("blocks mainnet and validates input", async () => {
    const agent = await loggedInAgent(app);
    const main = await agent.post("/api/analyses").send({ kind: "address", chainId: 1, value: TOKEN });
    expect(main.status).toBe(400);
    expect(main.body.error.details[0].message).toMatch(/mainnet is blocked/);
    const bad = await agent.post("/api/analyses").send({ kind: "tx", chainId: SEPOLIA, value: "0x123" });
    expect(bad.body.error.details[0].field).toBe("value");
    expect((await agent.post("/api/analyses").send({ kind: "nope" })).status).toBe(400);
  });

  it("does not leak another user's analysis", async () => {
    const a = await loggedInAgent(app);
    const b = await loggedInAgent(app);
    const { body } = await a.post("/api/analyses").send({ kind: "address", chainId: SEPOLIA, value: TOKEN });
    expect((await b.get(`/api/analyses/${body.analysis.id}`)).status).toBe(404);
  });
});

describe("analyses (live mode with caps and cache)", () => {
  const fakeTx = {
    hash: APPROVE_TX as `0x${string}`,
    chainId: SEPOLIA,
    from: TOKEN as `0x${string}`,
    to: null,
    value: "0",
    input: "0x" as `0x${string}`,
    blockNumber: "1",
    status: "success" as const,
  };

  it("caches tx lookups in Mongo", async () => {
    const live: ChainReader = { getTx: vi.fn(async () => fakeTx), getAddress: vi.fn() };
    const app = makeApp({ mockMode: false }, { liveChain: live });
    const agent = await loggedInAgent(app);
    await agent.post("/api/analyses").send({ kind: "tx", chainId: SEPOLIA, value: APPROVE_TX });
    const second = await agent.post("/api/analyses").send({ kind: "tx", chainId: SEPOLIA, value: APPROVE_TX });
    expect(live.getTx).toHaveBeenCalledTimes(1);
    expect(second.body.analysis.mode).toBe("live");
  });

  it("degrades to mocked data with a notice when the RPC cap is hit", async () => {
    const live: ChainReader = { getTx: vi.fn(async () => fakeTx), getAddress: vi.fn() };
    const app = makeApp(
      { mockMode: false, caps: { ...makeCaps(), rpc: { perMinute: 0, perDay: 0 } } },
      { liveChain: live },
    );
    const agent = await loggedInAgent(app);
    const res = await agent.post("/api/analyses").send({ kind: "tx", chainId: SEPOLIA, value: APPROVE_TX });
    expect(res.status).toBe(201);
    expect(live.getTx).not.toHaveBeenCalled();
    expect(res.body.analysis.mode).toBe("mock");
    expect(res.body.analysis.notices.join(" ")).toMatch(/cap reached/);
  });
});

describe("API rate limit", () => {
  it("returns 429 after the per-IP limit", async () => {
    const app = makeApp({ apiRateLimit: { windowMs: 60_000, max: 2 } });
    await request(app).get("/api/health");
    await request(app).get("/api/health");
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(429);
    expect(res.body.error.message).toMatch(/Too many/);
  });
});

function makeCaps() {
  const c = { perMinute: 100, perDay: 100 };
  return { rpc: c, groq: c, gemini: c, geminiEmbed: c };
}
