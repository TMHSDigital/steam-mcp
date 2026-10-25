import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamPartnerUrl, steamFetch, publisherErrorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";
import { financialKey } from "./getSalesSummary.js";

const inputSchema = {
  highwatermark: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .describe("result_highwatermark from your last call (default: 0, which returns every date with sales)"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getChangedSalesDates",
    {
      title: "Get Changed Sales Dates",
      description:
        "List the dates whose Steam sales data changed since a highwatermark, for incremental syncing. Pass the returned result_highwatermark next time. Dates are Pacific Time. Needs a Financial API Group key (STEAM_FINANCIAL_API_KEY, or STEAM_API_KEY).",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ highwatermark }) => {
      try {
        const data = (await steamFetch(
          steamPartnerUrl("/IPartnerFinancialsService/GetChangedDatesForPartner/v001/", {
            key: financialKey(),
            highwatermark: highwatermark ?? "0",
          }),
        )) as { response?: { dates?: string[]; result_highwatermark?: string } };
        const r = data.response;
        if (!r) {
          return publisherErrorResponse(new Error("Steam returned no changed-dates data."));
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                dates: r.dates ?? [],
                result_highwatermark: r.result_highwatermark,
                changed: (r.dates ?? []).length > 0,
              }),
            },
          ],
        };
      } catch (error) {
        return publisherErrorResponse(error);
      }
    },
  );
}
