import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamPartnerUrl, steamFetch, publisherErrorResponse, errorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";

// IPartnerFinancialsService needs a Financial API Group key, which is separate
// from a normal publisher key: https://partner.steamgames.com/doc/webapi/IPartnerFinancialsService

export function financialKey(): string {
  const key = process.env.STEAM_FINANCIAL_API_KEY?.trim() || process.env.STEAM_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Set STEAM_FINANCIAL_API_KEY to a Financial API Group key (Steamworks > Users & Permissions > Manage Groups > create a Financial API Group). STEAM_API_KEY is used as a fallback. A free community key cannot read sales.",
    );
  }
  return key;
}

const MAX_DAYS = 31;
const MAX_PAGES_PER_DATE = 50;

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .describe("Date in YYYY-MM-DD, Pacific Time (Steam's financial day)");

const inputSchema = {
  start_date: date,
  end_date: date.optional().describe("Last date, inclusive (default: start_date). At most 31 days after start_date."),
  appid: z.number().int().positive().optional().describe("Only count sales of this app (matches appid or primary_appid)"),
  group_by: z
    .enum(["country", "day", "app", "package", "platform"])
    .optional()
    .describe("How to group the totals (default: country)"),
  top: z.number().int().min(1).max(500).optional().describe("Return the top N groups by net revenue (default: 25)"),
  format: z.enum(["json", "csv"]).optional().describe("json (default) or csv for spreadsheets"),
};

interface SalesRow {
  date?: string;
  appid?: number;
  primary_appid?: number;
  packageid?: number;
  platform?: string;
  country_code?: string;
  gross_units_sold?: number;
  gross_units_returned?: number;
  net_units_sold?: number;
  gross_units_activated?: number;
  gross_sales_usd?: string;
  net_sales_usd?: string;
}

interface SalesPage {
  results?: SalesRow[];
  max_id?: string | number;
  app_info?: Array<{ appid: number; app_name: string }>;
  package_info?: Array<{ packageid: number; package_name: string }>;
  country_info?: Array<{ country_code: string; country_name: string }>;
}

function* dates(start: string, end: string): Generator<string> {
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/** Every DetailedSales row for one date, following max_id paging until it stops advancing. */
async function salesForDate(key: string, day: string): Promise<Required<Omit<SalesPage, "max_id">>> {
  const merged: Required<Omit<SalesPage, "max_id">> = { results: [], app_info: [], package_info: [], country_info: [] };
  let highwatermark = "0";
  for (let page = 0; page < MAX_PAGES_PER_DATE; page++) {
    const data = (await steamFetch(
      steamPartnerUrl("/IPartnerFinancialsService/GetDetailedSales/v001/", {
        key,
        date: day,
        highwatermark_id: highwatermark,
      }),
    )) as { response?: SalesPage };
    const r = data.response ?? {};
    merged.results.push(...(r.results ?? []));
    merged.app_info.push(...(r.app_info ?? []));
    merged.package_info.push(...(r.package_info ?? []));
    merged.country_info.push(...(r.country_info ?? []));
    const next = String(r.max_id ?? highwatermark);
    if (next === highwatermark) break;
    highwatermark = next;
  }
  return merged;
}

const usd = (s: string | undefined) => (s ? Number(s) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getSalesSummary",
    {
      title: "Get Sales Summary",
      description:
        "Summarize your Steam sales for a date range (up to 31 days): units sold, returned, and activated, and gross and net revenue in USD, grouped by country, day, app, package, or platform. Reads IPartnerFinancialsService with a Financial API Group key (STEAM_FINANCIAL_API_KEY, or STEAM_API_KEY), server IP allowlisted.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ start_date, end_date, appid, group_by, top, format }) => {
      try {
        const end = end_date ?? start_date;
        const days = [...dates(start_date, end)];
        if (days.length === 0) {
          return errorResponse(new Error("end_date is before start_date."));
        }
        if (days.length > MAX_DAYS) {
          return errorResponse(new Error(`At most ${MAX_DAYS} days per call (asked for ${days.length}).`));
        }
        const key = financialKey();
        const groupBy = group_by ?? "country";

        const names = new Map<string, string>();
        const groups = new Map<string, Record<string, number | string>>();
        let rowsSeen = 0;

        for (const day of days) {
          const page = await salesForDate(key, day);
          for (const a of page.app_info) names.set(`app:${a.appid}`, a.app_name);
          for (const p of page.package_info) names.set(`package:${p.packageid}`, p.package_name);
          for (const c of page.country_info) names.set(`country:${c.country_code}`, c.country_name);

          for (const row of page.results) {
            if (appid && row.appid !== appid && row.primary_appid !== appid) continue;
            rowsSeen++;
            const groupKey = {
              country: row.country_code ?? "unknown",
              day,
              app: String(row.appid ?? row.primary_appid ?? "unknown"),
              package: String(row.packageid ?? "unknown"),
              platform: row.platform ?? "unknown",
            }[groupBy];
            const g = groups.get(groupKey) ?? {
              [groupBy]: groupKey,
              gross_units_sold: 0,
              gross_units_returned: 0,
              net_units_sold: 0,
              gross_units_activated: 0,
              gross_sales_usd: 0,
              net_sales_usd: 0,
            };
            (g.gross_units_sold as number) += row.gross_units_sold ?? 0;
            (g.gross_units_returned as number) += row.gross_units_returned ?? 0;
            (g.net_units_sold as number) += row.net_units_sold ?? 0;
            (g.gross_units_activated as number) += row.gross_units_activated ?? 0;
            (g.gross_sales_usd as number) += usd(row.gross_sales_usd);
            (g.net_sales_usd as number) += usd(row.net_sales_usd);
            groups.set(groupKey, g);
          }
        }

        const sorted = [...groups.values()]
          .map((g): Record<string, number | string> => {
            const name = names.get(`${groupBy}:${g[groupBy]}`);
            return {
              ...g,
              ...(name ? { name } : {}),
              gross_sales_usd: round2(g.gross_sales_usd as number),
              net_sales_usd: round2(g.net_sales_usd as number),
            };
          })
          .sort((a, b) => (b.net_sales_usd as number) - (a.net_sales_usd as number));
        const shown = sorted.slice(0, top ?? 25);
        const totals = sorted.reduce<{ net_units_sold: number; gross_sales_usd: number; net_sales_usd: number }>(
          (t, g) => ({
            net_units_sold: t.net_units_sold + (g.net_units_sold as number),
            gross_sales_usd: round2(t.gross_sales_usd + (g.gross_sales_usd as number)),
            net_sales_usd: round2(t.net_sales_usd + (g.net_sales_usd as number)),
          }),
          { net_units_sold: 0, gross_sales_usd: 0, net_sales_usd: 0 },
        );

        const text =
          format === "csv"
            ? toCsv(shown)
            : JSON.stringify({
                start_date,
                end_date: end,
                timezone: "America/Los_Angeles (Steam financial day)",
                ...(appid ? { appid } : {}),
                group_by: groupBy,
                rows_counted: rowsSeen,
                group_count: sorted.length,
                totals,
                groups: shown,
              });
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return publisherErrorResponse(error);
      }
    },
  );
}
