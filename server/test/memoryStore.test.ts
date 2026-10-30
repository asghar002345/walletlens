import { describe, expect, it } from "vitest";
import { createMemoryModel, idTransform } from "../src/models/memoryStore.js";

describe("memory store (Vercel demo)", () => {
  it("creates, queries, hides fields and serialises like the Mongoose models", async () => {
    const Users = createMemoryModel({ timestamps: true, hidden: ["passwordHash"], toJSON: idTransform });
    const u = await Users.create({ email: "a@example.com", passwordHash: "h" });
    expect(await Users.exists({ email: "a@example.com" })).toBeTruthy();
    const found = (await Users.findOne({ email: "a@example.com" })) as unknown as { toJSON(): Record<string, unknown> };
    expect(found.toJSON()).toMatchObject({ email: "a@example.com", id: u.id });
    expect(found.toJSON()).not.toHaveProperty("passwordHash");
    const withHash = (await Users.findOne({ email: "a@example.com" }).select("+passwordHash").lean()) as Record<
      string,
      unknown
    >;
    expect(withHash.passwordHash).toBe("h");
  });

  it("supports upserts with $inc and the metrics aggregate", async () => {
    const Usage = createMemoryModel();
    await Usage.findOneAndUpdate({ provider: "p", bucket: "b" }, { $inc: { count: 1 } }, { upsert: true });
    const doc = (await Usage.findOneAndUpdate(
      { provider: "p", bucket: "b" },
      { $inc: { count: 1 } },
      { upsert: true },
    )) as unknown as { count: number };
    expect(doc.count).toBe(2);

    const Calls = createMemoryModel();
    await Calls.create({ analysisId: "x", tool: "t", latencyMs: 5, ok: false, cached: true });
    await Calls.create({ analysisId: "x", tool: "t", latencyMs: 7, ok: true, cached: false });
    const out = await Calls.aggregate([
      { $match: { analysisId: { $in: ["x"] } } },
      {
        $group: {
          _id: "$tool",
          latencies: { $push: "$latencyMs" },
          errors: { $sum: { $cond: ["$ok", 0, 1] } },
          cached: { $sum: { $cond: ["$cached", 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    expect(out).toEqual([{ _id: "t", latencies: [5, 7], errors: 1, cached: 1 }]);
  });
});
