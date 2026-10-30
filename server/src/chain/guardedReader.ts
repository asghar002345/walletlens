import type { Address, Hex } from "viem";
import type { ProviderCaps } from "../config.js";
import { cached } from "../services/cache.js";
import { QuotaExceededError, reserve } from "../services/quota.js";
import type { SupportedChainId } from "./networks.js";
import type { ChainReader } from "./types.js";

/** Hard cap per chain read, so a stalled RPC cannot use up the serverless time budget. */
const READ_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("RPC read timed out"), { name: "TimeoutError" })), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export interface ReadResult<T> {
  value: T;
  cached: boolean;
  source: "live" | "mock";
  notice?: string;
}

/**
 * Wraps a live reader with a Mongo cache and per-provider caps.
 * When the RPC cap is hit it degrades to the fixture reader and says so.
 */
export class GuardedChainReader {
  constructor(
    private live: ChainReader | null,
    private mock: ChainReader,
    private caps: ProviderCaps,
    private ttlSec: number,
  ) {}

  private async run<T>(key: string, fn: (r: ChainReader) => Promise<T>): Promise<ReadResult<T>> {
    if (!this.live) return { value: await fn(this.mock), cached: false, source: "mock" };
    const live = this.live;
    const started = Date.now();
    const log = (outcome: string) =>
      console.info(JSON.stringify({ event: "chain_read", kind: key.split(":")[0], outcome, ms: Date.now() - started }));
    try {
      const { value, hit } = await cached(key, this.ttlSec, async () => {
        await reserve("rpc", this.caps);
        return withTimeout(fn(live), READ_TIMEOUT_MS);
      });
      log(hit ? "cache" : "live");
      return { value, cached: hit, source: "live" };
    } catch (err) {
      log(err instanceof Error ? err.name : "error");
      if (!(err instanceof QuotaExceededError)) throw err;
      return {
        value: await fn(this.mock),
        cached: false,
        source: "mock",
        notice: `Free-tier RPC ${err.window} cap reached; showing mocked chain data.`,
      };
    }
  }

  getTx(chainId: SupportedChainId, hash: Hex) {
    return this.run(`tx:${chainId}:${hash.toLowerCase()}`, (r) => r.getTx(chainId, hash));
  }

  getAddress(chainId: SupportedChainId, address: Address) {
    // Balances change, so address lookups use a short TTL via a distinct key prefix per minute.
    const minute = new Date().toISOString().slice(0, 16);
    return this.run(`addr:${chainId}:${address.toLowerCase()}:${minute}`, (r) => r.getAddress(chainId, address));
  }

  getTokenMeta(chainId: SupportedChainId, address: Address) {
    return this.run(`token:${chainId}:${address.toLowerCase()}`, (r) => r.getTokenMeta(chainId, address));
  }

  getApprovals(chainId: SupportedChainId, owner: Address, token?: Address) {
    const minute = new Date().toISOString().slice(0, 16);
    const key = `appr:${chainId}:${owner.toLowerCase()}:${token?.toLowerCase() ?? "*"}:${minute}`;
    return this.run(key, (r) => r.getApprovals(chainId, owner, token));
  }
}
