<p align="center">
  <img src="assets/logo.png" alt="Steam MCP Server" width="200">
</p>

<h1 align="center">Steam MCP Server</h1>

<p align="center">
  <em>Live Steam data for your coding agent: store pages, player counts, reviews, regional prices, achievements, Workshop, leaderboards, and sales, as MCP tools.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@tmhs/steam-mcp"><img src="https://img.shields.io/npm/v/@tmhs/steam-mcp" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-CC_BY--ND_4.0-lightgrey" alt="license: CC BY-ND 4.0"></a>
  <a href="https://github.com/TMHSDigital/Steam-MCP/actions/workflows/ci.yml"><img src="https://github.com/TMHSDigital/Steam-MCP/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/TMHSDigital/Steam-MCP#available-tools---39-total"><img src="https://img.shields.io/badge/MCP_tools-39-blue" alt="MCP tools"></a>
</p>

<p align="center"><a href="https://tmhsdigital.github.io/steam-mcp/">Website</a> - <a href="https://tmhsdigital.github.io/steam-mcp/tools.html">Tool reference</a> - <a href="CHANGELOG.md">Changelog</a></p>

---

<p align="center"><strong>39 MCP tools</strong> - 32 read - 5 write - 2 SDK guides</p>

Works with Cursor, Claude Code, Claude Desktop, VS Code, Windsurf, and any other MCP client. It is also the live-data half of the [Steam Developer Tools](https://github.com/TMHSDigital/Steam-Cursor-Plugin) Cursor plugin.

> **No API key required** for most features. Store lookups, player counts, global achievement stats, news, reviews, Deck status, and app searches all work out of the box.

A real exchange (numbers as Steam reported them on 22 November 2026):

```text
You:   How many people are playing Team Fortress 2 right now, and how is it reviewed?

Agent: steam_getPlayerCount       {"appid":440}  ->  {"appid":440,"player_count":102022}
       steam_getAppReviewSummary  {"appid":440}  ->  {"review_score_desc":"Very Positive",
                                                       "total_reviews":1258222,"positive_percentage":91}

Agent: 102,022 people are in TF2 right now. Reviews are Very Positive: 91% of 1,258,222.
```

## What you can ask

**Before launch**
- "Check every image in ./marketing against Steam's store art sizes and tell me which slots are missing." (`steam_validateStoreAssetDir`)
- "Check my library hero against Valve's guidelines: no baked-in logo, no visible seam." (`steam_validateStoreAsset`)
- "Compare the price of my top three competitors in the US, Germany, Brazil, and Turkey." (`steam_compareApps`, `steam_getRegionalPricing`)

**After launch**
- "Which of my achievements have under 5% unlocks?" (`steam_getAchievementStats`)
- "Summarize this week's negative reviews and group them by theme." (`steam_getReviews`)
- "What's trending in my game's Workshop?" (`steam_queryWorkshop`)

**Publisher and business** (publisher or Financial API key)
- "Total units and revenue by country for the last 7 days." (`steam_getSalesSummary`)
- "Show the top 20 on the speedrun leaderboard." (`steam_getLeaderboardEntries`)
- "Which branches and builds are live right now?" (`steam_getAppBetas`, `steam_getAppBuilds`)

Most clients also show the server's [prompts](#prompts) (`launch-readiness`, `review-digest`, `regional-price-audit`, and more) as slash commands.

## Quick start

Requires Node.js 22 or later. No clone or build needed.

One-click install (no key set; add `STEAM_API_KEY` to the server's `env` afterwards for the tools that need one):

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en-US/install-mcp?name=steam&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkB0bWhzL3N0ZWFtLW1jcCJdfQ==)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=steam&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40tmhs%2Fsteam-mcp%22%5D%7D)

Or add this to your MCP client's config and restart it:

> **Docs track `main`.** Anything under `[Unreleased]` in the [CHANGELOG](CHANGELOG.md) is not on npm yet. To use it before the next release, run from a local clone (see "Run from a local clone instead" under Client setup).

