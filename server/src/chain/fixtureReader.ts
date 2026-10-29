import { readFileSync } from "node:fs";
import type { Address, Hex } from "viem";
import type { SupportedChainId } from "./networks.js";
import type { AddressData, ChainReader, TxData } from "./types.js";

interface FixtureFile {
  txs: TxData[];
  addresses: AddressData[];
}

/** Offline reader backed by JSON fixtures. Used by tests, evals and CHAIN_MODE=fixture. */
export class FixtureChainReader implements ChainReader {
  constructor(private data: FixtureFile) {}

  static fromFile(path: string) {
    return new FixtureChainReader(JSON.parse(readFileSync(path, "utf8")) as FixtureFile);
  }

  async getTx(chainId: SupportedChainId, hash: Hex) {
    return this.data.txs.find((t) => t.chainId === chainId && t.hash.toLowerCase() === hash.toLowerCase()) ?? null;
  }

  async getAddress(chainId: SupportedChainId, address: Address) {
    const hit = this.data.addresses.find(
      (a) => a.chainId === chainId && a.address.toLowerCase() === address.toLowerCase(),
    );
    return hit ?? { address, chainId, isContract: false, balance: "0", nonce: 0 };
  }
}
