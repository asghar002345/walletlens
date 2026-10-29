import { createConfig, http, type CreateConnectorFn } from "wagmi";
import { polygonAmoy, sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

/** Testnets only. Mainnet is deliberately absent, so wagmi can't even switch to it. */
export const CHAINS = [sepolia, polygonAmoy] as const;
export const SUPPORTED_CHAIN_IDS: number[] = CHAINS.map((c) => c.id);
export const chainName = (id?: number) => CHAINS.find((c) => c.id === id)?.name ?? `chain ${id}`;

export function createWagmiConfig(opts: { walletConnectProjectId?: string; connectors?: CreateConnectorFn[] } = {}) {
  const connectors = opts.connectors ?? [
    injected({ shimDisconnect: true }),
    ...(opts.walletConnectProjectId
      ? [
          walletConnect({
            projectId: opts.walletConnectProjectId,
            showQrModal: true,
            metadata: {
              name: "WalletLens",
              description: "Read-only transaction explainer. Never signs.",
              url: typeof window === "undefined" ? "http://localhost:5173" : window.location.origin,
              icons: [],
            },
          }),
        ]
      : []),
  ];
  return createConfig({
    chains: CHAINS,
    connectors,
    transports: { [sepolia.id]: http(), [polygonAmoy.id]: http() },
  });
}

export const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() || undefined;
