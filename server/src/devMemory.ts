// `npm run dev:memory`: runs the API against an in-memory MongoDB, so no database install is needed.
// Data is lost on exit. Use MONGODB_URI (local mongod or Atlas M0) for persistence.
import "dotenv/config";
import { MongoMemoryServer } from "mongodb-memory-server";

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri("walletlens");
process.env.JWT_SECRET ??= "dev-only-insecure-secret-change-me";
console.log("In-memory MongoDB started (dev only, data is not persisted)");
await import("./index.js");
