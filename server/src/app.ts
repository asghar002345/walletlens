import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import { fileURLToPath } from "node:url";
import { authRouter } from "./routes/auth.js";
import { analysesRouter } from "./routes/analyses.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { FixtureChainReader } from "./chain/fixtureReader.js";
import { ViemChainReader } from "./chain/viemReader.js";
import { GuardedChainReader } from "./chain/guardedReader.js";
import type { ChainReader } from "./chain/types.js";
import type { LlmProvider } from "./llm/types.js";
import { selectProvider } from "./llm/select.js";
import { selectRetriever } from "./rag/select.js";
import type { Retriever } from "./rag/types.js";
import { knowledgeRouter } from "./routes/knowledge.js";
import { metricsRouter } from "./routes/metrics.js";
import type { AppConfig } from "./config.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/chain/sepolia.json", import.meta.url));

export function createApp(
  config: AppConfig,
  deps: { liveChain?: ChainReader | null; llm?: LlmProvider; retriever?: Retriever } = {},
) {
  const app = express();
  app.set("trust proxy", 1); // behind Render/Vercel proxies, so req.ip is the client IP
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(
    "/api",
    rateLimit({
      windowMs: config.apiRateLimit.windowMs,
      limit: config.apiRateLimit.max,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: { message: "Too many requests, slow down" } },
    }),
  );

  const live = config.mockMode ? null : (deps.liveChain ?? new ViemChainReader(config.rpcUrls));
  const chain = new GuardedChainReader(
    live,
    FixtureChainReader.fromFile(FIXTURES),
    config.caps.rpc,
    config.txCacheTtlSec,
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? "up" : "down", mockMode: config.mockMode });
  });
  app.use("/api/auth", authRouter(config));
  app.use("/api/knowledge", knowledgeRouter());
  app.use("/api/metrics", metricsRouter(config));
  app.use(
    "/api/analyses",
    analysesRouter(config, chain, deps.llm ?? selectProvider(config), deps.retriever ?? selectRetriever(config)),
  );

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
