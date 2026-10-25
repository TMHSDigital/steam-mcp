import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamFetch } from "../../utils/steam-api.js";
import { RateLimitError } from "../../utils/errors.js";
import { register as registerOverview } from "../getPriceOverview.js";
import { register as registerRegional } from "../getRegionalPricing.js";

vi.mock("../../utils/steam-api.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../utils/steam-api.js")>(),
  steamFetch: vi.fn(),
}));

type ToolResult = { content: Array<{ type: string; text: string }> };
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

function handlerFor(register: (server: McpServer) => void): Handler {
  let handler: Handler | undefined;
  register({ tool(...args: unknown[]) { handler = args[args.length - 1] as Handler; } } as unknown as McpServer);
  if (!handler) throw new Error("Tool was not registered");
  return handler;
}

async function resultOf(register: (server: McpServer) => void, args: Record<string, unknown>) {
  return JSON.parse((await handlerFor(register)(args)).content[0].text);
}

const fetchMock = vi.mocked(steamFetch);
const noPrice = { price_overview: null, reason: "no_price_listed" };
const paid = { currency: "USD", initial: 1000, final: 500, discount_percent: 50 };

beforeEach(() => { fetchMock.mockReset(); });

describe("price availability", () => {
  it("does not infer free from price-only free, coming-soon or unavailable app responses", async () => {
    fetchMock.mockResolvedValue({
      "440": { success: true, data: [] },
      "1": { success: true, data: {} },
      "2": { success: false },
      "400": { success: true, data: { price_overview: paid } },
    });
    const result = await resultOf(registerOverview, { appids: [440, 1, 2, 400], cc: "US" });
    expect(result.prices[440]).toEqual(noPrice);
    expect(result.prices[1]).toEqual(noPrice);
    expect(result.prices[2].error).toBe("App not found or region-locked");
    expect(result.prices[400]).toEqual(paid);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports unknown regional prices, preserves paid prices and identifies region locks", async () => {
    fetchMock.mockImplementation(async (url) => {
      const cc = new URL(url).searchParams.get("cc");
      return { "440": cc === "GB" ? { success: false } : {
        success: true, data: cc === "DE" ? { price_overview: paid } : [],
      } };
    });
    const result = await resultOf(registerRegional, { appid: 440, countries: ["US", "DE", "GB"] });
    expect(result.regions.US).toEqual(noPrice);
    expect(result.regions.DE).toEqual(paid);
    expect(result.regions.GB.error).toBe("Not available in this region");
  });

  it("uses a real eurozone country in the default region list", async () => {
    fetchMock.mockResolvedValue({ "440": { success: true, data: [] } });
    await resultOf(registerRegional, { appid: 440 });
    const countries = fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get("cc"));
    expect(countries).toContain("DE");
    expect(countries).not.toContain("EU");
  });

  it("keeps typed fetch failures visible without losing other regions", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (new URL(url).searchParams.get("cc") === "US") throw new RateLimitError();
      return { "400": { success: true, data: { price_overview: paid } } };
    });
    const result = await resultOf(registerRegional, { appid: 400, countries: ["US", "DE"] });
    expect(result.regions.US.error_type).toBe("RateLimitError");
    expect(result.regions.US.error).toContain("rate limit");
    expect(result.regions.DE).toEqual(paid);
  });

  it("limits a twenty-country request to four simultaneous fetches", async () => {
    let active = 0;
    let peak = 0;
    fetchMock.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return { "440": { success: true, data: [] } };
    });
    const countries = ["US", "GB", "DE", "BR", "RU", "CN", "JP", "AU", "IN", "TR", "FR", "ES", "IT", "CA", "NZ", "MX", "PL", "NL", "SE", "NO"];
    const result = await resultOf(registerRegional, { appid: 440, countries });
    expect(peak).toBe(4);
    expect(active).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(Object.keys(result.regions).sort()).toEqual([...countries].sort());
  });
});
