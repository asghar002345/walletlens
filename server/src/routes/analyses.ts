import { Router } from "express";
import type { Address, Hex } from "viem";
import { Analysis } from "../models/analysis.js";
import { createAnalysisSchema } from "../validation.js";
import { HttpError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";
import type { GuardedChainReader } from "../chain/guardedReader.js";
import type { SupportedChainId } from "../chain/networks.js";
import type { AppConfig } from "../config.js";

export function analysesRouter(config: AppConfig, chain: GuardedChainReader) {
  const router = Router();
  router.use(requireAuth(config.jwtSecret));

  router.post("/", async (req, res) => {
    const input = createAnalysisSchema.parse(req.body);
    const chainId = input.chainId as SupportedChainId;
    const notices: string[] = [];
    let chainData: unknown = null;
    let mode: "mock" | "live" = config.mockMode ? "mock" : "live";

    if (input.kind === "tx") {
      const r = await chain.getTx(chainId, input.value as Hex);
      if (!r.value) throw new HttpError(404, "Transaction not found on this testnet");
      chainData = r.value;
      if (r.source === "mock") mode = "mock";
      if (r.notice) notices.push(r.notice);
    } else {
      const target = input.kind === "address" ? input.value : input.request.to;
      if (target) {
        const r = await chain.getAddress(chainId, target as Address);
        chainData = { target: r.value };
        if (r.source === "mock") mode = "mock";
        if (r.notice) notices.push(r.notice);
      }
    }
    if (mode === "mock") notices.push("Mock mode: chain data comes from offline fixtures, not a live RPC.");

    const analysis = await Analysis.create({
      userId: req.userId,
      chainId,
      input: input.kind === "signRequest" ? { kind: input.kind, request: input.request } : input,
      chainData,
      mode,
      notices,
      status: "pending",
    });
    res.status(201).json({ analysis });
  });

  router.get("/", async (req, res) => {
    const analyses = await Analysis.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50);
    res.json({ analyses });
  });

  router.get("/:id", async (req, res) => {
    const analysis = await Analysis.findOne({ _id: req.params.id, userId: req.userId });
    if (!analysis) throw new HttpError(404, "Analysis not found");
    res.json({ analysis });
  });

  return router;
}
