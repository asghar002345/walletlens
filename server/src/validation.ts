import { z } from "zod";
import { isAddress, isHex } from "viem";
import { SUPPORTED_CHAIN_IDS } from "./chain/networks.js";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name must be at most 80 characters"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

// ---- WalletLens analysis input ----

const chainId = z.coerce
  .number()
  .int()
  .refine((id) => (SUPPORTED_CHAIN_IDS as number[]).includes(id), {
    message: `Unsupported chain. Testnets only: ${SUPPORTED_CHAIN_IDS.join(", ")} (mainnet is blocked)`,
  });
const address = z.string().refine((v) => isAddress(v, { strict: false }), "Invalid address");
const txHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash");
const hexData = z.string().refine((v) => isHex(v), "Must be 0x-prefixed hex");
const quantity = z.union([hexData, z.string().regex(/^\d+$/)]).optional();

/** Unsigned eth_sendTransaction params captured from a wallet request. WalletLens never signs. */
export const signRequestSchema = z.object({
  from: address,
  to: address.optional(),
  value: quantity,
  data: hexData.optional(),
  gas: quantity,
});

export const createAnalysisSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tx"), chainId, value: txHash }),
  z.object({ kind: z.literal("address"), chainId, value: address }),
  z.object({ kind: z.literal("signRequest"), chainId, request: signRequestSchema }),
]);
export type CreateAnalysisInput = z.infer<typeof createAnalysisSchema>;