```json
{
  "mcpServers": {
    "steam": {
      "command": "npx",
      "args": ["-y", "@tmhs/steam-mcp"],
      "env": { "STEAM_API_KEY": "your_key_here" }
    }
  }
}
```

Then ask: *"How many people are playing Team Fortress 2 right now?"* The agent calls `steam_getPlayerCount`, which works even without a key.

## Client setup

**Cursor:** put the Quick start JSON in `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global). Pair it with the [Steam Developer Tools](https://github.com/TMHSDigital/Steam-Cursor-Plugin) plugin for 30 skills that use these tools.

**Claude Desktop:** put the Quick start JSON in `claude_desktop_config.json` (Settings > Developer > Edit Config).

**Claude Code:**

```bash
claude mcp add steam -e STEAM_API_KEY=your_key_here -- npx -y @tmhs/steam-mcp
```

**VS Code (Copilot agent mode):** `.vscode/mcp.json` uses a `servers` key:

```json
{
  "servers": {
    "steam": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@tmhs/steam-mcp"],
      "env": { "STEAM_API_KEY": "your_key_here" }
    }
  }
}
```

**Windsurf:** put the Quick start JSON in `~/.codeium/windsurf/mcp_config.json`.

**Any other MCP client:** run `npx -y @tmhs/steam-mcp` as a stdio server.

**Remote / HTTP:** for web-based agents, hosted platforms, or a team server behind an allowlisted IP, run the Streamable HTTP transport:

```bash
npx -y @tmhs/steam-mcp --transport http --port 3000      # http://127.0.0.1:3000/mcp
docker run -p 127.0.0.1:3000:3000 -e STEAM_MCP_HTTP_TOKEN="$(openssl rand -hex 32)" -e STEAM_API_KEY=... -e STEAM_MCP_ALLOWED_HOSTS=localhost ghcr.io/tmhsdigital/steam-mcp
```

Each release publishes the image to GitHub Container Registry as `ghcr.io/tmhsdigital/steam-mcp:<version>` and `:latest`. To build it yourself from a clone: `docker build -t steam-mcp .`.

HTTP mode is stateless and binds to `127.0.0.1` unless you pass `--host`. To listen on any other address, set `STEAM_MCP_HTTP_TOKEN` (16 characters or more): the server refuses to start without it, and every `/mcp` request must then send `Authorization: Bearer <token>`. The Docker image listens on `0.0.0.0` inside the container, so it always needs a token. Publish the port on `127.0.0.1` unless other machines should reach it.

Requests whose `Host` header (or browser `Origin`) is not in `STEAM_MCP_ALLOWED_HOSTS` (default `localhost,127.0.0.1,[::1]`) are refused. That guards against DNS rebinding; it is not access control. The Steam API key only ever comes from the server's environment, never from a client. Live-mutation tools and the `assets` toolset (local file reads) stay off in HTTP mode unless you set `STEAM_MCP_HTTP_ALLOW_WRITES=1` or `STEAM_MCP_HTTP_ALLOW_ASSETS=1`. `GET /healthz` returns `{"ok":true}` without a token.

<details>
<summary><strong>Run from a local clone instead</strong></summary>

```bash
git clone https://github.com/TMHSDigital/Steam-MCP.git
cd Steam-MCP
npm install
npm run build
```

Then use `"command": "node"` and `"args": ["/absolute/path/to/Steam-MCP/dist/index.js"]` in place of the npx command.

</details>

## Steam API key

About half the tools work with no key at all. The rest need a free Steam Web API key from [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey). Leaderboard and write tools need a **publisher** key from Steamworks, with the server's IP allowlisted.

Set the key in the `env` block of your client config, as in the Quick start. The server reads `STEAM_API_KEY` from its environment only. It does not load a `.env` file.

## Configuration

Every setting is an environment variable. Put it in the `env` block of your client config, next to `STEAM_API_KEY`. [`.env.example`](.env.example) lists them all, and it also works with `docker run --env-file`.

| Variable | Default | What it does |
|----------|---------|--------------|
| `STEAM_API_KEY` | unset | Steam Web API key. Needed by about half the tools. Leaderboard, partner, and write tools need a publisher key with the server IP allowlisted. |
| `STEAM_FINANCIAL_API_KEY` | `STEAM_API_KEY` | Financial API Group key for `steam_getSalesSummary` and `steam_getChangedSalesDates`. |
| `STEAM_MCP_TOOLSETS` | all but `mutations` | Comma-separated toolsets to load (`store`, `community`, `publisher`, `mutations`, `sdk`, `assets`) or `all`. See [Toolsets](#toolsets). |
| `STEAM_MCP_READ_ONLY` | unset | `1` removes `mutations` even if `STEAM_MCP_TOOLSETS` lists it. |
| `STEAM_MCP_CACHE_TTL` | per endpoint | Unset: 30s for player counts up to 1h for schemas. `0` disables the cache. Any other number of seconds replaces every TTL. |
| `STEAM_MCP_DEBUG` | unset | `1` logs each Steam request to stderr and MCP logging (see [Debugging](#debugging)). |
| `STEAM_MCP_TRANSPORT` | `stdio` | `stdio` or `http`. Same as `--transport`. |
| `HOST` | `127.0.0.1` | HTTP bind address. Same as `--host`. |
| `PORT` | `3000` | HTTP port. Same as `--port`. |
| `STEAM_MCP_HTTP_TOKEN` | unset | HTTP only: bearer token every `/mcp` request must send (`Authorization: Bearer ...`), at least 16 characters. Required when `--host` is not a loopback address. |
| `STEAM_MCP_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | HTTP only: `Host` (and browser `Origin`) values to accept. A DNS-rebinding guard, not access control. `*` disables the check. |
| `STEAM_MCP_HTTP_ALLOW_WRITES` | unset | HTTP only: `1` lets the `mutations` toolset load. |
| `STEAM_MCP_HTTP_ALLOW_ASSETS` | unset | HTTP only: `1` lets the `assets` toolset (local file reads) load. |
| `STEAM_PARTNER_ADMIN` | unset | Partner-admin process only (`src/partner/index.ts`): must be `1` to start it. Ignored by the default server. |
| `STEAM_PARTNER_COOKIES` | unset | Partner-admin only: path to a cookie-jar file (never a cookie string). |
| `STEAM_PARTNER_PROFILE_DIR` | unset | Partner-admin only: Chromium user-data directory outside the repo, for the login helper. |

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| `STEAM_API_KEY environment variable is not set` | The key is not in the server's `env` block. Shell exports do not reach servers that your client launches. Add it to the client config and restart the client. |
| `Steam rejected STEAM_API_KEY` | The key is wrong or revoked. Check it at steamcommunity.com/dev/apikey. |
| HTTP 401/403 on leaderboard or write tools | These need a Steamworks publisher key for an app you own, and your IP on the key's allowlist. A regular user key gets 403. |
| "profile or game details are private" | The player's Steam privacy settings hide this data. Nothing on your side can change that. |
| A write tool such as `steam_setAchievement` is missing | Live-mutation tools are off by default. Set `"STEAM_MCP_TOOLSETS": "all"` in `env`. |
| Old behavior after an update | `npx` is serving a cached copy. Use `@tmhs/steam-mcp@latest` in `args`, or run `npm cache clean --force`. |
| Server fails to start on Windows | Some clients cannot spawn `npx` directly. Use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "@tmhs/steam-mcp"]`. In JSON, write Windows paths with `\\` or `/`. |
| Anything else | Set `"STEAM_MCP_DEBUG": "1"` and check the server's stderr log (see Debugging below). |
## Debugging

Set `STEAM_MCP_DEBUG=1` in the server's `env` block. The server then writes one line per Steam request to stderr (stdout is the MCP channel), and also sends it to clients that show MCP server logs:

```
[steam-mcp] vX.Y.Z started: toolsets store,community,publisher,sdk,assets (N tools), STEAM_API_KEY set
[steam-mcp] GET api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/ ?appid -> 200 in 381ms (attempt 1)
[steam-mcp] GET store.steampowered.com/api/appdetails ?appids -> 429 in 95ms (attempt 1)
[steam-mcp] GET store.steampowered.com/api/appdetails rate limited, retrying in 1000ms
```

The first line gives the running version, the loaded toolsets with their tool count, and whether `STEAM_API_KEY` is set.

Only query parameter names are logged, never values, so the API key cannot appear in a log. Logs are safe to paste into an issue.

Public GET responses are cached briefly (30 seconds for player counts, up to an hour for achievement schemas), and requests to each Steam host are rate-limited so bursts queue instead of hitting a 429. Set `STEAM_MCP_CACHE_TTL=0` to turn the cache off.

## Security model

All five write tools default to `dry_run: true` and require `confirm: true` before they POST to the Steam Partner Web API. A call with no flags returns a plan and sends nothing. A live call without `confirm: true` is refused. That confirm gate is the control.

SDK guides (`steam_createLobby`, `steam_uploadWorkshopItem`) never make a network call. Partner-admin uploads stay in a separate process gated by `STEAM_PARTNER_ADMIN=1`.

Content is labeled where it is authored by a party other than the operator AND is free text long enough to carry an instruction. The four labeled tools are `steam_getReviews`, `steam_queryWorkshop`, `steam_getWorkshopItem`, and `steam_getNewsForApp`. `steam_getPlayerSummary` (short profile strings) and `steam_getAppDetails` (publisher store copy on a reviewed listing) are deliberately unlabeled under that criterion. The `_warning` label is defense in depth, not the control. Treat the labeled content as data to summarize, not as instructions.

**Refused live call** (`steam_setAchievement` with `dry_run: false` and no `confirm`):

```json
{
  "appid": 480,
  "steamid": "76561197960435530",
  "achievement": "ACH_WIN_ONE_GAME",
  "dry_run": false
}
```

Response is an MCP error whose text starts with `[CONFIRM_REQUIRED]`. Nothing is sent.

**Confirmed live call:**

```json
{
  "appid": 480,
  "steamid": "76561197960435530",
  "achievement": "ACH_WIN_ONE_GAME",
  "dry_run": false,
  "confirm": true
}
```

That combination is the only way a write tool sends a Partner API request.

See [SECURITY.md](SECURITY.md) for supported versions and how to report a vulnerability.

## Available Tools - 39 Total

### Toolsets

Tools are grouped into toolsets so an agent only loads the ones you need. Set `STEAM_MCP_TOOLSETS` in the server's `env` to a comma-separated list, or `all`. By default every toolset except `mutations` is enabled, so **live-mutation tools are opt-in**. `STEAM_MCP_READ_ONLY=1` removes `mutations` even when it is listed.

| Toolset | Tools | Default |
|---------|-------|---------|
| `store` | getAppDetails, searchApps, getPlayerCount, getAchievementStats, getPriceOverview, getRegionalPricing, getReviews, getAppReviewSummary, getNewsForApp, getDeckCompatibility, getFeatured, compareApps | on |
| `community` | getPlayerSummary, getOwnedGames, getPlayerAchievements, resolveVanityURL, getWorkshopItem, queryWorkshop, getUserStatsForGame, getPlayerBans | on |
| `publisher` | getLeaderboardsForGame, getLeaderboardEntries, getSchemaForGame, getGlobalStatsForGame, getAppBetas, getAppBuilds, checkAppOwnership, getInventory, getSalesSummary, getChangedSalesDates | on |
| `sdk` | createLobby, uploadWorkshopItem (code guides, no network) | on |
| `assets` | validateStoreAsset, validateStoreAssetDir | on |
| `mutations` | updateWorkshopItem, setAchievement, clearAchievement, uploadLeaderboardScore, grantInventoryItem | **off** |

```json
"env": { "STEAM_API_KEY": "your_key_here", "STEAM_MCP_TOOLSETS": "store,publisher,mutations" }
```

The server also exposes an MCP resource, `steam://server-info`, listing the enabled and disabled toolsets, so an agent can explain why a tool is missing.

