import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamPartnerUrl, steamFetch, requireApiKey, publisherErrorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";

const inputSchema = {
  appid: z.number().int().positive().describe("Your app's ID"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getAppBetas",
    {
      title: "Get App Betas",
      description:
        "List an app's beta branches: which build each points at, whether it is password-protected, and descriptions. Requires the publisher key that owns the app, with the server IP allowlisted.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ appid }) => {
      try {
        const key = requireApiKey();
        const data = (await steamFetch(
          steamPartnerUrl("/ISteamApps/GetAppBetas/v1/", { key, appid }),
        )) as { response?: Record<string, unknown> };
        if (!data.response) {
          return publisherErrorResponse(new Error(`Steam returned no beta branches for app ${appid}.`));
        }
        return { content: [{ type: "text", text: JSON.stringify({ appid, ...data.response }) }] };
      } catch (error) {
        return publisherErrorResponse(error);
      }
    },
  );
}
