import { ZodError } from "zod";
import type { Types } from "mongoose";
import { ToolCall } from "../models/toolCall.js";
import { toolByName, type ToolContext } from "./index.js";

export interface ToolResult {
  tool: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  notice?: string;
}

/** Validate args with the tool's Zod schema, run it, and log every call (including failures) to Mongo. */
export async function runTool(
  analysisId: Types.ObjectId,
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const started = Date.now();
  const tool = toolByName(name);
  let result: ToolResult;
  let cached = false;
  try {
    if (!tool) throw new Error(`Unknown tool "${name}"`);
    const args = tool.args.parse(rawArgs);
    const out = await tool.run(args, ctx);
    cached = !!out.cached;
    result = { tool: name, ok: true, data: out.data, notice: out.notice };
  } catch (err) {
    const error =
      err instanceof ZodError
        ? `Invalid arguments: ${err.issues.map((i) => `${i.path.join(".") || "args"} ${i.message}`).join("; ")}`
        : err instanceof Error
          ? err.message
          : "Tool failed";
    result = { tool: name, ok: false, error };
  }
  console.info(JSON.stringify({ event: "tool_call", tool: name, ok: result.ok, ms: Date.now() - started }));
  await ToolCall.create({
    analysisId,
    tool: name,
    args: rawArgs ?? {},
    ok: result.ok,
    result: result.data,
    error: result.error,
    latencyMs: Date.now() - started,
    cached,
  });
  return result;
}
