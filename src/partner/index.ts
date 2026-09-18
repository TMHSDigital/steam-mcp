#!/usr/bin/env node
/**
 * Gated Partner-admin MCP process. Not the default @tmhs/steam-mcp bin.
 * Run locally: STEAM_PARTNER_ADMIN=1 npx tsx src/partner/index.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerPartnerLogin,
  registerUploadStoreImage,
  registerUploadTrailer,
} from "./tools.js";

function fail(message: string): never {
  console.error(`[AUTH_MISSING] ${message}`);
  process.exit(1);
}

if (process.env.STEAM_PARTNER_ADMIN !== "1") {
  fail("Set STEAM_PARTNER_ADMIN=1 to start the Partner-admin process.");
}

const cookies = process.env.STEAM_PARTNER_COOKIES?.trim();
const profile = process.env.STEAM_PARTNER_PROFILE_DIR?.trim();
if (!cookies && !profile) {
  fail(
    "Set STEAM_PARTNER_COOKIES (cookie-jar path) or STEAM_PARTNER_PROFILE_DIR (Chromium profile outside the repo).",
  );
}

const server = new McpServer({
  name: "steam-mcp-partner",
  version: "0.9.0",
});

registerPartnerLogin(server);
registerUploadStoreImage(server);
registerUploadTrailer(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