### Prompts

Ready-made workflows that most clients show as slash commands. Each one tells the agent which tools to chain and what to report.

| Prompt | Arguments | What you get |
|--------|-----------|--------------|
| `competitor-snapshot` | `appids` (comma-separated) | Side-by-side price, reviews, live players, genres, and recent news |
| `achievement-health` | `appid` | Achievements that look unobtainable (<0.1%), trivial (>90%), or badly described |
| `review-digest` | `appid`, optional `language` | Positive and negative review themes with counts and quotes |
| `regional-price-audit` | `appid` | Regional prices in USD, with outliers flagged |
| `workshop-health` | `appid` | Trending vs top-rated Workshop items, stale top items, common tags |
| `launch-readiness` | `dir`, optional `appid` | PASS/FAIL checklist from your local art folder plus the live store page, prices, and Deck status |

### Resources

Reference data a client can attach so the agent does not guess:

| URI | Contents |
|-----|----------|
| `steam://specs/store-assets` | Pixel sizes, formats, and alpha rules for every asset slot |
| `steam://enums/eresult` | What common EResult codes mean |
| `steam://enums/ugc-query-type` | Workshop sort names and their Steam enum values |
| `steam://enums/review-filters` | Review filter, type, and purchase-type values |
| `steam://app/{appid}/summary` | Compact store summary for any app |
| `steam://server-info` | Version and enabled toolsets |

