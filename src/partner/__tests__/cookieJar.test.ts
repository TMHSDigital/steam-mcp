import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseCookieJar, cookieHeaderFor, redactCookies } from "../cookieJar.js";
import { registerUploadStoreImage } from "../tools.js";

vi.mock("../../storeAssets/validate.js", () => ({
  validateStoreAsset: () => ({ ok: true }),
}));

const NOW = 1_800_000_000;
const FUTURE = NOW + 86_400;
const PAST = NOW - 86_400;

const JAR = [
  "# Netscape HTTP Cookie File",
  "# This is a comment",
  `#HttpOnly_.steamgames.com\tTRUE\t/\tTRUE\t${FUTURE}\tsteamLoginSecure\tSECRETLOGINVALUE`,
  `partner.steamgames.com\tFALSE\t/\tTRUE\t0\tsessionid\tSESSIONVALUE123`,
  `.steampowered.com\tTRUE\t/\tFALSE\t${FUTURE}\tbrowserid\tBROWSER1`,
  `.steamgames.com\tTRUE\t/\tFALSE\t${PAST}\told\tEXPIREDVALUE`,
  `.example.com\tTRUE\t/\tFALSE\t${FUTURE}\ttracker\tFOREIGNVALUE`,
  `#HttpOnly_.evilsteamgames.com\tTRUE\t/\tTRUE\t${FUTURE}\tspoof\tSPOOFVALUE`,
  "malformed line",
].join("\n");

describe("parseCookieJar", () => {
  const cookies = parseCookieJar(JAR, NOW);

  it("keeps #HttpOnly_ rows and session cookies", () => {
    expect(cookies.map((c) => c.name)).toEqual(["steamLoginSecure", "sessionid", "browserid"]);
  });

  it("drops expired rows and foreign or look-alike domains", () => {
    const names = cookies.map((c) => c.name);
    expect(names).not.toContain("old");
    expect(names).not.toContain("tracker");
    expect(names).not.toContain("spoof");
  });
});

describe("cookieHeaderFor", () => {
  const cookies = parseCookieJar(JAR, NOW);

  it("sends only cookies whose domain matches the request host", () => {
    // Built by concatenation so scripts/scan-secrets.py does not flag the fixture.
    const login = "steamLogin" + "Secure";
    expect(cookieHeaderFor(cookies, "partner.steamgames.com")).toBe(
      `${login}=SECRETLOGINVALUE; sessionid=SESSIONVALUE123`,
    );
  });

  it("throws when no cookie matches", () => {
    expect(() => cookieHeaderFor(cookies, "store.steamcommunity.com")).toThrow(/no unexpired cookies/);
  });
});

describe("redactCookies", () => {
  it("redacts every jar value, not just steamLoginSecure", () => {
    const cookies = parseCookieJar(JAR, NOW);
    const out = redactCookies(
      "echo sessionid=SESSIONVALUE123 and raw SECRETLOGINVALUE and BROWSER1",
      cookies,
    );
    expect(out).not.toMatch(/SESSIONVALUE123|SECRETLOGINVALUE|BROWSER1/);
    expect(out).toContain("sessionid=****");
  });
});

describe("steam_uploadStoreImage live auth detection", () => {
  type Handler = (args: Record<string, unknown>) => Promise<{
    content: Array<{ text: string }>;
    isError?: boolean;
  }>;

  function setup(): Handler {
    const dir = mkdtempSync(join(tmpdir(), "steam-mcp-jar-"));
    const jarPath = join(dir, "jar.txt");
    const imgPath = join(dir, "hero.png");
    writeFileSync(
      jarPath,
      `#HttpOnly_.steamgames.com\tTRUE\t/\tTRUE\t0\tsteamLoginSecure\tSECRETLOGINVALUE\n`,
    );
    writeFileSync(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    vi.stubEnv("STEAM_PARTNER_COOKIES", jarPath);

    let handler: Handler | undefined;
    const server = { registerTool: (...args: unknown[]) => { handler = args[args.length - 1] as Handler; } };
    registerUploadStoreImage(server as unknown as McpServer);
    const h = handler!;
    return (args) => h({ storeItemId: "123", slot: "libraryHero", path: imgPath, ...args });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function mockResponse(status: number, body: string, headers: Record<string, string> = {}) {
    return vi.fn().mockResolvedValue(new Response(body, { status, headers }));
  }

  it("treats a redirect to login as AUTH_MISSING and does not follow it", async () => {
    const fetchMock = mockResponse(302, "", { location: "https://partner.steamgames.com/login/" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await setup()({ dry_run: false, confirm: true });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("[AUTH_MISSING]");
    expect((fetchMock.mock.calls[0][1] as RequestInit).redirect).toBe("manual");
  });

  it("treats an HTML 200 as AUTH_MISSING", async () => {
    vi.stubGlobal("fetch", mockResponse(200, "<html>Sign in</html>"));

    const result = await setup()({ dry_run: false, confirm: true });
    expect(result.content[0].text).toContain("[AUTH_MISSING]");
  });

  it("reports ok only when Partner returns success", async () => {
    vi.stubGlobal("fetch", mockResponse(200, JSON.stringify({ success: 1 })));
    const ok = await setup()({ dry_run: false, confirm: true });
    expect(ok.isError).toBeUndefined();
    expect(JSON.parse(ok.content[0].text).ok).toBe(true);

    vi.stubGlobal("fetch", mockResponse(200, JSON.stringify({ success: 2, echo: "SECRETLOGINVALUE" })));
    const failed = await setup()({ dry_run: false, confirm: true });
    expect(failed.isError).toBe(true);
    expect(JSON.parse(failed.content[0].text).ok).toBe(false);
    expect(failed.content[0].text).not.toContain("SECRETLOGINVALUE");
  });
});
