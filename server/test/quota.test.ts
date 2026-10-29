import { describe, expect, it } from "vitest";
import { QuotaExceededError, reserve, usageToday } from "../src/services/quota.js";

describe("quota", () => {
  it("enforces the per-minute cap and does not count rejected calls", async () => {
    const now = new Date("2026-10-29T10:00:00Z");
    await reserve("t1", { perMinute: 2, perDay: 10 }, now);
    await reserve("t1", { perMinute: 2, perDay: 10 }, now);
    await expect(reserve("t1", { perMinute: 2, perDay: 10 }, now)).rejects.toBeInstanceOf(QuotaExceededError);
    expect(await usageToday("t1", now)).toBe(2);
    await reserve("t1", { perMinute: 2, perDay: 10 }, new Date("2026-10-29T10:01:00Z"));
  });

  it("enforces the per-day cap", async () => {
    const caps = { perMinute: 10, perDay: 1 };
    await reserve("t2", caps, new Date("2026-10-29T10:00:00Z"));
    await expect(reserve("t2", caps, new Date("2026-10-29T11:00:00Z"))).rejects.toMatchObject({ window: "day" });
  });
});
