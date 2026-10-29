// `npm run seed:knowledge -w server`: upsert notes, and embed them with Gemini when live retrieval is configured.
import "dotenv/config";
import mongoose from "mongoose";
import { loadConfig } from "./config.js";
import { seedKnowledge } from "./rag/seed.js";
import { selectEmbedder } from "./rag/select.js";

const config = loadConfig({ JWT_SECRET: "seed-script-does-not-use-jwt", ...process.env });
await mongoose.connect(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/walletlens");
const r = await seedKnowledge(selectEmbedder(config) ?? undefined);
console.log(`Knowledge: ${r.notes} notes upserted, ${r.embedded} embedded`);
await mongoose.disconnect();
