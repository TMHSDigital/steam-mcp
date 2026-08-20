import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/steam-api.js";
import { STORE_ASSET_SLOTS, SLOT_FORM_FIELD } from "../storeAssets/slots.js";
import { validateStoreAsset } from "../storeAssets/validate.js";

function cookiePath(): string | undefined {
  const raw = process.env.STEAM_PARTNER_COOKIES?.trim();
  return raw ? raw : undefined;
}

function profileDir(): string | undefined {
  const raw = process.env.STEAM_PARTNER_PROFILE_DIR?.trim();
  return raw ? raw : undefined;
}

function authError(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: "text", text: `[AUTH_MISSING] ${message}` }],
    isError: true,
  };
}

export function refuseIfUnconfirmed(dryRun: boolean, confirm: boolean | undefined): string | null {
  if (!dryRun && confirm !== true) {
    return "confirm must be true when dry_run is false. No request was sent.";
  }
  return null;
}

export function registerPartnerLogin(server: McpServer): void {
  server.tool(
    "steam_partnerLogin",
    "Check Partner-admin session sources (cookie jar path or Chromium profile dir). Does not print cookie values. Requires STEAM_PARTNER_ADMIN=1.",
    {},
    async () => {
      const cookies = cookiePath();
      const profile = profileDir();
      if (!cookies && !profile) {
        return authError(
          "Set STEAM_PARTNER_COOKIES to a cookie-jar path or STEAM_PARTNER_PROFILE_DIR to a Chromium user-data dir outside the repo.",
        );
      }
      const report: Record<string, unknown> = {
        cookiesPathSet: Boolean(cookies),
        cookiesPathExists: cookies ? existsSync(cookies) : false,
        profileDirSet: Boolean(profile),
        profileDirExists: profile ? existsSync(profile) : false,
        note: "Session cookies expire and trip Steam Guard. Never commit the jar or profile. Default profile location is %LOCALAPPDATA%/steam-mcp/partner-profile (Windows) or ~/.local/share/steam-mcp/partner-profile.",
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
      };
    },
  );
}

const uploadImageSchema = {
  storeItemId: z.string().min(1).describe("Partner store item id (not a public appid)"),
  slot: z.enum(STORE_ASSET_SLOTS).describe("Asset slot to upload"),
  path: z.string().min(1).describe("Local PNG or JPEG path"),
  dry_run: z
    .boolean()
    .optional()
    .describe("If true (default), return the planned POST without contacting Steam"),
  confirm: z
    .boolean()
    .optional()
    .describe("Required true when dry_run is false. Refuses otherwise."),
};

export function registerUploadStoreImage(server: McpServer): void {
  server.tool(
    "steam_uploadStoreImage",
    "Upload a store or library image via Partner admin save. Default dry_run=true. Requires confirm=true to POST. Never publishes. Session cookies, not a Web API key.",
    uploadImageSchema,
    async ({ storeItemId, slot, path, dry_run, confirm }) => {
      try {
        const dryRun = dry_run !== false;
        const blocked = refuseIfUnconfirmed(dryRun, confirm);
        if (blocked) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: blocked }, null, 2) }],
          };
        }

        const validation = validateStoreAsset(path, slot);
        if (!validation.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { ok: false, refused: "validation failed", validation },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        let bytes = 0;
        try {
          bytes = statSync(path).size;
        } catch (error) {
          return errorResponse(error);
        }

        const field = SLOT_FORM_FIELD[slot];
        const formKey = `${field}|image`;
        const url = `https://partner.steamgames.com/admin/game/save/${encodeURIComponent(storeItemId)}?json=1`;
        const payload = {
          ok: true,
          dry_run: dryRun,
          method: "POST",
          url,
          storeItemId,
          slot,
          path,
          bytes,
          formField: formKey,
          publishes: false,
          note: "Unofficial Partner-admin FormData. Valve can change field names. This tool never calls Publish.",
        };

        if (dryRun) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
          };
        }

        const cookies = cookiePath();
        if (!cookies || !existsSync(cookies)) {
          return authError(
            "STEAM_PARTNER_COOKIES must point to a readable cookie jar for a live POST.",
          );
        }

        const cookieHeader = loadCookieHeader(cookies);
        const buf = readFileSync(path);
        const body = new FormData();
        body.append(formKey, new File([buf], basename(path)));

        const response = await fetch(url, {
          method: "POST",
          headers: { Cookie: cookieHeader },
          body,
        });

        const text = await response.text();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ...payload,
                  httpStatus: response.status,
                  bodyPreview: redact(text).slice(0, 500),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return errorResponse(redactError(error));
      }
    },
  );
}

const trailerSchema = {
  storeItemId: z.string().min(1).describe("Partner store item id"),
  path: z.string().min(1).describe("Local MP4 path"),
  dry_run: z.boolean().optional().describe("If true (default), do not upload"),
  confirm: z.boolean().optional().describe("Required true when dry_run is false"),
};

export function registerUploadTrailer(server: McpServer): void {
  server.tool(
    "steam_uploadTrailer",
    "Plan or run a Partner trailer upload (movieuploadbegincloud plus S3). Default dry_run=true. Requires confirm=true to upload. Playwright is an optional local dep, not part of @tmhs/steam-mcp. Never publishes.",
    trailerSchema,
    async ({ storeItemId, path, dry_run, confirm }) => {
      const dryRun = dry_run !== false;
      const blocked = refuseIfUnconfirmed(dryRun, confirm);
      if (blocked) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: blocked }, null, 2) }],
        };
      }

      if (!existsSync(path)) {
        return errorResponse(new Error(`Trailer file not found: ${path}`));
      }
      const bytes = statSync(path).size;

      if (dryRun) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  dry_run: true,
                  storeItemId,
                  path,
                  bytes,
                  requiresPlaywright: true,
                  publishes: false,
                  note: "Live trailer upload needs Playwright in this working tree (not shipped on npm). Install locally if you intend to set dry_run=false.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ok: false,
                error:
                  "Live movieuploadbegincloud plus S3 is not wired in this build. Re-run with dry_run=true or complete the Playwright flow locally. Do not add Playwright to the published package.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}

function loadCookieHeader(jarPath: string): string {
  const raw = readFileSync(jarPath, "utf8");
  const headerParts: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) {
      continue;
    }
    const cols = line.split("\t");
    if (cols.length >= 7) {
      headerParts.push(`${cols[5]}=${cols[6]}`);
    }
  }
  if (headerParts.length === 0) {
    throw new Error("Cookie jar has no Netscape cookie rows.");
  }
  return headerParts.join("; ");
}

function redact(text: string): string {
  return text.replace(/steamLoginSecure=[^;\s"]+/gi, "steamLoginSecure=****");
}

function redactError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(redact(message));
}
