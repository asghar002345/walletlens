import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { Logo } from "../components/Logo";

const STEPS = [
  {
    n: "1",
    t: "Paste or build",
    d: "A testnet tx hash, an address, or an unsigned signing request from your connected wallet.",
  },
  {
    n: "2",
    t: "Read-only tools",
    d: "WalletLens fetches the tx, decodes calldata, checks approvals and the contract. Every call is logged.",
  },
  {
    n: "3",
    t: "Cited verdict",
    d: "A schema-checked risk level with reasons that point at tool evidence and curated notes.",
  },
];

const FEATURES = [
  ["Never signs", "No keys, no send or sign calls. A test fails the build if one appears."],
  ["Testnets only", "Sepolia and Polygon Amoy. Mainnet chain ids are rejected."],
  ['Says "I don\'t know"', "No evidence means an unknown verdict, not a reassuring guess."],
  ["Injection-aware", "Token names are untrusted data. Instruction-like text is flagged, not followed."],
  ["Free to run", "Offline mock mode by default; live mode uses free tiers with caps and caching."],
  ["Auditable", "Trace, tool-call log and retrieved notes are shown for every analysis."],
];

export function Landing() {
  const { user } = useAuth();
  const cta = user ? { to: "/app", label: "Open the app" } : { to: "/register", label: "Get started" };
  return (
    <div className="landing">
      <header className="topbar transparent">
        <Logo />
        <nav className="row" aria-label="Main">
          {user ? (
            <Link to="/app" className="button secondary">
              Open app
            </Link>
          ) : (
            <>
              <Link to="/login" className="button ghost">
                Sign in
              </Link>
              <Link to="/register" className="button secondary">
                Create account
              </Link>
            </>
          )}
        </nav>
      </header>

      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Pre-signing risk check · testnets</p>
            <h1>
              See what a transaction <em>really</em> does before you sign it.
            </h1>
            <p className="lede">
              WalletLens explains transactions and signing requests in plain language, flags risky approvals and cites
              its evidence. It is read-only and never signs.
            </p>
            <div className="row">
              <Link to={cta.to} className="button primary lg">
                {cta.label}
              </Link>
              <a href="#how" className="button ghost lg">
                How it works
              </a>
            </div>
          </div>
          <div className="hero-card" aria-hidden="true">
            <div className="mock-verdict">
              <div className="row between">
                <b>Verdict</b>
                <span className="badge risk-high">High risk</span>
              </div>
              <p>Approves an unlimited amount of the token to a spender.</p>
              <div className="evidence">
                <span className="chip tool">decodeCalldata</span>
                <span className="chip tool">getTokenApprovals</span>
                <span className="chip note">std-erc20-unlimited</span>
              </div>
              <small className="muted">Example output on demo data</small>
            </div>
          </div>
        </section>

        <section id="how" className="steps" aria-labelledby="how-h">
          <h2 id="how-h">How it works</h2>
          <ol>
            {STEPS.map((s) => (
              <li key={s.n} className="card">
                <span className="step-n" aria-hidden="true">
                  {s.n}
                </span>
                <h3>{s.t}</h3>
                <p className="muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="features" aria-labelledby="feat-h">
          <h2 id="feat-h">Built to be trusted</h2>
          <ul>
            {FEATURES.map(([t, d]) => (
              <li key={t}>
                <h3>{t}</h3>
                <p className="muted">{d}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="footer muted small">
        WalletLens is an open-source demo. MIT licensed. Not financial or security advice.
      </footer>
    </div>
  );
}
