import { z } from "zod";
import { TASK_STATUSES } from "./models/task.js";

const dueDate = z
  .union([z.string().date("dueDate must be YYYY-MM-DD"), z.null()])
  .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null));

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title must be at most 120 characters"),
  description: z.string().trim().max(2000, "Description must be at most 2000 characters").optional(),
  status: z.enum(TASK_STATUSES).optional(),
  dueDate: dueDate.optional(),
});

export const updateTaskSchema = createTaskSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" });

export const listQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
});