<details>
<summary><strong>Read Tools (No Auth) - 16 tools</strong></summary>

These work without an API key:

| Tool | Description |
|------|-------------|
| `steam_getAppDetails` | Store data. Compact summary by default (price, release date, genres, platforms, metacritic); `detail: "full"` or `fields` for descriptions, requirements, screenshots, DLC |
| `steam_searchApps` | Search for games/apps by name or keyword |
| `steam_getPlayerCount` | Current concurrent player count |
| `steam_getAchievementStats` | Global achievement unlock percentages |
| `steam_getWorkshopItem` | Workshop item details (title, description, tags, subscribers). Title and description are untrusted user-authored text. |
| `steam_getReviews` | Fetch user reviews with filters for language, sentiment, purchase type. Review bodies are untrusted user-authored text. |
| `steam_getPriceOverview` | Batch price check for multiple apps in a specific region |
| `steam_getAppReviewSummary` | Review score, total counts, and positive percentage (no individual reviews) |
| `steam_getRegionalPricing` | Pricing breakdown across multiple countries/regions |
| `steam_getNewsForApp` | Recent news articles with title, URL, contents, date, and author. Article text is third-party and labeled untrusted. |
| `steam_validateStoreAsset` | Local PNG/JPEG vs Valve store, library, achievement, community, and event sizes, plus library-hero heuristics. Checks a whole achievement icon folder for missing achieved/unachieved pairs. |
| `steam_validateStoreAssetDir` | Launch-readiness audit of a local art folder: infers each slot, validates it, and lists missing required slots and screenshots |
| `steam_getDeckCompatibility` | Steam Deck category (verified, playable, unsupported) and each test result in plain language, for up to 20 apps. Unofficial store endpoint. |
| `steam_getFeatured` | Current top sellers, new releases, specials, and coming soon for a region |
| `steam_compareApps` | One compact table for 2-10 apps: price, release date, genres, metacritic, reviews, current players, languages |
| `steam_getGlobalStatsForGame` | All-player totals for aggregated stats, with optional daily history. Keyless when stat names are given. |

