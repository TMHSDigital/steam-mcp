<!-- standards-version: 1.10.0 -->

# CLAUDE.md - Steam MCP Server

## What is this?

An MCP (Model Context Protocol) server that exposes Steam Web API endpoints as structured tools for AI-powered IDEs. It is the companion server for the [Steam Developer Tools](https://github.com/TMHSDigital/Steam-Cursor-Plugin) Cursor plugin, which provides 30 skills and 9 rules for Steam/Steamworks development. The server provides 39 tools: 32 read-only, 5 write (Partner API mutations gated by confirm/dry-run), and 2 SDK code-example generators.

The plugin's skills reference these MCP tools to fetch live data from Steam - player stats, store info, workshop items, leaderboards, and more.

## Architecture

```
src/
  index.ts              Entry point - parses --transport/--port/--host, selects toolsets, starts stdio or HTTP
  server.ts             createServer(): McpServer with toolsets, prompts, resources, server-info
  http.ts               Stateless Streamable HTTP server (POST /mcp, GET /healthz, Host allowlist)
  prompts.ts            MCP prompts (workflow slash commands)
  resources.ts          MCP resources (asset specs, enums, app summary template)
  version.ts            Reads the version from package.json
  tools/
    index.ts             TOOLSETS - the one list of default-bin tools, grouped; selectToolsets() reads the env
    getAppDetails.ts     Each file exports a register(server) function
    searchApps.ts        that calls server.registerTool with name, title,
    getPlayerCount.ts    description, zod input schema, annotations, and handler
    validateStoreAsset.ts
    ...
  storeAssets/
    slots.ts             Valve pixel sizes and unofficial Partner form field names
    png.ts               PNG/JPEG header parse plus PNG pixel decode
    heroHeuristics.ts    Library-hero ribbon / seam / wordmark checks
    validate.ts          Pure validateStoreAsset(path, slot)
  utils/
    steam-api.ts         Shared fetch wrapper, URL builders, API key helper, error formatting
    confirm.ts           Shared dry_run/confirm gate for any live mutation
    annotations.ts       MCP tool annotation presets (READ_ONLY, LOCAL_ONLY, LIVE_WRITE)
    reviews.ts           IUserReviewsService/GetAppReviews client and enum mapping
    errors.ts            Custom error classes (rate limit, missing key, unavailable)
```

**Key patterns:**

- Each tool is a self-contained module that exports `register(server: McpServer)` and calls `server.registerTool()` (never the deprecated `server.tool()`). Add new tools to a toolset in `src/tools/index.ts` (live mutations go in `mutations`, which is off by default).
- Every tool declares `annotations` from `src/utils/annotations.ts`. Confirm-gated writes use `LIVE_WRITE` or `LIVE_WRITE_IDEMPOTENT`; `annotations.test.ts` enforces this.
- `steam-api.ts` provides `steamFetch()` which handles timeouts (15s via AbortController with `TimeoutError`), HTTP error detection (429 rate limits with up to 2 retries and exponential backoff, 5xx unavailable), and JSON parsing.
- `errorResponse()` formats errors as MCP-compatible `{ isError: true }` responses.
- Tools that need an API key call `requireApiKey()` which reads `STEAM_API_KEY` from env and throws `MissingApiKeyError` with setup instructions if missing.
- Any tool that performs a live mutation must use the shared confirm gate in `src/utils/confirm.ts`: spread `confirmSchema`, call `refuseIfUnconfirmed` before any network I/O, run the dry-run branch before `requireApiKey()`, and never send unless `dry_run: false` and `confirm: true`.
- No-auth tools (getAppDetails, searchApps, getPlayerCount, getAchievementStats, getWorkshopItem, getReviews, getPriceOverview, getAppReviewSummary, getRegionalPricing, getNewsForApp, validateStoreAsset) work without any configuration.

## How to build and run

```bash
npm install
npm run build     # tsc - outputs to dist/
npm start         # node dist/index.js (stdio transport)
npm run dev       # tsx watch for development
```

## How to test

**Automated tests (vitest):**

```bash
npm test                # single run
npm run test:watch      # watch mode
npm run test:coverage   # with the coverage floor CI enforces
npm run contract        # live calls to every no-auth tool (after npm run build)
```

`src/tools/__tests__/harness.ts` captures the real registrations, so tests use the tools' own schemas and handlers. `handlers.test.ts` needs a success and error case for every tool and fails when a new tool has none. Tests also cover `steamFetch` retries and error detail, the confirm/dry-run gate and exact request bodies of write tools, and doc count drift. A nightly workflow (`contract.yml`) runs `npm run contract` and opens an issue when a live endpoint breaks.

**Manual testing** via MCP inspector or by configuring as an MCP server in Cursor:

```json
{
  "mcpServers": {
    "steam": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "STEAM_API_KEY": "your_key_here"
      }
    }
  }
}
```

No-auth tools can be tested without setting `STEAM_API_KEY`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STEAM_API_KEY` | For some tools | Steam Web API key from https://steamcommunity.com/dev/apikey |
| `STEAM_FINANCIAL_API_KEY` | For sales tools | Financial API Group key for IPartnerFinancialsService. Falls back to `STEAM_API_KEY`. |
| `STEAM_MCP_TRANSPORT` | No | `stdio` (default) or `http`. Same as `--transport`. HTTP also reads `--port`/`PORT` (3000) and `--host`/`HOST` (127.0.0.1). |
| `STEAM_MCP_ALLOWED_HOSTS` | HTTP only | Comma-separated Host header values to accept (default `localhost,127.0.0.1,[::1]`; `*` disables the check). |
| `STEAM_MCP_HTTP_ALLOW_WRITES` | HTTP only | `1` lets the `mutations` toolset load in HTTP mode. |
| `STEAM_MCP_TOOLSETS` | No | Comma-separated toolsets to load (`store`, `community`, `publisher`, `mutations`, `sdk`, `assets`) or `all`. Default: all except `mutations`. |
| `STEAM_MCP_READ_ONLY` | No | `1` removes the `mutations` toolset even if listed. |
| `STEAM_MCP_CACHE_TTL` | No | Unset: per-endpoint TTLs for public GETs (30s player count to 1h schema). `0` disables caching. Any other number of seconds replaces every TTL. |
| `STEAM_MCP_DEBUG` | No | `1` logs each Steam request (host, path, query keys, status, attempt, latency) to stderr and MCP logging. Never logs values. |
| `STEAM_PARTNER_ADMIN` | Partner process only | Must be `1` to start `src/partner/index.ts`. Ignored by the default bin. |
| `STEAM_PARTNER_COOKIES` | Partner process only | Path to a cookie jar. Never a cookie string. Gitignored. |
| `STEAM_PARTNER_PROFILE_DIR` | Partner process only | Chromium user-data dir outside the repo. |

## Relationship to the companion plugin

This repo ([Steam-MCP](https://github.com/TMHSDigital/Steam-MCP)) provides the live API layer. The companion repo ([Steam-Cursor-Plugin](https://github.com/TMHSDigital/Steam-Cursor-Plugin)) provides the Cursor IDE integration (skills, rules, and workflows). Together they give developers a complete Steam/Steamworks development toolkit inside Cursor.
