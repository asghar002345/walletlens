import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";
import { SUPPORTED_CHAINS, type SupportedChainId } from "./networks.js";
import type { ChainReader, TxData } from "./types.js";

/** Live reader over public testnet RPCs. Read-only: it never holds a key and never signs. */
export class ViemChainReader implements ChainReader {
  private clients = new Map<number, PublicClient>();

  constructor(private rpcUrls: Partial<Record<SupportedChainId, string>> = {}) {}

  private client(chainId: SupportedChainId): PublicClient {
    let c = this.clients.get(chainId);
    if (!c) {
      c = createPublicClient({
        chain: SUPPORTED_CHAINS[chainId],
        transport: http(this.rpcUrls[chainId]),
      }) as PublicClient;
      this.clients.set(chainId, c);
    }
    return c;
  }

  async getTx(chainId: SupportedChainId, hash: Hex): Promise<TxData | null> {
    const c = this.client(chainId);
    const tx = await c.getTransaction({ hash }).catch(() => null);
    if (!tx) return null;
    const receipt = await c.getTransactionReceipt({ hash }).catch(() => null);
    return {
      hash,
      chainId,
      from: tx.from,
      to: tx.to ?? null,
      value: tx.value.toString(),
      input: tx.input,
      blockNumber: tx.blockNumber?.toString() ?? null,
      status: receipt ? receipt.status : "pending",
    };
  }

  async getAddress(chainId: SupportedChainId, address: Address) {
    const c = this.client(chainId);
    const [code, balance, nonce] = await Promise.all([
      c.getCode({ address }),
      c.getBalance({ address }),
      c.getTransactionCount({ address }),
    ]);
    return { address, chainId, isContract: !!code && code !== "0x", balance: balance.toString(), nonce };
  }
}
