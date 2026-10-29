import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { mock } from "wagmi/connectors";
import type { ReactNode } from "react";
import { App } from "../src/App";
import { Providers } from "../src/Providers";
import { createWagmiConfig } from "../src/wallet/config";

export const TEST_ACCOUNT = "0xd2135CfB216b74109775236E36d4b433F1DF507B" as const;

export const makeConfig = (opts: { connected?: boolean; walletConnectProjectId?: string } = {}) =>
  createWagmiConfig({
    walletConnectProjectId: opts.walletConnectProjectId,
    connectors: [mock({ accounts: [TEST_ACCOUNT], features: { reconnect: opts.connected } })],
  });

export function renderWithProviders(ui: ReactNode, path = "/", config = makeConfig()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Providers wagmiConfig={config}>{ui}</Providers>
    </MemoryRouter>,
  );
}

export const renderAt = (path: string, config = makeConfig()) => renderWithProviders(<App />, path, config);
