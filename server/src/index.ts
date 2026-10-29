import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const { MONGODB_URI = "mongodb://127.0.0.1:27017/walletlens", PORT = "4000" } = process.env;

await mongoose.connect(MONGODB_URI);
createApp(config).listen(Number(PORT), () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
