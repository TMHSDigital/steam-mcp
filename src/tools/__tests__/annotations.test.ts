import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { registerAllTools } from "../index.js";
import {
  registerPartnerLogin,
  registerUploadStoreImage,
  registerUploadTrailer,
} from "../../partner/tools.js";

interface Registered {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: ToolAnnotations;
}

function collect(register: (server: McpServer) => void): Registered[] {
  const tools: Registered[] = [];
  const server = {
    registerTool(name: string, config: Omit<Registered, "name">) {
      tools.push({ name, ...config });
    },
    tool() {
      throw new Error("server.tool() is deprecated; use registerTool()");
    },
  };
  register(server as unknown as McpServer);
  return tools;
}

const defaultTools = collect(registerAllTools);
const partnerTools = collect((s) => {
  registerPartnerLogin(s);
  registerUploadStoreImage(s);
  registerUploadTrailer(s);
});
const allTools = [...defaultTools, ...partnerTools];

describe("tool registration", () => {
  it("registers 26 default-bin tools with unique names", () => {
    expect(defaultTools).toHaveLength(26);
    expect(new Set(defaultTools.map((t) => t.name)).size).toBe(26);
  });

  for (const tool of allTools) {
    describe(tool.name, () => {
      it("has a title, description, and annotations", () => {
        expect(tool.title).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.annotations).toBeDefined();
        expect(typeof tool.annotations?.readOnlyHint).toBe("boolean");
        expect(typeof tool.annotations?.openWorldHint).toBe("boolean");
      });

      const gated = tool.inputSchema !== undefined && "confirm" in tool.inputSchema;
      it(gated ? "is a confirm-gated write, so it is marked destructive" : "is not gated, so it is marked read-only", () => {
        if (gated) {
          expect(tool.annotations?.readOnlyHint).toBe(false);
          expect(tool.annotations?.destructiveHint).toBe(true);
          expect(tool.annotations?.openWorldHint).toBe(true);
        } else {
          expect(tool.annotations?.readOnlyHint).toBe(true);
        }
      });
    });
  }
});
