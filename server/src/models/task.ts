import { Schema, model, type InferSchemaType } from "mongoose";

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const taskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    status: { type: String, enum: TASK_STATUSES, default: "todo" },
    dueDate: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
      },
    },
  },
);

taskSchema.index({ status: 1, dueDate: 1 });

export type TaskDoc = InferSchemaType<typeof taskSchema>;
export const Task = model("Task", taskSchema);
