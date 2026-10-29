import express from "express";
import cors from "cors";
import { tasksRouter } from "./routes/tasks.js";
import { errorHandler, notFound } from "./middleware/errors.js";

export function createApp(clientOrigin = "http://localhost:5173") {
  const app = express();
  app.use(cors({ origin: clientOrigin }));
  app.use(express.json({ limit: "100kb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/tasks", tasksRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
