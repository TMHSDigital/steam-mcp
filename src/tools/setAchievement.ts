import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAchievementWrite } from "../utils/achievementWrite.js";

export function register(server: McpServer): void {
  registerAchievementWrite(server, {
    name: "steam_setAchievement",
    title: "Set Achievement",
    verb: "set",
    value: 1,
    description:
      "MUTATES LIVE ACHIEVEMENT STATE. Default dry_run=true; requires confirm=true to send. Set (unlock) one achievement, or several at once with achievements, for a player via the partner API. The dry run lists every change. Intended for dev/test use. Requires a publisher API key with server IP allowlisted in Steamworks partner settings.",
  });
}
