import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registeredTools } from "./harness.js";

const tools = registeredTools();
const sales = tools.get("steam_getSalesSummary")!.handler;

function page(results: unknown[], max_id: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ response: { results, max_id, ...extra } }));
}

beforeEach(() => {
  vi.stubEnv("STEAM_FINANCIAL_API_KEY", "FINKEY_NOT_REAL");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("steam_getSalesSummary", () => {
  it("pages each date until max_id stops advancing and groups by country", async () => {
    const fetchMock = vi
      .fn()
      // 2026-10-01: two pages, then max_id repeats.
      .mockResolvedValueOnce(
        page(
          [
            { appid: 620, country_code: "US", net_units_sold: 10, gross_units_sold: 11, gross_units_returned: 1, gross_sales_usd: "110.0000", net_sales_usd: "90.5000" },
            { appid: 620, country_code: "DE", net_units_sold: 4, gross_sales_usd: "40.0000", net_sales_usd: "30.0000" },
          ],
          "5",
          { country_info: [{ country_code: "US", country_name: "United States" }] },
        ),
      )
      .mockResolvedValueOnce(page([{ appid: 999, country_code: "US", net_units_sold: 100, net_sales_usd: "1000.0000" }], "7"))
      .mockResolvedValueOnce(page([], "7"))
      // 2026-10-02: one page.
      .mockResolvedValueOnce(page([{ primary_appid: 620, country_code: "DE", net_units_sold: 1, net_sales_usd: "9.9999" }], "0"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sales({ start_date: "2026-10-01", end_date: "2026-10-02", appid: 620 });
    const body = JSON.parse(result.content[0].text);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const first = new URL(fetchMock.mock.calls[0][0] as string);
    expect(first.host).toBe("partner.steam-api.com");
    expect(first.searchParams.get("key")).toBe("FINKEY_NOT_REAL");
    expect(first.searchParams.get("highwatermark_id")).toBe("0");
    expect(new URL(fetchMock.mock.calls[1][0] as string).searchParams.get("highwatermark_id")).toBe("5");

    expect(body.rows_counted).toBe(3); // app 999 filtered out
    expect(body.groups).toEqual([
      expect.objectContaining({ country: "US", name: "United States", net_units_sold: 10, net_sales_usd: 90.5 }),
      expect.objectContaining({ country: "DE", net_units_sold: 5, net_sales_usd: 40 }),
    ]);
    expect(body.totals).toEqual({ net_units_sold: 15, gross_sales_usd: 150, net_sales_usd: 130.5 });
  });

  it("exports CSV", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(page([{ country_code: "US", net_units_sold: 2, net_sales_usd: "19.98" }], "0")),
    );
    const result = await sales({ start_date: "2026-10-01", group_by: "day", format: "csv" });
    const [header, row] = result.content[0].text.split("\n");
    expect(header.split(",")[0]).toBe("day");
    expect(row).toContain("2026-10-01");
  });

  it("refuses ranges over 31 days and reversed ranges", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect((await sales({ start_date: "2026-01-01", end_date: "2026-03-01" })).isError).toBe(true);
    expect((await sales({ start_date: "2026-03-01", end_date: "2026-01-01" })).isError).toBe(true);
  });

  it("falls back to STEAM_API_KEY and explains a missing key", async () => {
    vi.stubEnv("STEAM_FINANCIAL_API_KEY", "");
    vi.stubEnv("STEAM_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    const result = await sales({ start_date: "2026-10-01" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("STEAM_API_KEY");
  });
});
