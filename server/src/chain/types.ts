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

/** Read-only access to chain data. Swappable so tests and evals run offline. */
export interface ChainReader {
  getTx(chainId: SupportedChainId, hash: Hex): Promise<TxData | null>;
  getAddress(chainId: SupportedChainId, address: Address): Promise<AddressData>;
}
