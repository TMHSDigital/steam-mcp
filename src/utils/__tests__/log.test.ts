import { describe, it, expect, vi, afterEach } from "vitest";
import { steamFetch } from "../steam-api.js";
import { describeUrl, debug, setMcpLogSink } from "../log.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setMcpLogSink(undefined);
});

function captureStderr(): string[] {
  const lines: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  return lines;
}

describe("debug logging", () => {
  it("is silent unless STEAM_MCP_DEBUG is set", async () => {
    const lines = captureStderr();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await steamFetch("https://api.steampowered.com/x/v1/?appid=1");
    expect(lines).toEqual([]);
  });

  it("logs method, host, path, query keys, status, attempt, and latency without the key value", async () => {
    vi.stubEnv("STEAM_MCP_DEBUG", "1");
    const lines = captureStderr();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

    await steamFetch("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=SUPERSECRETKEY&steamids=1");

    const log = lines.join("");
    expect(log).toMatch(
      /GET api\.steampowered\.com\/ISteamUser\/GetPlayerSummaries\/v2\/ \?key,steamids -> 200 in \d+ms \(attempt 1\)/,
    );
    expect(log).not.toContain("SUPERSECRETKEY");
  });

  it("logs retries and forwards lines to the MCP sink", async () => {
    vi.stubEnv("STEAM_MCP_DEBUG", "true");
    const lines = captureStderr();
    const sink = vi.fn();
    setMcpLogSink(sink);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "0" } }))
        .mockResolvedValueOnce(new Response("{}")),
    );

    await steamFetch("https://store.steampowered.com/api/appdetails?appids=440");

    const log = lines.join("");
    expect(log).toContain("-> 429");
    expect(log).toContain("rate limited, retrying");
    expect(log).toContain("(attempt 2)");
    expect(sink).toHaveBeenCalled();
  });

  it("describeUrl drops every query value", () => {
    expect(describeUrl("https://partner.steam-api.com/a/b/?key=K&appid=480")).toBe(
      "partner.steam-api.com/a/b/ ?key,appid",
    );
  });

  it("a throwing sink never breaks the caller", () => {
    vi.stubEnv("STEAM_MCP_DEBUG", "1");
    captureStderr();
    setMcpLogSink(() => {
      throw new Error("boom");
    });
    expect(() => debug("x")).not.toThrow();
  });
});