</details>

<details>
<summary><strong>Read Tools (API Key) - 16 tools</strong></summary>

These require `STEAM_API_KEY` to be set:

| Tool | Description |
|------|-------------|
| `steam_getPlayerSummary` | Player profile: name, avatar, online status |
| `steam_getOwnedGames` | Game library size and total playtime, plus the top 50 games by playtime (`sort`, `limit`, `appids`) |
| `steam_queryWorkshop` | Search/browse Workshop items with filters. Titles and short descriptions are untrusted user-authored text. |
| `steam_getLeaderboardEntries` | Leaderboard scores and rankings, by numeric `leaderboardid` or `leaderboard_name` |
| `steam_resolveVanityURL` | Convert vanity URL to 64-bit Steam ID |
| `steam_getSchemaForGame` | Achievement/stat schema with display names and descriptions; up to 100 achievements, icons on request (`limit`, `include_icons`, `include_stats`) |
| `steam_getPlayerAchievements` | Per-player achievement unlock status and timestamps |
| `steam_getLeaderboardsForGame` | List all leaderboards with numeric IDs, names, and sort methods. Needs a publisher key. |
| `steam_getUserStatsForGame` | A player's stat values and unlocked achievements for an app |
| `steam_getPlayerBans` | VAC, game, community, and economy bans for up to 100 players |
| `steam_getAppBetas` | Beta branches, their builds, and password protection. Needs a publisher key. |
| `steam_getAppBuilds` | Recent build history with descriptions and upload times. Needs a publisher key. |
| `steam_checkAppOwnership` | Whether a player owns your app, permanently or via Family Sharing, and since when. Needs a publisher key. |
| `steam_getInventory` | A player's Steam Inventory items for your app. Needs a publisher key with Economy permissions. |
| `steam_getSalesSummary` | Units and USD revenue for up to 31 days, grouped by country, day, app, package, or platform; JSON or CSV. Needs a Financial API Group key (`STEAM_FINANCIAL_API_KEY`). |
| `steam_getChangedSalesDates` | Dates whose sales data changed since a highwatermark, for incremental sync. Needs a Financial API Group key. |

