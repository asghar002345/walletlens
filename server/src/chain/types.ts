import type { Address, Hex } from "viem";
import type { SupportedChainId } from "./networks.js";

/** Plain, JSON-safe transaction shape (bigints as decimal strings). */
export interface TxData {
  hash: Hex;
  chainId: number;
  from: Address;
  to: Address | null;
  value: string;
  input: Hex;
  blockNumber: string | null;
  status: "success" | "reverted" | "pending";
}

export interface AddressData {
  address: Address;
  chainId: number;
  isContract: boolean;
  balance: string;
  nonce: number;
}

export interface TokenMeta {
  address: Address;
  chainId: number;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
}

export interface Approval {
  chainId: number;
  owner: Address;
  token: Address;
  spender: Address;
  /** Current allowance as a decimal string. */
  amount: string;
}

/** Read-only access to chain data. Swappable so tests and evals run offline. */
export interface ChainReader {
  getTx(chainId: SupportedChainId, hash: Hex): Promise<TxData | null>;
  getAddress(chainId: SupportedChainId, address: Address): Promise<AddressData>;
  getTokenMeta(chainId: SupportedChainId, address: Address): Promise<TokenMeta | null>;
  getApprovals(chainId: SupportedChainId, owner: Address, token?: Address): Promise<Approval[]>;
}
