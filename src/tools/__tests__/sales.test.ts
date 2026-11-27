import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registeredTools, schemaOf } from "./harness.js";

// The page-cap test makes 100+ partner calls; skip the per-host token bucket so it runs instantly.
vi.mock("../../utils/cache.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/cache.js")>()),
  acquireToken: async () => 0,
}));

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
    // Routed by date and highwatermark: dates may be fetched concurrently (#111).
    const pages: Record<string, () => Response> = {
      // 2026-10-01: two pages, then max_id repeats.
      "2026-10-01@0": () =>
        page(
          [
            { appid: 620, country_code: "US", net_units_sold: 10, gross_units_sold: 11, gross_units_returned: 1, gross_sales_usd: "110.0000", net_sales_usd: "90.5000" },
            { appid: 620, country_code: "DE", net_units_sold: 4, gross_sales_usd: "40.0000", net_sales_usd: "30.0000" },
          ],
          "5",
          { country_info: [{ country_code: "US", country_name: "United States" }] },
        ),
      "2026-10-01@5": () => page([{ appid: 999, country_code: "US", net_units_sold: 100, net_sales_usd: "1000.0000" }], "7"),
      "2026-10-01@7": () => page([], "7"),
      // 2026-10-02: one page.
      "2026-10-02@0": () => page([{ primary_appid: 620, country_code: "DE", net_units_sold: 1, net_sales_usd: "9.9999" }], "0"),
    };
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const q = new URL(url).searchParams;
      return pages[`${q.get("date")}@${q.get("highwatermark_id")}`]();
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sales({ start_date: "2026-10-01", end_date: "2026-10-02", appid: 620 });
    const body = JSON.parse(result.content[0].text);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const first = new URL(fetchMock.mock.calls[0][0] as string);
    expect(first.host).toBe("partner.steam-api.com");
    expect(first.searchParams.get("key")).toBe("FINKEY_NOT_REAL");
    expect(first.searchParams.get("highwatermark_id")).toBe("0");
    const marks = fetchMock.mock.calls
      .map((call) => new URL(call[0] as string).searchParams)
      .filter((q) => q.get("date") === "2026-10-01")
      .map((q) => q.get("highwatermark_id"));
    expect(marks).toEqual(["0", "5", "7"]);

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

  it("keeps the CSV name column when only a lower row is named (#106)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        page(
          [
            { country_code: "ZZ", net_units_sold: 9, net_sales_usd: "90.00" },
            { country_code: "US", net_units_sold: 2, net_sales_usd: "19.98" },
          ],
          "0",
          { country_info: [{ country_code: "US", country_name: "United States" }] },
        ),
      ),
    );
    const result = await sales({ start_date: "2026-10-01", format: "csv" });
    const [header, top, named] = result.content[0].text.split("\n");
    const cols = header.split(",");
    // Same place as when the top row is named: right after net_sales_usd.
    expect(cols.slice(-2)).toEqual(["net_sales_usd", "name"]);
    expect(top.split(",")[0]).toBe("ZZ");
    expect(top.split(",")[cols.indexOf("name")]).toBe("");
    expect(named.split(",")[0]).toBe("US");
    expect(named.split(",")[cols.indexOf("name")]).toBe("United States");
  });

  it("flags a date whose max_id was still advancing at the page cap (#97)", async () => {
    let n = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const day = new URL(url).searchParams.get("date");
      // 2026-10-01 never stops advancing; 2026-10-02 finishes after one page.
      if (day === "2026-10-01") return page([{ country_code: "US", net_units_sold: 1, net_sales_usd: "1.00" }], String(++n));
      return page([{ country_code: "US", net_units_sold: 1, net_sales_usd: "1.00" }], "0");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sales({ start_date: "2026-10-01", end_date: "2026-10-02" });
    const body = JSON.parse(result.content[0].text);
    expect(fetchMock).toHaveBeenCalledTimes(51);
    expect(body.truncated_dates).toEqual(["2026-10-01"]);
    expect(body.warning).toContain("2026-10-01");
    expect(body.warning).not.toContain("2026-10-02");

    n = 0;
    const csv = await sales({ start_date: "2026-10-01", format: "csv" });
    expect(csv.content).toHaveLength(2);
    expect(csv.content[1].text).toContain("2026-10-01");
  });

  it("has no truncation flag when max_id stops advancing before the cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(page([{ country_code: "US", net_units_sold: 1 }], "3"))
        .mockResolvedValueOnce(page([], "3")),
    );
    const body = JSON.parse((await sales({ start_date: "2026-10-01" })).content[0].text);
    expect(body).not.toHaveProperty("truncated_dates");
    expect(body).not.toHaveProperty("warning");
    const csv = await sales({ start_date: "2026-10-01", format: "csv" });
    expect(csv.content).toHaveLength(1);
  });

  describe("compare_previous (#105)", () => {
    // Current window 2026-10-08..09, previous window 2026-10-06..07.
    const byDate: Record<string, unknown[]> = {
      "2026-10-06": [{ country_code: "US", net_units_sold: 5, net_sales_usd: "50.00" }, { country_code: "FR", net_units_sold: 1, net_sales_usd: "8.00" }],
      "2026-10-07": [{ country_code: "US", net_units_sold: 5, net_sales_usd: "50.00" }],
      "2026-10-08": [{ country_code: "US", net_units_sold: 12, net_sales_usd: "150.00" }],
      "2026-10-09": [{ country_code: "DE", net_units_sold: 2, net_sales_usd: "20.00" }],
    };
    const fetchByDate = () =>
      vi.fn().mockImplementation(async (url: string) => page(byDate[new URL(url).searchParams.get("date")!] ?? [], "0"));

    it("adds previous figures and deltas per group and in totals", async () => {
      const fetchMock = fetchByDate();
      vi.stubGlobal("fetch", fetchMock);
      const body = JSON.parse(
        (await sales({ start_date: "2026-10-08", end_date: "2026-10-09", compare_previous: true })).content[0].text,
      );
      const dates = fetchMock.mock.calls.map((c) => new URL(c[0] as string).searchParams.get("date")).sort();
      expect(dates).toEqual(["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
      expect(body.previous_start_date).toBe("2026-10-06");
      expect(body.previous_end_date).toBe("2026-10-07");
      expect(body.rows_counted).toBe(2);

      const group = (cc: string) => body.groups.find((g: { country: string }) => g.country === cc);
      expect(group("US")).toMatchObject({
        net_sales_usd: 150,
        previous_net_sales_usd: 100,
        delta_net_sales_usd: 50,
        delta_pct: 50,
        net_units_sold: 12,
        previous_net_units_sold: 10,
        delta_net_units_sold: 2,
      });
      // Only in the current period: no baseline, so no percentage.
      expect(group("DE")).toMatchObject({ net_sales_usd: 20, previous_net_sales_usd: 0, delta_pct: null });
      // Only in the previous period: still listed, with zeros for this one.
      expect(group("FR")).toMatchObject({ net_sales_usd: 0, net_units_sold: 0, previous_net_sales_usd: 8, delta_net_sales_usd: -8, delta_pct: -100 });

      expect(body.totals).toMatchObject({
        net_sales_usd: 170,
        previous_net_sales_usd: 108,
        delta_net_sales_usd: 62,
        delta_pct: 57.4,
        net_units_sold: 14,
        previous_net_units_sold: 11,
      });
    });

    it("compares day groups by position in the period", async () => {
      vi.stubGlobal("fetch", fetchByDate());
      const body = JSON.parse(
        (await sales({ start_date: "2026-10-08", end_date: "2026-10-09", group_by: "day", compare_previous: true })).content[0].text,
      );
      expect(body.groups.map((g: { day: string }) => g.day).sort()).toEqual(["2026-10-08", "2026-10-09"]);
      const day = (d: string) => body.groups.find((g: { day: string }) => g.day === d);
      expect(day("2026-10-08")).toMatchObject({ net_sales_usd: 150, previous_net_sales_usd: 58 });
      expect(day("2026-10-09")).toMatchObject({ net_sales_usd: 20, previous_net_sales_usd: 50 });
    });

    it("adds the comparison columns to CSV", async () => {
      vi.stubGlobal("fetch", fetchByDate());
      const csv = (await sales({ start_date: "2026-10-08", end_date: "2026-10-09", format: "csv", compare_previous: true })).content[0].text;
      expect(csv.split("\n")[0]).toContain("previous_net_sales_usd,delta_net_sales_usd,delta_pct");
    });

    it("leaves the default output unchanged", async () => {
      const fetchMock = fetchByDate();
      vi.stubGlobal("fetch", fetchMock);
      const body = JSON.parse((await sales({ start_date: "2026-10-08", end_date: "2026-10-09" })).content[0].text);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(body).not.toHaveProperty("previous_start_date");
      expect(body.totals).toEqual({ net_units_sold: 14, gross_sales_usd: 0, net_sales_usd: 170 });
      expect(body.groups[0]).not.toHaveProperty("delta_pct");
    });
  });

  describe("pinned output and concurrency (#111, #116)", () => {
    // Two-page dates, names, a returned unit, and a previous-only group, so
    // every field of groups and totals is exercised.
    const rows: Record<string, unknown[][]> = {
      "2026-10-06": [[{ appid: 620, packageid: 7, platform: "windows", country_code: "US", gross_units_sold: 6, gross_units_returned: 1, net_units_sold: 5, gross_units_activated: 2, gross_sales_usd: "60.00", net_sales_usd: "50.00" }], [{ appid: 620, country_code: "FR", gross_units_sold: 1, net_units_sold: 1, gross_sales_usd: "9.00", net_sales_usd: "8.00" }]],
      "2026-10-07": [[{ appid: 620, country_code: "US", gross_units_sold: 5, net_units_sold: 5, gross_sales_usd: "55.00", net_sales_usd: "50.00" }]],
      "2026-10-08": [[{ appid: 620, packageid: 7, platform: "linux", country_code: "US", gross_units_sold: 13, gross_units_returned: 1, net_units_sold: 12, gross_units_activated: 3, gross_sales_usd: "160.10", net_sales_usd: "150.05" }], [{ appid: 620, country_code: "DE", gross_units_sold: 2, net_units_sold: 2, gross_sales_usd: "22.00", net_sales_usd: "20.00" }]],
      "2026-10-09": [[{ appid: 620, country_code: "DE", gross_units_sold: 1, net_units_sold: 1, gross_sales_usd: "11.00", net_sales_usd: "10.00" }]],
    };
    const info = {
      app_info: [{ appid: 620, app_name: "Portal 2" }],
      package_info: [{ packageid: 7, package_name: "Portal 2 Package" }],
      country_info: [{ country_code: "US", country_name: "United States" }, { country_code: "DE", country_name: "Germany" }],
    };
    let inFlight = 0;
    let peak = 0;
    const routed = () =>
      vi.fn().mockImplementation(async (url: string) => {
        const q = new URL(url).searchParams;
        const day = rows[q.get("date")!] ?? [];
        const i = Number(q.get("highwatermark_id"));
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 2));
        inFlight--;
        // Page i holds day[i]; max_id stops advancing after the last page.
        return page(day[i] ?? [], String(Math.min(i + 1, day.length)), i === 0 ? info : {});
      });

    it.each(["country", "day", "app", "package", "platform"])("pins the full JSON grouped by %s", async (group_by) => {
      vi.stubGlobal("fetch", routed());
      const text = (await sales({ start_date: "2026-10-08", end_date: "2026-10-09", group_by, compare_previous: true })).content[0].text;
      expect(text).toMatchSnapshot();
    });

    it("pins the CSV", async () => {
      vi.stubGlobal("fetch", routed());
      const csv = (await sales({ start_date: "2026-10-08", end_date: "2026-10-09", format: "csv", compare_previous: true })).content[0].text;
      expect(csv).toMatchSnapshot();
    });

    it("fetches dates concurrently, at most 4 at a time", async () => {
      inFlight = 0;
      peak = 0;
      const fetchMock = routed();
      vi.stubGlobal("fetch", fetchMock);
      await sales({ start_date: "2026-10-01", end_date: "2026-10-09", compare_previous: true });
      expect(fetchMock).toHaveBeenCalled();
      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(4);
    });
  });

  describe("edge cases (#128)", () => {
    /** Answers each date from `byDate` in one page; dates in `endless` never stop paging. */
    function byDateFetch(byDate: Record<string, unknown[]>, extra: Record<string, unknown> = {}, endless: string[] = []) {
      let n = 0;
      return vi.fn(async (url: string) => {
        const day = new URL(url).searchParams.get("date")!;
        if (endless.includes(day)) return page([], String(++n));
        return page(byDate[day] ?? [], "0", extra);
      });
    }

    it("quotes CSV names with commas and quotes", async () => {
      vi.stubGlobal(
        "fetch",
        byDateFetch(
          { "2026-10-01": [{ country_code: "KR", net_units_sold: 2, net_sales_usd: "20.00" }, { country_code: "XQ", net_units_sold: 1, net_sales_usd: "5.00" }] },
          { country_info: [{ country_code: "KR", country_name: "Korea, Republic of" }, { country_code: "XQ", country_name: 'The "Q" Islands' }] },
        ),
      );
      const csv = (await sales({ start_date: "2026-10-01", format: "csv" })).content[0].text;
      expect(csv).toContain('"Korea, Republic of"');
      expect(csv).toContain('"The ""Q"" Islands"');
    });

    it("a day with no rows gives an empty CSV", async () => {
      vi.stubGlobal("fetch", byDateFetch({}));
      const result = await sales({ start_date: "2026-10-01", format: "csv" });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe("");
    });

    it("compares against a negative previous period with a positive delta", async () => {
      vi.stubGlobal(
        "fetch",
        byDateFetch({
          "2026-10-01": [{ country_code: "US", net_units_sold: -1, net_sales_usd: "-10.00" }],
          "2026-10-02": [{ country_code: "US", net_units_sold: 1, net_sales_usd: "5.00" }],
        }),
      );
      const body = JSON.parse((await sales({ start_date: "2026-10-02", compare_previous: true })).content[0].text);
      expect(body.totals).toMatchObject({ net_sales_usd: 5, previous_net_sales_usd: -10, delta_net_sales_usd: 15, delta_pct: 150 });
    });

    it("lists a previous-window date that hit the page cap in truncated_dates", async () => {
      vi.stubGlobal("fetch", byDateFetch({}, {}, ["2026-10-01"]));
      const body = JSON.parse((await sales({ start_date: "2026-10-02", compare_previous: true })).content[0].text);
      expect(body.truncated_dates).toEqual(["2026-10-01"]);
    });

    it("appid filters both windows, and group_by app takes the app name", async () => {
      const rows = (n: number) => [
        { appid: 620, net_units_sold: n, net_sales_usd: `${n * 10}.00` },
        { appid: 999, net_units_sold: 100, net_sales_usd: "1000.00" },
      ];
      vi.stubGlobal(
        "fetch",
        byDateFetch({ "2026-10-01": rows(1), "2026-10-02": rows(3) }, { app_info: [{ appid: 620, app_name: "Portal 2" }] }),
      );
      const body = JSON.parse(
        (await sales({ start_date: "2026-10-02", appid: 620, group_by: "app", compare_previous: true })).content[0].text,
      );
      expect(body.groups).toEqual([
        expect.objectContaining({ app: "620", name: "Portal 2", net_units_sold: 3, previous_net_units_sold: 1 }),
      ]);
      expect(body.totals).toMatchObject({ net_sales_usd: 30, previous_net_sales_usd: 10 });
    });
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

describe("steam_getSalesSummary date validation (#82)", () => {
  const schema = schemaOf(tools.get("steam_getSalesSummary")!);

  it.each(["2024-02-30", "2024-13-01", "2023-02-29", "2024-04-31", "2024-00-10"])(
    "rejects the impossible date %s",
    (d) => {
      for (const args of [{ start_date: d }, { start_date: "2024-01-01", end_date: d }]) {
        const parsed = schema.safeParse(args);
        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues[0].message).toBe("not a valid date");
      }
    },
  );

  it.each(["2024-02-29", "2026-12-31", "2026-01-01"])("accepts the real date %s", (d) => {
    expect(schema.safeParse({ start_date: d }).success).toBe(true);
  });
});
