import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  refuseIfUnconfirmed,
  registerUploadStoreImage,
  registerUploadTrailer,
} from "../../partner/tools.js";
import { SLOT_FORM_FIELD } from "../../storeAssets/slots.js";

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