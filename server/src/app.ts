import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { authRouter } from "./routes/auth.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import type { AppConfig } from "./config.js";

export function createApp(config: AppConfig) {
  const app = express();
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? "up" : "down" });
  });
  app.use("/api/auth", authRouter(config));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
