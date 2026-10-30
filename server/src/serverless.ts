// Vercel serverless entry: wraps the Express app for the demo deployment (MOCK_MODE, no external DB).
// Each function instance starts its own in-memory MongoDB in /tmp, so demo data is never persisted
// and is lost when the instance is recycled.
import type { IncomingMessage, ServerResponse } from "node:http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { seedKnowledge } from "./rag/seed.js";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let ready: Promise<Handler> | undefined;

async function init(): Promise<Handler> {
  const config = loadConfig({ ...process.env, MOCK_MODE: process.env.MOCK_MODE ?? "true" });
  const uri = process.env.MONGODB_URI;
  if (uri) {
    await mongoose.connect(uri);
  } else {
    const mongo = await MongoMemoryServer.create({ binary: { downloadDir: "/tmp/mongodb-binaries" } });
    await mongoose.connect(mongo.getUri("walletlens"));
  }
  await seedKnowledge();
  return createApp(config) as unknown as Handler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= init().catch((err: unknown) => {
    ready = undefined;
    throw err;
  });
  const app = await ready;
  app(req, res);
}
