import type { Address, Hex } from "viem";
import type { ProviderCaps } from "../config.js";
import { cached } from "../services/cache.js";
import { QuotaExceededError, reserve } from "../services/quota.js";
import type { SupportedChainId } from "./networks.js";
import type { ChainReader } from "./types.js";

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
    try {
      const { value, hit } = await cached(key, this.ttlSec, async () => {
        await reserve("rpc", this.caps);
        return fn(live);
      });
      return { value, cached: hit, source: "live" };
    } catch (err) {
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
}
