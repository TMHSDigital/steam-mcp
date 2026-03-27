# CLAUDE.md - Steam MCP Server

## What is this?

An MCP (Model Context Protocol) server that exposes Steam Web API endpoints as structured tools for AI-powered IDEs. It is the companion server for the [Steam Developer Tools](https://github.com/TMHSDigital/Steam-Cursor-Plugin) Cursor plugin, which provides 14 skills and 4 rules for Steam/Steamworks development.

The plugin's skills reference these MCP tools to fetch live data from Steam - player stats, store info, workshop items, leaderboards, and more.

## Architecture

```
src/
  index.ts              Entry point - creates McpServer, registers tools, starts stdio transport
  tools/
    getAppDetails.ts     Each file exports a register(server) function
    searchApps.ts        that adds one tool with its name, description,
    getPlayerCount.ts    zod input schema, and async handler
    ...
  utils/
    steam-api.ts         Shared fetch wrapper, URL builders, API key helper, error formatting
    errors.ts            Custom error classes (rate limit, missing key, unavailable)
```

**Key patterns:**

- Each tool is a self-contained module that exports `register(server: McpServer)`.
- `steam-api.ts` provides `steamFetch()` which handles timeouts (15s via AbortController with `TimeoutError`), HTTP error detection (429 rate limits with up to 2 retries and exponential backoff, 5xx unavailable), and JSON parsing.
- `errorResponse()` formats errors as MCP-compatible `{ isError: true }` responses.
- Tools that need an API key call `requireApiKey()` which reads `STEAM_API_KEY` from env and throws `MissingApiKeyError` with setup instructions if missing.
- No-auth tools (getAppDetails, searchApps, getPlayerCount, getAchievementStats, getWorkshopItem) work without any configuration.

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
npm test            # single run
npm run test:watch  # watch mode
```

Tests cover error classes, `steamFetch` behavior (mocked fetch), retry logic, and Zod input validation for all 10 tools.

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

## Relationship to the companion plugin

This repo ([Steam-MCP](https://github.com/TMHSDigital/Steam-MCP)) provides the live API layer. The companion repo ([Steam-Cursor-Plugin](https://github.com/TMHSDigital/Steam-Cursor-Plugin)) provides the Cursor IDE integration (skills, rules, and workflows). Together they give developers a complete Steam/Steamworks development toolkit inside Cursor.
