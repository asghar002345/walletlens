import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth";
import { WalletButton } from "../wallet/WalletButton";
import { walletConnectProjectId } from "../wallet/config";
import { Logo } from "./Logo";

export function AppHeader({ wcEnabled = !!walletConnectProjectId }: { wcEnabled?: boolean }) {
  const { user, logout } = useAuth();
  return (
    <header className="topbar">
      <Link to="/app" className="plain" aria-label="WalletLens home">
        <Logo />
      </Link>
      <nav className="row" aria-label="Account">
        <WalletButton walletConnectEnabled={wcEnabled} />
        {user && (
          <>
            <NavLink to="/app" end className="navlink hide-sm">
              Analyses
            </NavLink>
            <NavLink to="/metrics" className="navlink">
              Metrics
            </NavLink>
            <span className="muted small hide-sm">{user.email}</span>
            <button type="button" className="ghost" onClick={logout}>
              Log out
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
