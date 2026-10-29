import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_RE } from "../../scripts/never-sign.mjs";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });

describe("never-sign guard", () => {
  const roots = ["../src", "../../client/src"].map((r) => fileURLToPath(new URL(r, import.meta.url)));

  it.each(roots)("no signing, sending or key APIs appear in %s", (root) => {
    const hits = walk(root).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ file, line: i + 1, m: line.match(FORBIDDEN_RE)?.[1] }))
        .filter((h) => h.m),
    );
    expect(hits).toEqual([]);
  });

  it("the guard pattern actually catches forbidden names", () => {
    expect(FORBIDDEN_RE.test("const { sendTransaction } = useSendTransaction()")).toBe(true);
    expect(FORBIDDEN_RE.test('provider.request({ method: "eth_signTypedData_v4" })')).toBe(true);
    expect(FORBIDDEN_RE.test("useAccount(); getTransaction(); readContract()")).toBe(false);
  });
});
