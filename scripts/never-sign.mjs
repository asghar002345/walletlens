// Shared list of wallet APIs that sign, send or hold keys. WalletLens must never use any of them.
// Used by the ESLint rule (eslint.config.js) and by the guard tests in server/ and client/.
export const FORBIDDEN_APIS = [
  // viem / wagmi actions
  "sendTransaction",
  "sendRawTransaction",
  "sendCalls",
  "signMessage",
  "signTypedData",
  "signTransaction",
  "signAuthorization",
  "writeContract",
  "deployContract",
  // wagmi hooks
  "useSendTransaction",
  "useSendCalls",
  "useSignMessage",
  "useSignTypedData",
  "useWriteContract",
  "useDeployContract",
  // key material
  "createWalletClient",
  "privateKeyToAccount",
  "mnemonicToAccount",
  "hdKeyToAccount",
  // raw JSON-RPC methods
  "eth_sendTransaction",
  "eth_sendRawTransaction",
  "eth_sign",
  "eth_signTransaction",
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "personal_sign",
  "wallet_sendCalls",
];

/** Matches any forbidden name as a whole identifier or string. */
export const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN_APIS.join("|")})\\b`);
