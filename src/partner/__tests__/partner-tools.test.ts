import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { refuseIfUnconfirmed } from "../../utils/confirm.js";
import {
  registerPartnerLogin,
  registerUploadStoreImage,
  registerUploadTrailer,
} from "../../partner/tools.js";
import { SLOT_FORM_FIELD } from "../../storeAssets/slots.js";
import { encodePng } from "../../storeAssets/png.js";

// Temp dirs made by these tests, removed afterwards (#128).
const tempDirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("partner destructive gates", () => {
  it("allows dry_run without confirm", () => {
    expect(refuseIfUnconfirmed(true, undefined)).toBeNull();
    expect(refuseIfUnconfirmed(true, false)).toBeNull();
  });

  it("rejects live calls without confirm", () => {
    expect(refuseIfUnconfirmed(false, undefined)).toMatch(/confirm must be true/);
    expect(refuseIfUnconfirmed(false, false)).toMatch(/confirm must be true/);
  });

  it("allows live calls with confirm", () => {
    expect(refuseIfUnconfirmed(false, true)).toBeNull();
  });
});

describe("partner form fields", () => {
  it("maps libraryHero to library_hero|image", () => {
    expect(`${SLOT_FORM_FIELD.libraryHero}|image`).toBe("library_hero|image");
  });
});

describe("partner tool response contract", () => {
  type Handler = (args: Record<string, unknown>) => Promise<{
    content: Array<{ text: string }>;
    isError?: boolean;
  }>;

  function capture(register: (server: McpServer) => void): Handler {
    let handler: Handler | undefined;
    register({
      registerTool: (...args: unknown[]) => {
        handler = args[args.length - 1] as Handler;
      },
    } as unknown as McpServer);
    return handler!;
  }

  it("steam_uploadStoreImage refuses an unconfirmed live call with isError and [CONFIRM_REQUIRED]", async () => {
    const result = await capture(registerUploadStoreImage)({
      storeItemId: "1",
      slot: "libraryHero",
      path: "missing.png",
      dry_run: false,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^\[CONFIRM_REQUIRED\]/);
  });

  it("steam_uploadTrailer reports live upload as NOT_IMPLEMENTED with isError", async () => {
    const result = await capture(registerUploadTrailer)({
      storeItemId: "1",
      path: "trailer.mp4",
      dry_run: false,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^\[NOT_IMPLEMENTED\]/);
  });
});
// #114: real validation (not mocked), dry-run plan, cookie-jar refusal, and partnerLogin.
describe("steam_uploadStoreImage and steam_partnerLogin handlers", () => {
  type Handler = (args: Record<string, unknown>) => Promise<{
    content: Array<{ text: string }>;
    isError?: boolean;
  }>;

  function capture(register: (server: McpServer) => void): Handler {
    let handler: Handler | undefined;
    register({
      registerTool: (...args: unknown[]) => {
        handler = args[args.length - 1] as Handler;
      },
    } as unknown as McpServer);
    return handler!;
  }

  const dir = tempDir("steam-partner-");
  function png(name: string, w: number, h: number): string {
    const path = join(dir, name);
    writeFileSync(path, encodePng(w, h, new Uint8Array(w * h * 4).fill(40), false));
    return path;
  }
  const hero = png("hero.png", 3840, 1240);
  const tiny = png("tiny.png", 100, 100);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("a valid hero with no flags returns the dry-run plan without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await capture(registerUploadStoreImage)({ storeItemId: "1", slot: "libraryHero", path: hero });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      dry_run: true,
      formField: "library_hero|image",
      bytes: statSync(hero).size,
      publishes: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it("refuses an invalid image before a confirmed live upload", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await capture(registerUploadStoreImage)({
      storeItemId: "1",
      slot: "libraryHero",
      path: tiny,
      dry_run: false,
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).refused).toBe("validation failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["unset", ""],
    ["a missing file", join(dir, "no-such-jar.txt")],
  ])("refuses a live upload when STEAM_PARTNER_COOKIES is %s", async (_label, jar) => {
    vi.stubEnv("STEAM_PARTNER_COOKIES", jar);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await capture(registerUploadStoreImage)({
      storeItemId: "1",
      slot: "libraryHero",
      path: hero,
      dry_run: false,
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^\[AUTH_MISSING\]/);
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it("steam_partnerLogin asks for a session source when neither is set", async () => {
    vi.stubEnv("STEAM_PARTNER_COOKIES", "");
    vi.stubEnv("STEAM_PARTNER_PROFILE_DIR", "");
    const result = await capture(registerPartnerLogin)({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^\[AUTH_MISSING\]/);
  });

  it("steam_partnerLogin reports the sources without cookie values", async () => {
    const jar = join(dir, "jar.txt");
    writeFileSync(jar, ".steamgames.com\tTRUE\t/\tTRUE\t0\tsteamLoginSecure\tSECRET_COOKIE_VALUE\n");
    vi.stubEnv("STEAM_PARTNER_COOKIES", jar);
    vi.stubEnv("STEAM_PARTNER_PROFILE_DIR", dir);
    const result = await capture(registerPartnerLogin)({});
    expect(result.isError).toBeUndefined();
    const report = JSON.parse(result.content[0].text);
    expect(report).toMatchObject({ cookiesPathSet: true, cookiesPathExists: true, profileDirSet: true, profileDirExists: true });
    expect(result.content[0].text).not.toContain("SECRET_COOKIE_VALUE");
  });
});
