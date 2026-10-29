import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { Task } from "../src/models/task.js";

let mongo: MongoMemoryServer;
const app = createApp();

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await Task.deleteMany({});
});

describe("Tasks API", () => {
  it("creates a task with defaults", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "Write README" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: "Write README", status: "todo", description: "", dueDate: null });
    expect(res.body.id).toBeTypeOf("string");
    expect(res.body._id).toBeUndefined();
  });

  it("stores due date as a date", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "Ship", dueDate: "2026-12-01" });
    expect(res.status).toBe(201);
    expect(res.body.dueDate).toBe("2026-12-01T00:00:00.000Z");
  });

  it("rejects an empty title with field details", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "  " });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
    expect(res.body.error.details).toContainEqual({ field: "title", message: "Title is required" });
  });

  it("rejects an invalid status and date", async () => {
    const res = await request(app).post("/api/tasks").send({ title: "x", status: "blocked", dueDate: "tomorrow" });
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["status", "dueDate"]));
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await request(app).post("/api/tasks").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Malformed JSON body");
  });

  it("lists tasks newest first and filters by status", async () => {
    await request(app).post("/api/tasks").send({ title: "A", status: "todo" });
    await request(app).post("/api/tasks").send({ title: "B", status: "done" });
    const all = await request(app).get("/api/tasks");
    expect(all.body.map((t: { title: string }) => t.title)).toEqual(["B", "A"]);
    const done = await request(app).get("/api/tasks?status=done");
    expect(done.body).toHaveLength(1);
    expect(done.body[0].title).toBe("B");
  });

  it("rejects an unknown status filter", async () => {
    const res = await request(app).get("/api/tasks?status=nope");
    expect(res.status).toBe(400);
  });

  it("gets, updates and deletes a task", async () => {
    const { body: created } = await request(app).post("/api/tasks").send({ title: "Edit me" });
    const got = await request(app).get(`/api/tasks/${created.id}`);
    expect(got.body.title).toBe("Edit me");

    const upd = await request(app).patch(`/api/tasks/${created.id}`).send({ status: "in_progress", dueDate: null });
    expect(upd.status).toBe(200);
    expect(upd.body.status).toBe("in_progress");

    const del = await request(app).delete(`/api/tasks/${created.id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/tasks/${created.id}`)).status).toBe(404);
  });

  it("rejects an empty update", async () => {
    const { body: created } = await request(app).post("/api/tasks").send({ title: "x" });
    const res = await request(app).patch(`/api/tasks/${created.id}`).send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid id and 404 for a missing one", async () => {
    expect((await request(app).get("/api/tasks/not-an-id")).status).toBe(400);
    const missing = new mongoose.Types.ObjectId().toString();
    expect((await request(app).patch(`/api/tasks/${missing}`).send({ title: "y" })).status).toBe(404);
    expect((await request(app).delete(`/api/tasks/${missing}`)).status).toBe(404);
  });

  it("returns 404 JSON for unknown routes", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Route not found");
  });
});
