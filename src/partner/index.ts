#!/usr/bin/env node
/**
 * Gated Partner-admin MCP process. Not the default @tmhs/steam-mcp bin.
 * Run locally: STEAM_PARTNER_ADMIN=1 npx tsx src/partner/index.ts
 *
 * Use at your own risk. It drives the Steamworks partner site's unofficial
 * form fields with the user's session; Valve publishes no API for this, and
 * automated use may fall outside the Steamworks terms. See the README.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "../version.js";
import { envFlag } from "../utils/env.js";
import {
  registerPartnerLogin,
  registerUploadStoreImage,
  registerUploadTrailer,
} from "./tools.js";

function fail(message: string): never {
  console.error(`[AUTH_MISSING] ${message}`);
  process.exit(1);
}

// Keep partner-admin as an explicit 1 gate. Ordinary boolean switches accept
// true and yes, but this operator-only process should not.
if (!envFlag("STEAM_PARTNER_ADMIN", process.env, { strict: true })) {
  fail("Set STEAM_PARTNER_ADMIN=1 to start the Partner-admin process.");
}

const cookies = process.env.STEAM_PARTNER_COOKIES?.trim();
const profile = process.env.STEAM_PARTNER_PROFILE_DIR?.trim();
if (!cookies && !profile) {
  fail(
    "Set STEAM_PARTNER_COOKIES (cookie-jar path) or STEAM_PARTNER_PROFILE_DIR (Chromium profile outside the repo).",
  );
}

console.error(
  "[steam-mcp-partner] Use at your own risk: these tools post to unofficial Steamworks partner site forms, which Valve can change and its terms may not allow. Check every upload on the partner site.",
);

const server = new McpServer({
  name: "steam-mcp-partner",
  version: VERSION,
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