</details>

<details>
<summary><strong>Write Tools (Publisher Key) - 5 tools, plus 2 SDK guides</strong></summary>

The five HTTP write tools are in the `mutations` toolset, which is off unless `STEAM_MCP_TOOLSETS` names it (or is `all`). They require a publisher API key with server IP allowlisted in Steamworks partner settings. They default to `dry_run: true` and require `confirm: true` to POST. SDK guides return code examples and make no HTTP calls.

| Tool | Type | Description |
|------|------|-------------|
| `steam_updateWorkshopItem` | HTTP POST | Update Workshop item metadata via IPublishedFileService. Default dry_run=true; confirm=true to send. Does not change the store page listing. |
| `steam_setAchievement` | HTTP POST | Set/unlock achievements via ISteamUserStats (dev/test). One `achievement` or up to 100 `achievements` per call. Default dry_run=true; confirm=true to send. |
| `steam_clearAchievement` | HTTP POST | Clear/re-lock achievements via ISteamUserStats (dev/test). One `achievement` or up to 100 `achievements` per call. Default dry_run=true; confirm=true to send. |
| `steam_uploadLeaderboardScore` | HTTP POST | Upload scores via ISteamLeaderboards. Default dry_run=true; confirm=true to send. A dry run accepts `leaderboard_name` and shows the resolved ID; the live call takes the numeric `leaderboardid`. |
| `steam_grantInventoryItem` | HTTP POST | Grant inventory items via IInventoryService. Default dry_run=true; confirm=true to send. |
| `steam_createLobby` | SDK guide | Returns C++/C#/GDScript code for ISteamMatchmaking lobby creation. No network call. |
| `steam_uploadWorkshopItem` | SDK guide | Returns code for ISteamUGC Workshop upload workflow. No network call. |

</details>

<details>
<summary><strong>Steam API Endpoints (30 endpoints)</strong></summary>

