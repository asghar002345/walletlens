import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll } from "vitest";
import { seedKnowledge } from "../src/rag/seed.js";

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await seedKnowledge();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
