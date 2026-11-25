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

function isRealDate(d: string): boolean {
  const parsed = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
}

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  // The regex allows 2024-02-30, which Date silently rolls over to 03-01.
  .refine(isRealDate, "not a valid date")
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
  compare_previous: z
    .boolean()
    .optional()
    .describe(
      "Also total the same-length period ending the day before start_date, and add previous_*, delta_*, and delta_pct to each group and to totals (default: false). Doubles the number of requests. With group_by day, each day is compared with the day the same distance into the previous period.",
    ),
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

type DaySales = Required<Omit<SalesPage, "max_id">> & { truncated: boolean };

/**
 * Every DetailedSales row for one date, following max_id paging until it stops advancing.
 * `truncated` is true when the page cap was reached while max_id was still advancing,
 * so the rows for that date are incomplete.
 */
async function salesForDate(key: string, day: string): Promise<DaySales> {
  const merged: DaySales = { results: [], app_info: [], package_info: [], country_info: [], truncated: true };
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
    if (next === highwatermark) {
      merged.truncated = false;
      break;
    }
    highwatermark = next;
  }
  return merged;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const usd = (s: string | undefined) => (s ? Number(s) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Every key that appears in any row, so a column only some rows have (such as
 * `name`) is kept even when the first row lacks it. A key first seen in a later
 * row goes right after the key before it in that row, so columns keep the
 * order they have when every row has them.
 */
function csvColumns(rows: Array<Record<string, unknown>>): string[] {
  const cols: string[] = [];
  for (const row of rows) {
    let at = 0;
    for (const k of Object.keys(row)) {
      const i = cols.indexOf(k);
      if (i === -1) cols.splice(at++, 0, k);
      else at = i + 1;
    }
  }
  return cols;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const cols = csvColumns(rows);
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

type GroupBy = "country" | "day" | "app" | "package" | "platform";
type Group = Record<string, number | string>;

function emptyGroup(groupBy: GroupBy, groupKey: string): Group {
  return {
    [groupBy]: groupKey,
    gross_units_sold: 0,
    gross_units_returned: 0,
    net_units_sold: 0,
    gross_units_activated: 0,
    gross_sales_usd: 0,
    net_sales_usd: 0,
  };
}

interface WindowTotals {
  groups: Map<string, Group>;
  rowsSeen: number;
  truncatedDates: string[];
}

/**
 * Fetch and group every sales row for `days`. `dayLabel` names the group for
 * group_by day, so a previous period can be keyed by the matching current day.
 */
async function totalWindow(
  key: string,
  days: string[],
  appid: number | undefined,
  groupBy: GroupBy,
  names: Map<string, string>,
  dayLabel: (day: string) => string = (d) => d,
): Promise<WindowTotals> {
  const groups = new Map<string, Group>();
  let rowsSeen = 0;
  const truncatedDates: string[] = [];

  for (const day of days) {
    const page = await salesForDate(key, day);
    if (page.truncated) truncatedDates.push(day);
    for (const a of page.app_info) names.set(`app:${a.appid}`, a.app_name);
    for (const p of page.package_info) names.set(`package:${p.packageid}`, p.package_name);
    for (const c of page.country_info) names.set(`country:${c.country_code}`, c.country_name);

    for (const row of page.results) {
      if (appid && row.appid !== appid && row.primary_appid !== appid) continue;
      rowsSeen++;
      const groupKey = {
        country: row.country_code ?? "unknown",
        day: dayLabel(day),
        app: String(row.appid ?? row.primary_appid ?? "unknown"),
        package: String(row.packageid ?? "unknown"),
        platform: row.platform ?? "unknown",
      }[groupBy];
      const g = groups.get(groupKey) ?? emptyGroup(groupBy, groupKey);
      (g.gross_units_sold as number) += row.gross_units_sold ?? 0;
      (g.gross_units_returned as number) += row.gross_units_returned ?? 0;
      (g.net_units_sold as number) += row.net_units_sold ?? 0;
      (g.gross_units_activated as number) += row.gross_units_activated ?? 0;
      (g.gross_sales_usd as number) += usd(row.gross_sales_usd);
      (g.net_sales_usd as number) += usd(row.net_sales_usd);
      groups.set(groupKey, g);
    }
  }
  return { groups, rowsSeen, truncatedDates };
}

interface Figures {
  net_units_sold: number;
  net_sales_usd: number;
}

/** previous_*, delta_*, and delta_pct (null when the previous period had no revenue). */
function comparison(cur: Figures, prev: Figures) {
  return {
    previous_net_units_sold: prev.net_units_sold,
    delta_net_units_sold: cur.net_units_sold - prev.net_units_sold,
    previous_net_sales_usd: round2(prev.net_sales_usd),
    delta_net_sales_usd: round2(cur.net_sales_usd - prev.net_sales_usd),
    delta_pct:
      prev.net_sales_usd === 0
        ? null
        : Math.round(((cur.net_sales_usd - prev.net_sales_usd) / Math.abs(prev.net_sales_usd)) * 1000) / 10,
  };
}

function sumGroups(groups: Iterable<Group>): Figures & { gross_sales_usd: number } {
  let net_units_sold = 0;
  let gross_sales_usd = 0;
  let net_sales_usd = 0;
  for (const g of groups) {
    net_units_sold += g.net_units_sold as number;
    gross_sales_usd += g.gross_sales_usd as number;
    net_sales_usd += g.net_sales_usd as number;
  }
  return { net_units_sold, gross_sales_usd, net_sales_usd };
}

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getSalesSummary",
    {
      title: "Get Sales Summary",
      description:
        "Summarize your Steam sales for a date range (up to 31 days): units sold, returned, and activated, and gross and net revenue in USD, grouped by country, day, app, package, or platform, optionally compared with the previous period of the same length. Reads IPartnerFinancialsService with a Financial API Group key (STEAM_FINANCIAL_API_KEY, or STEAM_API_KEY), server IP allowlisted.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ start_date, end_date, appid, group_by, top, format, compare_previous }) => {
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

        const current = await totalWindow(key, days, appid, groupBy, names);
        const previousDays = days.map((d) => addDays(d, -days.length));
        const previous = compare_previous
          ? await totalWindow(key, previousDays, appid, groupBy, names, (d) => addDays(d, days.length))
          : undefined;
        if (previous) {
          // Groups that sold only in the previous period still show, with zeros for this one.
          for (const k of previous.groups.keys()) {
            if (!current.groups.has(k)) current.groups.set(k, emptyGroup(groupBy, k));
          }
        }
        const truncatedDates = [...(previous?.truncatedDates ?? []), ...current.truncatedDates];

        const sorted = [...current.groups.entries()]
          .map(([groupKey, g]): Record<string, number | string | null> => {
            const name = names.get(`${groupBy}:${g[groupBy]}`);
            const prev = previous ? (previous.groups.get(groupKey) ?? emptyGroup(groupBy, groupKey)) : undefined;
            return {
              ...g,
              ...(name ? { name } : {}),
              gross_sales_usd: round2(g.gross_sales_usd as number),
              net_sales_usd: round2(g.net_sales_usd as number),
              ...(prev ? comparison(sumGroups([g]), sumGroups([prev])) : {}),
            };
          })
          .sort((a, b) => (b.net_sales_usd as number) - (a.net_sales_usd as number));
        const shown = sorted.slice(0, top ?? 25);
        const cur = sumGroups(current.groups.values());
        const totals = {
          net_units_sold: cur.net_units_sold,
          gross_sales_usd: round2(cur.gross_sales_usd),
          net_sales_usd: round2(cur.net_sales_usd),
          ...(previous ? comparison(cur, sumGroups(previous.groups.values())) : {}),
        };

        const warning =
          truncatedDates.length > 0
            ? `Incomplete: stopped after ${MAX_PAGES_PER_DATE} pages on ${truncatedDates.join(", ")}, so the totals leave out the rest of those dates' sales.`
            : undefined;

        if (format === "csv") {
          const content = [{ type: "text" as const, text: toCsv(shown) }];
          if (warning) content.push({ type: "text" as const, text: warning });
          return { content };
        }
        const text = JSON.stringify({
          start_date,
          end_date: end,
          ...(previous
            ? { previous_start_date: previousDays[0], previous_end_date: previousDays[previousDays.length - 1] }
            : {}),
          timezone: "America/Los_Angeles (Steam financial day)",
          ...(appid ? { appid } : {}),
          group_by: groupBy,
          rows_counted: current.rowsSeen,
          ...(warning ? { truncated_dates: truncatedDates, warning } : {}),
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
