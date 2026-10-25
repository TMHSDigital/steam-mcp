import { z } from "zod";
import { steamApiUrl, steamFetch, requireApiKey } from "./steam-api.js";

// Read tools accept any common way to name a Steam account. Write tools keep
// requiring a literal Steam64 ID so a resolution mistake cannot redirect a
// live mutation.

const STEAM64_BASE = 76561197960265728n;

export const steamIdInput = z
  .string()
  .trim()
  .min(1)
  .describe(
    "The player: a 17-digit Steam64 ID, a profile URL (steamcommunity.com/profiles/... or /id/...), a vanity name, or a SteamID2/SteamID3 (STEAM_0:1:123, [U:1:246])",
  );

export interface ResolvedSteamId {
  steamid: string;
  /** Set when the input was not already a Steam64 ID. */
  resolved_from?: string;
}

/** Steam64 for inputs that need no network call, or the vanity name to look up. */
export function parseSteamId(input: string): { steamid: string } | { vanity: string } {
  const s = input.trim();

  if (/^\d{17}$/.test(s)) return { steamid: s };

  const profiles = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profiles) return { steamid: profiles[1] };

  const id2 = s.match(/^STEAM_[0-5]:([01]):(\d+)$/i);
  if (id2) {
    return { steamid: (STEAM64_BASE + BigInt(id2[2]) * 2n + BigInt(id2[1])).toString() };
  }

  const id3 = s.match(/^\[?U:1:(\d+)\]?$/i);
  if (id3) return { steamid: (STEAM64_BASE + BigInt(id3[1])).toString() };

  const vanityUrl = s.match(/steamcommunity\.com\/id\/([^/?#\s]+)/i);
  const vanity = vanityUrl ? vanityUrl[1] : s;
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(vanity)) {
    throw new Error(
      `"${input}" is not a Steam64 ID, profile URL, SteamID2/3, or vanity name.`,
    );
  }
  return { vanity };
}

export async function resolveSteamId(input: string): Promise<ResolvedSteamId> {
  const parsed = parseSteamId(input);
  if ("steamid" in parsed) {
    return parsed.steamid === input.trim()
      ? { steamid: parsed.steamid }
      : { steamid: parsed.steamid, resolved_from: input.trim() };
  }

  const url = steamApiUrl("/ISteamUser/ResolveVanityURL/v1/", {
    key: requireApiKey(),
    vanityurl: parsed.vanity,
    url_type: 1,
  });
  const data = (await steamFetch(url)) as {
    response?: { success?: number; steamid?: string };
  };
  if (data.response?.success !== 1 || !data.response.steamid) {
    throw new Error(`No Steam profile has the vanity name "${parsed.vanity}".`);
  }
  return { steamid: data.response.steamid, resolved_from: input.trim() };
}
