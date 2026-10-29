import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app.js";

const { MONGODB_URI = "mongodb://127.0.0.1:27017/taskboard", PORT = "4000", CLIENT_ORIGIN } = process.env;

await mongoose.connect(MONGODB_URI);
createApp(CLIENT_ORIGIN).listen(Number(PORT), () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
