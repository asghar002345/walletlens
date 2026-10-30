// Vercel serverless entry: wraps the Express app for the demo deployment.
// Without MONGODB_URI it uses the plain in-process store (models/memoryStore.ts): no database at all,
// nothing persists, and data is lost when the function instance is recycled. MOCK_MODE defaults to true.
import type { IncomingMessage, ServerResponse } from "node:http";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let ready: Promise<Handler> | undefined;

async function init(): Promise<Handler> {
  process.env.MOCK_MODE ??= "true";
  if (!process.env.MONGODB_URI) process.env.WALLETLENS_STORE = "memory";
  // Imported after the env is set, because the models pick their store at import time.
  const [{ createApp }, { loadConfig }, { seedKnowledge }] = await Promise.all([
    import("./app.js"),
    import("./config.js"),
    import("./rag/seed.js"),
  ]);
  if (process.env.MONGODB_URI) {
    const { default: mongoose } = await import("mongoose");
    await mongoose.connect(process.env.MONGODB_URI);
  }
  await seedKnowledge();
  return createApp(loadConfig()) as unknown as Handler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= init().catch((err: unknown) => {
    ready = undefined;
    throw err;
  });
  const app = await ready;
  app(req, res);
}
