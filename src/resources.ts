import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SLOT_SPECS, SLOT_FORM_FIELD } from "./storeAssets/slots.js";
import { QUERY_TYPES } from "./tools/queryWorkshop.js";
import { REVIEW_FILTERS, REVIEW_TYPES, PURCHASE_TYPES } from "./utils/reviews.js";
import { summarize, type AppData } from "./tools/getAppDetails.js";
import { steamFetch, steamStoreUrl } from "./utils/steam-api.js";

// Read-only reference data an agent (or user) can attach instead of guessing.

/** Common EResult values (steamclientpublic.h) seen from the Web API. */
export const ERESULTS: Record<number, string> = {
  1: "OK",
  2: "Fail: generic failure",
  3: "NoConnection",
  8: "InvalidParam: a parameter is wrong (id, name, or format)",
  9: "FileNotFound: the item, leaderboard, or file does not exist",
  10: "Busy: try again later",
  11: "InvalidState: the object is not in a state that allows this",
  15: "AccessDenied: the key or account lacks permission, or the data is private",
  16: "Timeout",
  17: "Banned",
  18: "AccountNotFound",
  19: "InvalidSteamID",
  20: "ServiceUnavailable: try again later",
  21: "NotLoggedOn",
  22: "Pending: the request is still processing",
  24: "InsufficientPrivilege",
  25: "LimitExceeded",
  26: "Revoked",
  27: "Expired",
  29: "DuplicateRequest: this requestid already ran",
  30: "AlreadyOwned",
  40: "Blocked",
  42: "NoMatch: nothing matched (for example an unknown vanity name)",
  44: "ServiceReadOnly",
  52: "Cancelled",
  55: "RemoteCallFailed",
  84: "RateLimitExceeded: slow down",
};

function json(uri: URL, data: unknown) {
  return {
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
  };
}

export function registerResources(server: McpServer): void {
  server.registerResource(
    "store-asset-specs",
    "steam://specs/store-assets",
    {
      title: "Steam store asset specs",
      description: "Pixel sizes, formats, and alpha rules for every slot steam_validateStoreAsset checks.",
      mimeType: "application/json",
    },
    (uri) =>
      json(
        uri,
        Object.fromEntries(
          Object.entries(SLOT_SPECS).map(([slot, spec]) => [
            slot,
            { ...spec, partnerUploadable: slot in SLOT_FORM_FIELD },
          ]),
        ),
      ),
  );

  server.registerResource(
    "eresult",
    "steam://enums/eresult",
    {
      title: "Steam EResult codes",
      description: "What common EResult numbers in Steam errors and X-eresult headers mean.",
      mimeType: "application/json",
    },
    (uri) => json(uri, ERESULTS),
  );

  server.registerResource(
    "ugc-query-type",
    "steam://enums/ugc-query-type",
    {
      title: "Workshop sort orders",
      description: "steam_queryWorkshop sort names and the EPublishedFileQueryType values they map to.",
      mimeType: "application/json",
    },
    (uri) => json(uri, QUERY_TYPES),
  );

  server.registerResource(
    "review-filters",
    "steam://enums/review-filters",
    {
      title: "Review filter values",
      description: "steam_getReviews filter, review_type, and purchase_type names and their GetAppReviews enum values.",
      mimeType: "application/json",
    },
    (uri) => json(uri, { filter: REVIEW_FILTERS, review_type: REVIEW_TYPES, purchase_type: PURCHASE_TYPES }),
  );

  server.registerResource(
    "app-summary",
    new ResourceTemplate("steam://app/{appid}/summary", { list: undefined }),
    {
      title: "Steam app summary",
      description: "Compact store summary for an app (the same as steam_getAppDetails' default output).",
      mimeType: "application/json",
    },
    async (uri, { appid }) => {
      const id = Number(appid);
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`Invalid appid in ${uri.href}`);
      }
      const data = (await steamFetch(steamStoreUrl("/api/appdetails", { appids: id }))) as Record<
        string,
        { success: boolean; data?: AppData }
      >;
      const entry = data[String(id)];
      if (!entry?.success || !entry.data) {
        throw new Error(`App ${id} is not available in the Steam store.`);
      }
      return json(uri, summarize(entry.data));
    },
  );
}
