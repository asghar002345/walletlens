import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { seedKnowledge } from "./rag/seed.js";

const config = loadConfig();
const { MONGODB_URI = "mongodb://127.0.0.1:27017/walletlens", PORT = "4000" } = process.env;

await mongoose.connect(MONGODB_URI);
// Keep the knowledge collection in sync with knowledge/notes.json (no embedding calls here; use seed:knowledge).
await seedKnowledge();
createApp(config).listen(Number(PORT), () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
