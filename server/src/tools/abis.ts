import { erc20Abi, erc721Abi, parseAbi } from "viem";

/** Small, known ABIs used to decode calldata offline. Unknown selectors are reported as unknown. */
export const KNOWN_ABIS = [
  { standard: "ERC-20", abi: erc20Abi },
  { standard: "ERC-721", abi: erc721Abi },
  {
    standard: "ERC-2612",
    abi: parseAbi([
      "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
    ]),
  },
  { standard: "Multicall", abi: parseAbi(["function multicall(bytes[] data) returns (bytes[] results)"]) },
] as const;

export const MAX_UINT256 = 2n ** 256n - 1n;
