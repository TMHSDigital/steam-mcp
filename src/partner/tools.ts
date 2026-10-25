import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResponse } from "../utils/steam-api.js";
import { refuseIfUnconfirmed, refusal } from "../utils/confirm.js";
import { STORE_ASSET_SLOTS, SLOT_FORM_FIELD } from "../storeAssets/slots.js";
import { validateStoreAsset } from "../storeAssets/validate.js";
import {
  parseCookieJar,
  cookieHeaderFor,
  redactCookies,
  type JarCookie,
} from "./cookieJar.js";
import { LIVE_WRITE, LOCAL_ONLY } from "../utils/annotations.js";

const UPLOAD_TIMEOUT_MS = 60_000;

export { refuseIfUnconfirmed };

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

export function registerPartnerLogin(server: McpServer): void {
  server.registerTool(
    "steam_partnerLogin",
    {
      title: "Partner Login",
      description:
        "Check Partner-admin session sources (cookie jar path or Chromium profile dir). Does not print cookie values. Requires STEAM_PARTNER_ADMIN=1.",
      inputSchema: {},
      annotations: LOCAL_ONLY,
    },
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
  server.registerTool(
    "steam_uploadStoreImage",
    {
      title: "Upload Store Image",
      description:
        "Upload a store or library image via Partner admin save. Default dry_run=true. Requires confirm=true to POST. Never publishes. Session cookies, not a Web API key.",
      inputSchema: uploadImageSchema,
      annotations: LIVE_WRITE,
    },
    async ({ storeItemId, slot, path, dry_run, confirm }) => {
      let jar: JarCookie[] = [];
      try {
        const dryRun = dry_run !== false;
        const blocked = refuseIfUnconfirmed(dryRun, confirm);
        if (blocked) return refusal(blocked);

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
            isError: true as const,
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

        jar = parseCookieJar(readFileSync(cookies, "utf8"));
        const cookieHeader = cookieHeaderFor(jar, new URL(url).hostname);
        const buf = readFileSync(path);
        const body = new FormData();
        body.append(formKey, new File([buf], basename(path)));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
        let response: Response;
        let text: string;
        try {
          response = await fetch(url, {
            method: "POST",
            headers: { Cookie: cookieHeader },
            body,
            redirect: "manual",
            signal: controller.signal,
          });
          text = await response.text();
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return errorResponse(new Error(`Partner upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s.`));
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }

        // An expired session redirects to /login. Without redirect: "manual",
        // fetch would follow it and the login page would come back as a 200.
        if (response.status >= 300 && response.status < 400) {
          return authError(
            `Partner session expired or invalid (HTTP ${response.status} redirect to ${response.headers.get("location") ?? "login"}). Log in again and re-export the cookie jar. Nothing was uploaded.`,
          );
        }

        let parsed: { success?: unknown } | undefined;
        try {
          parsed = JSON.parse(text) as { success?: unknown };
        } catch {
          parsed = undefined;
        }
        if (response.ok && parsed === undefined) {
          return authError(
            "Partner returned a non-JSON page, which usually means the session expired. Log in again and re-export the cookie jar.",
          );
        }

        const succeeded = response.ok && (parsed?.success === 1 || parsed?.success === true);
        const result = {
          ...payload,
          ok: succeeded,
          httpStatus: response.status,
          success: parsed?.success,
          bodyPreview: redactCookies(redact(text), jar).slice(0, 500),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          ...(succeeded ? {} : { isError: true as const }),
        };
      } catch (error) {
        return errorResponse(redactError(error, jar));
      }
    },
  );
}

const trailerSchema = {
  storeItemId: z.string().min(1).describe("Partner store item id"),
  path: z.string().min(1).describe("Local MP4 path"),
  dry_run: z
    .boolean()
    .optional()
    .describe("Must be true or omitted. Live trailer upload is not implemented."),
};

export function registerUploadTrailer(server: McpServer): void {
  server.registerTool(
    "steam_uploadTrailer",
    {
      title: "Plan Trailer Upload",
      description:
        "Plan a Partner trailer upload (dry run only). Checks the local MP4 and reports what an upload would send. Live upload (movieuploadbegincloud plus S3) is NOT implemented; dry_run=false returns [NOT_IMPLEMENTED]. Never publishes.",
      inputSchema: trailerSchema,
      annotations: LOCAL_ONLY,
    },
    async ({ storeItemId, path, dry_run }) => {
      if (dry_run === false) {
        return {
          content: [
            {
              type: "text" as const,
              text: "[NOT_IMPLEMENTED] Live trailer upload is not implemented in this build. Nothing was uploaded. Upload the trailer in the Steamworks Partner site.",
            },
          ],
          isError: true as const,
        };
      }

      if (!existsSync(path)) {
        return errorResponse(new Error(`Trailer file not found: ${path}`));
      }
      const bytes = statSync(path).size;

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
                publishes: false,
                note: "Plan only. Live trailer upload is not implemented; upload the trailer in the Steamworks Partner site.",
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
function redact(text: string): string {
  const name = "steamLogin" + "Secure";
  return text.replace(new RegExp(`${name}=[^;\\s"]+`, "gi"), `${name}=****`);
}

function redactError(error: unknown, jar: JarCookie[]): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(redactCookies(redact(message), jar));
}
