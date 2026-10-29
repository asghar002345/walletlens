import { useEffect, useRef } from "react";
import { useConnect, useConnectors } from "wagmi";

/**
 * Connect only reads the account and chain. WalletLens never asks the wallet to sign or send.
 */
export function ConnectModal({
  open,
  onClose,
  walletConnectEnabled,
}: {
  open: boolean;
  onClose: () => void;
  walletConnectEnabled: boolean;
}) {
  const connectors = useConnectors();
  const { mutate: connect, isPending, error, variables } = useConnect();
  const dialogRef = useRef<HTMLDivElement>(null);
  const hasInjected = typeof window !== "undefined" && "ethereum" in window;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  const pendingId = isPending ? (variables?.connector as { id?: string } | undefined)?.id : undefined;

  return (
    <div className="overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-title"
        className="modal card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between">
          <h2 id="connect-title">Connect a wallet</h2>
          <button type="button" className="ghost icon" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted small">
          Read-only. WalletLens uses your address and network to build a signing request to analyse. It never asks your
          wallet to sign or send anything. Testnets only: Sepolia and Polygon Amoy.
        </p>
        <ul className="connectors">
          {connectors.map((c) => {
            const isInjected = c.type === "injected";
            const disabled = isPending || (isInjected && !hasInjected && c.id === "injected");
            return (
              <li key={c.uid}>
                <button
                  type="button"
                  className="connector"
                  disabled={disabled}
                  onClick={() => connect({ connector: c }, { onSuccess: onClose })}
                >
                  <span className={`wallet-icon ${c.type}`} aria-hidden="true" />
                  <span className="grow-text">
                    <b>{isInjected && c.id === "injected" ? "Browser wallet (MetaMask)" : c.name}</b>
                    <small className="muted">
                      {c.type === "walletConnect"
                        ? "Scan a QR code with a mobile wallet"
                        : isInjected && !hasInjected
                          ? "No browser wallet detected. Install MetaMask to use this option."
                          : "MetaMask or another injected wallet"}
                    </small>
                  </span>
                  {pendingId === c.id && <span className="spinner" aria-label="Connecting" />}
                </button>
              </li>
            );
          })}
        </ul>
        {!walletConnectEnabled && (
          <p className="note small" data-testid="wc-disabled-note">
            WalletConnect is hidden: set <code>VITE_WALLETCONNECT_PROJECT_ID</code> (free Reown project id) to enable
            it.
          </p>
        )}
        {error && (
          <div role="alert" className="alert">
            {error.message.split("\n")[0]}
          </div>
        )}
      </div>
    </div>
  );
}
