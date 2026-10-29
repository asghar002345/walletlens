import { Router } from "express";
import { Task } from "../models/task.js";
import { createTaskSchema, listQuerySchema, updateTaskSchema } from "../validation.js";
import { HttpError } from "../middleware/errors.js";

export const tasksRouter = Router();

// Express 5 forwards rejected promises to the error handler, so no try/catch needed.
tasksRouter.get("/", async (req, res) => {
  const { status } = listQuerySchema.parse(req.query);
  const tasks = await Task.find(status ? { status } : {}).sort({ createdAt: -1 });
  res.json(tasks);
});

tasksRouter.get("/:id", async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw new HttpError(404, "Task not found");
  res.json(task);
});

tasksRouter.post("/", async (req, res) => {
  const data = createTaskSchema.parse(req.body);
  const task = await Task.create(data);
  res.status(201).json(task);
});

tasksRouter.patch("/:id", async (req, res) => {
  const data = updateTaskSchema.parse(req.body);
  const task = await Task.findByIdAndUpdate(req.params.id, data, { returnDocument: "after", runValidators: true });
  if (!task) throw new HttpError(404, "Task not found");
  res.json(task);
});

tasksRouter.delete("/:id", async (req, res) => {
  const task = await Task.findByIdAndDelete(req.params.id);
  if (!task) throw new HttpError(404, "Task not found");
  res.status(204).end();
});
