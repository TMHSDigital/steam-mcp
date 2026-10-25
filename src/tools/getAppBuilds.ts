import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamPartnerUrl, steamFetch, requireApiKey, publisherErrorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";

const inputSchema = {
  appid: z.number().int().positive().describe("Your app's ID"),
  count: z.number().int().min(1).max(100).optional().describe("Number of recent builds to return (default: 10)"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getAppBuilds",
    {
      title: "Get App Builds",
      description:
        "Get an app's recent build history: build IDs, descriptions, and upload times. Requires the publisher key that owns the app, with the server IP allowlisted.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ appid, count }) => {
      try {
        const key = requireApiKey();
        const data = (await steamFetch(
          steamPartnerUrl("/ISteamApps/GetAppBuilds/v1/", { key, appid, count: count ?? 10 }),
        )) as { response?: Record<string, unknown> };
        if (!data.response) {
          return publisherErrorResponse(new Error(`Steam returned no build history for app ${appid}.`));
        }
        return { content: [{ type: "text", text: JSON.stringify({ appid, ...data.response }) }] };
      } catch (error) {
        return publisherErrorResponse(error);
      }
    },
  );
}
