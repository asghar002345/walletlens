export function Logo() {
  return (
    <span className="logo">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="wl-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8aa2ff" />
            <stop offset="1" stopColor="#59e1c6" />
          </linearGradient>
        </defs>
        <circle cx="14" cy="14" r="9" fill="none" stroke="url(#wl-g)" strokeWidth="3" />
        <path d="M21 21l7 7" stroke="url(#wl-g)" strokeWidth="3.5" strokeLinecap="round" />
        <path
          d="M10 14.5l3 3 5-6"
          fill="none"
          stroke="#e6ebf5"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="brand">WalletLens</span>
    </span>
  );
}
