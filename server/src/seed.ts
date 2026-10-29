// Inserts a few clearly-labelled DEMO tasks. Not real data.
import "dotenv/config";
import mongoose from "mongoose";
import { Task } from "./models/task.js";

const { MONGODB_URI = "mongodb://127.0.0.1:27017/taskboard" } = process.env;
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

await mongoose.connect(MONGODB_URI);
await Task.deleteMany({});
await Task.insertMany([
  { title: "[Demo] Set up project repo", description: "Initialise client and server workspaces.", status: "done", dueDate: inDays(-2) },
  { title: "[Demo] Write API tests", description: "Cover CRUD, validation and 404s with Supertest.", status: "in_progress", dueDate: inDays(1) },
  { title: "[Demo] Design task card", description: "Responsive layout for mobile and desktop.", status: "todo", dueDate: inDays(3) },
  { title: "[Demo] Add status filter", description: "Filter list by To do / In progress / Done.", status: "todo", dueDate: inDays(5) },
]);
console.log("Seeded demo tasks");
await mongoose.disconnect();
