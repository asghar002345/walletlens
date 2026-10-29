import { useState } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { ConnectModal } from "./ConnectModal";
import { chainName, SUPPORTED_CHAIN_IDS, CHAINS } from "./config";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function WalletButton({ walletConnectEnabled }: { walletConnectEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
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
      <div className="menu-wrap">
        <button
          type="button"
          className="addr"
          title={address}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
        >
          <span className="dot" aria-hidden="true" />
          {short(address)}
        </button>
        {menu && (
          <div role="menu" className="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                disconnect();
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