| Endpoint | Auth |
|----------|------|
| `store.steampowered.com/api/appdetails` | None |
| `store.steampowered.com/api/storesearch` | None |
| `ISteamUserStats/GetNumberOfCurrentPlayers/v1` | None |
| `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2` | None |
| `ISteamNews/GetNewsForApp/v2` | None |
| `ISteamRemoteStorage/GetPublishedFileDetails/v1` | None |
| `IUserReviewsService/GetAppReviews/v1` | None |
| `ISteamUserStats/GetGlobalStatsForGame/v1` | None |
| `store.steampowered.com/api/featuredcategories` | None |
| `store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport` (unofficial) | None |
| `ISteamUser/GetPlayerSummaries/v2` | API key |
| `IPlayerService/GetOwnedGames/v1` | API key |
| `ISteamUser/ResolveVanityURL/v1` | API key |
| `IPublishedFileService/QueryFiles/v1` | API key |
| `ISteamUserStats/GetSchemaForGame/v2` | API key |
| `ISteamUserStats/GetPlayerAchievements/v1` | API key |
| `ISteamLeaderboards/GetLeaderboardEntries/v1` | Publisher key |
| `ISteamLeaderboards/GetLeaderboardsForGame/v2` | Publisher key |
| `ISteamApps/GetAppBetas/v1` | Publisher key |
| `ISteamApps/GetAppBuilds/v1` | Publisher key |
| `ISteamUser/CheckAppOwnership/v4` | Publisher key |
| `IInventoryService/GetInventory/v1` | Publisher key (Economy) |
| `ISteamUserStats/GetUserStatsForGame/v2` | API key |
| `ISteamUser/GetPlayerBans/v1` | API key |
| `IPartnerFinancialsService/GetDetailedSales/v001` | Financial API Group key |
| `IPartnerFinancialsService/GetChangedDatesForPartner/v001` | Financial API Group key |
| `IPublishedFileService/UpdateDetails/v1` (POST) | Publisher key |
| `ISteamUserStats/SetUserStatsForGame/v1` (POST) | Publisher key |
| `ISteamLeaderboards/SetLeaderboardScore/v1` (POST) | Publisher key |
| `IInventoryService/AddItem/v1` (POST) | Publisher key |

</details>

<details>
<summary><strong>Development</strong></summary>

```bash
npm run dev         # Watch mode with auto-reload
npm run build       # Compile TypeScript to dist/
npm start           # Run the compiled server
npm test            # Run all tests (vitest)
npm run test:watch  # Test watch mode
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add new tools and submit PRs.

Partner-admin tools (`steam_partnerLogin`, `steam_uploadStoreImage`, `steam_uploadTrailer`) are not registered by this package's default bin and are not in the npm tarball. They live in `src/partner/` for local use only (`STEAM_PARTNER_ADMIN=1` plus a cookie-jar path or Chromium profile dir outside the repo). `steam_uploadTrailer` is plan-only: live trailer upload is not implemented and returns `[NOT_IMPLEMENTED]`. There is no Publish tool.

**Use the Partner-admin tools at your own risk.** Valve publishes no API for store image upload. These tools post to the Steamworks partner site's own form fields with your logged-in session. Valve can change those fields without notice, and automated use of the partner site may not be allowed by the Steamworks terms you agreed to. Read those terms before you use them, check every upload on the partner site, and use the manual upload in Steamworks if you are unsure. `steam_validateStoreAsset` and `steam_validateStoreAssetDir` check your images without any of this.

</details>

## Related

- [Steam Developer Tools](https://github.com/TMHSDigital/Steam-Cursor-Plugin) - Cursor IDE plugin with 30 skills and 9 rules for Steam/Steamworks development

## Support the project

If the server saves you or your studio time, you can fund its development through [GitHub Sponsors](https://github.com/sponsors/TMHSDigital). Bug reports and feature requests go in [Issues](https://github.com/TMHSDigital/steam-mcp/issues).

## License

CC BY-ND 4.0. See [LICENSE](LICENSE).

- **You can** install and run the server for any purpose, including at a studio and for commercial games, and share unmodified copies with credit.
- **You can't** distribute modified versions or forks of the server.

Versions 0.9.0 and earlier were released under CC BY-NC-ND 4.0, which did not allow commercial use. Steam and Steamworks are trademarks of Valve Corporation; this project is not affiliated with Valve.

---

<p align="center">Built by <a href="https://github.com/TMHSDigital">TMHSDigital</a></p>
