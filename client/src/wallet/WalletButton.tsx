import { useState } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { ConnectModal } from "./ConnectModal";
import { chainName, SUPPORTED_CHAIN_IDS, CHAINS } from "./config";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function WalletButton({ walletConnectEnabled }: { walletConnectEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const { address, chainId, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { mutate: switchChain } = useSwitchChain();

  if (!isConnected || !address)
    return (
      <>
        <button type="button" className="secondary" onClick={() => setOpen(true)}>
          Connect wallet
        </button>
        <ConnectModal open={open} onClose={() => setOpen(false)} walletConnectEnabled={walletConnectEnabled} />
      </>
    );

  const supported = chainId !== undefined && SUPPORTED_CHAIN_IDS.includes(chainId);
  return (
    <div className="row wallet">
      {supported ? (
        <span className="pill ok">{chainName(chainId)}</span>
      ) : (
        <button type="button" className="pill bad as-button" onClick={() => switchChain({ chainId: CHAINS[0].id })}>
          Unsupported network · switch to Sepolia
        </button>
      )}
      <code className="addr" title={address}>
        {short(address)}
      </code>
      <button type="button" className="ghost small" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
