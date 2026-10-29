import { sepolia, polygonAmoy } from "viem/chains";

// Testnets only. Mainnet chain ids are rejected at the validation layer.
export const SUPPORTED_CHAINS = { [sepolia.id]: sepolia, [polygonAmoy.id]: polygonAmoy } as const;
export type SupportedChainId = keyof typeof SUPPORTED_CHAINS;
export const SUPPORTED_CHAIN_IDS = Object.keys(SUPPORTED_CHAINS).map(Number) as SupportedChainId[];
export const isSupportedChain = (id: number): id is SupportedChainId => id in SUPPORTED_CHAINS;
