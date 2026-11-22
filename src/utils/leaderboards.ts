import { z } from "zod";
import { steamPartnerUrl, steamFetch } from "./steam-api.js";

export type LeaderboardInfo = Record<string, unknown> & {
  id?: number;
  name?: string;
  display_name?: string;
};

/** ISteamLeaderboards/GetLeaderboardsForGame (partner host, publisher key). */
export async function fetchLeaderboards(appid: number, key: string): Promise<LeaderboardInfo[]> {
  const url = steamPartnerUrl("/ISteamLeaderboards/GetLeaderboardsForGame/v2/", { key, appid });
  const data = (await steamFetch(url)) as { response?: { leaderboards?: LeaderboardInfo[] } };
  return data.response?.leaderboards ?? [];
}

/** How many existing names a "no leaderboard named X" error lists. */
const MAX_LISTED_NAMES = 50;

export const leaderboardNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .optional()
  .describe(
    "Leaderboard name (API name or display name) as listed by steam_getLeaderboardsForGame. Use instead of leaderboardid; it is resolved to the numeric ID.",
  );

/**
 * Exactly one of leaderboardid / leaderboard_name must be given. Returns an
 * error message, or null when the pair is valid.
 */
export function leaderboardSelectorError(
  leaderboardid: number | undefined,
  leaderboardName: string | undefined,
): string | null {
  if (leaderboardid !== undefined && leaderboardName !== undefined) {
    return "Pass either leaderboardid or leaderboard_name, not both.";
  }
  if (leaderboardid === undefined && leaderboardName === undefined) {
    return "Pass leaderboardid (numeric) or leaderboard_name.";
  }
  return null;
}

/**
 * Resolve a leaderboard name to its numeric ID. An exact match on `name` or
 * `display_name` wins; otherwise a single case-insensitive match is used.
 * Throws with the list of existing names when nothing (or more than one board)
 * matches.
 */
export async function resolveLeaderboardName(
  appid: number,
  name: string,
  key: string,
): Promise<{ leaderboardid: number; resolved_from: string }> {
  const boards = (await fetchLeaderboards(appid, key)).filter(
    (b): b is LeaderboardInfo & { id: number } => typeof b.id === "number",
  );
  const exact = boards.filter((b) => b.name === name || b.display_name === name);
  const lower = name.toLowerCase();
  const matches = exact.length
    ? exact
    : boards.filter(
        (b) => b.name?.toLowerCase() === lower || b.display_name?.toLowerCase() === lower,
      );

  if (matches.length === 1) {
    return { leaderboardid: matches[0].id, resolved_from: name };
  }

  const names = boards.map((b) => b.name ?? b.display_name).filter(Boolean);
  if (matches.length > 1) {
    const ids = matches.map((b) => `${b.name ?? b.display_name} (${b.id})`).join(", ");
    throw new Error(
      `More than one leaderboard for app ${appid} matches "${name}": ${ids}. Pass the leaderboardid instead.`,
    );
  }
  const shown = names.slice(0, MAX_LISTED_NAMES).join(", ");
  const more = names.length > MAX_LISTED_NAMES ? ` (and ${names.length - MAX_LISTED_NAMES} more)` : "";
  throw new Error(
    names.length
      ? `No leaderboard named "${name}" for app ${appid}. Leaderboards: ${shown}${more}.`
      : `No leaderboard named "${name}" for app ${appid}. The app has no leaderboards configured.`,
  );
}
