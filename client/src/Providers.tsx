import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type Config } from "wagmi";
import { AuthProvider } from "./auth";
import { createWagmiConfig, walletConnectProjectId } from "./wallet/config";

export function Providers({ children, wagmiConfig }: { children: ReactNode; wagmiConfig?: Config }) {
  const [config] = useState(() => wagmiConfig ?? createWagmiConfig({ walletConnectProjectId }));
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
