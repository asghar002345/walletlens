import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { User } from "../src/models/user.js";
import { makeApp } from "./helpers.js";

const app = makeApp();
const alice = { name: "Test User", email: "test@example.com", password: "correct-horse" };

beforeEach(async () => {
  await User.deleteMany({});
});

describe("health", () => {
  it("reports ok and db status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, db: "up", mockMode: true });
  });
});

describe("auth", () => {
  it("registers, sets an httpOnly cookie and never returns the hash", async () => {
    const res = await request(app).post("/api/auth/register").send(alice);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: alice.name, email: alice.email });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/token=/);
    expect(cookie).toMatch(/HttpOnly/);
  });

  it("validates register input", async () => {
    const res = await request(app).post("/api/auth/register").send({ name: "", email: "nope", password: "short" });
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });

  it("rejects a duplicate email case-insensitively", async () => {
    await request(app).post("/api/auth/register").send(alice);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...alice, email: "TEST@example.com" });
    expect(res.status).toBe(409);
  });

  it("logs in, reads /me and logs out", async () => {
    await request(app).post("/api/auth/register").send(alice);
    const agent = request.agent(app);
    expect((await agent.post("/api/auth/login").send({ email: alice.email, password: alice.password })).status).toBe(
      200,
    );
    const me = await agent.get("/api/auth/me");
    expect(me.body.user.email).toBe(alice.email);
    expect((await agent.post("/api/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("uses one message for wrong password and unknown email", async () => {
    await request(app).post("/api/auth/register").send(alice);
    const wrong = await request(app).post("/api/auth/login").send({ email: alice.email, password: "bad-password" });
    const unknown = await request(app).post("/api/auth/login").send({ email: "x@example.com", password: "whatever1" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it("rejects /me without or with a tampered cookie", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set("Cookie", "token=garbage")).status).toBe(401);
  });

  it("returns 400 for malformed JSON and 404 JSON for unknown routes", async () => {
    const bad = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{bad");
    expect(bad.body.error.message).toBe("Malformed JSON body");
    expect((await request(app).get("/api/nope")).status).toBe(404);
  });
});
