import { createPublicClient, erc20Abi, http, parseAbiItem, type Address, type Hex, type PublicClient } from "viem";
import { SUPPORTED_CHAINS, type SupportedChainId } from "./networks.js";
import type { Approval, ChainReader, TokenMeta, TxData } from "./types.js";

const APPROVAL_EVENT = parseAbiItem("event Approval(address indexed owner, address indexed spender, uint256 value)");
/** Public RPCs cap eth_getLogs ranges, so approvals are scanned over a recent window only. */
const APPROVAL_LOOKBACK_BLOCKS = 5_000n;

/** Live reader over public testnet RPCs. Read-only: it never holds a key and never signs. */
export class ViemChainReader implements ChainReader {
  private clients = new Map<number, PublicClient>();

  constructor(private rpcUrls: Partial<Record<SupportedChainId, string>> = {}) {}

  private client(chainId: SupportedChainId): PublicClient {
    let c = this.clients.get(chainId);
    if (!c) {
      c = createPublicClient({
        chain: SUPPORTED_CHAINS[chainId],
        // Short timeouts so a slow public RPC cannot use up the serverless time budget.
        transport: http(this.rpcUrls[chainId], { timeout: 5_000, retryCount: 1 }),
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

  async getTokenMeta(chainId: SupportedChainId, address: Address): Promise<TokenMeta | null> {
    const c = this.client(chainId);
    const code = await c.getCode({ address });
    if (!code || code === "0x") return null;
    const read = <T>(functionName: "name" | "symbol" | "decimals") =>
      c.readContract({ address, abi: erc20Abi, functionName }).catch(() => null) as Promise<T | null>;
    const [name, symbol, decimals] = await Promise.all([
      read<string>("name"),
      read<string>("symbol"),
      read<number>("decimals"),
    ]);
    return { address, chainId, name, symbol, decimals };
  }

  async getApprovals(chainId: SupportedChainId, owner: Address, token?: Address): Promise<Approval[]> {
    const c = this.client(chainId);
    const latest = await c.getBlockNumber();
    const logs = await c.getLogs({
      address: token,
      event: APPROVAL_EVENT,
      args: { owner },
      fromBlock: latest > APPROVAL_LOOKBACK_BLOCKS ? latest - APPROVAL_LOOKBACK_BLOCKS : 0n,
      toBlock: latest,
    });
    // De-duplicate (token, spender) pairs, then read the current allowance.
    const pairs = new Map<string, { token: Address; spender: Address }>();
    for (const l of logs)
      if (l.args.spender) pairs.set(`${l.address}:${l.args.spender}`, { token: l.address, spender: l.args.spender });
    const out: Approval[] = [];
    for (const { token: t, spender } of pairs.values()) {
      const amount = await c.readContract({
        address: t,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
      });
      if (amount > 0n) out.push({ chainId, owner, token: t, spender, amount: amount.toString() });
    }
    return out;
  }
}
