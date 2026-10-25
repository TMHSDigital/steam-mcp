import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { registerAllTools } from "../index.js";

export type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export interface RegisteredTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: z.ZodRawShape;
  annotations?: ToolAnnotations;
  handler: ToolHandler;
}

/** Every default-bin tool, captured from the real registrations. */
export function registeredTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  registerAllTools({
    registerTool(name: string, config: Omit<RegisteredTool, "name" | "handler">, handler: ToolHandler) {
      tools.set(name, { name, ...config, handler });
    },
  } as unknown as McpServer);
  return tools;
}

/** The real input schema of a tool, as a zod object. */
export function schemaOf(tool: RegisteredTool): z.ZodObject<z.ZodRawShape> {
  return z.object(tool.inputSchema);
}

/** A fetch mock that answers every call with the same JSON body. */
export function jsonFetch(body: unknown, status = 200) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}
