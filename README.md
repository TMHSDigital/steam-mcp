# Steam MCP Server

[![npm](https://img.shields.io/npm/v/@tmhs/steam-mcp)](https://www.npmjs.com/package/@tmhs/steam-mcp)
[![license](https://img.shields.io/npm/l/@tmhs/steam-mcp)](LICENSE)
[![node](https://img.shields.io/node/v/@tmhs/steam-mcp)](package.json)

MCP (Model Context Protocol) server for Steam and Steamworks APIs. Provides structured tools for querying Steam store data, player statistics, achievements, workshop items, leaderboards, and player profiles from AI-powered IDEs.

Built as the companion MCP server for the [Steam Developer Tools](https://github.com/TMHSDigital/Steam-Cursor-Plugin) Cursor plugin.

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm

### Install

```bash
git clone https://github.com/TMHSDigital/Steam-MCP.git
cd Steam-MCP
npm install
npm run build
```

### Steam API Key

Some tools require a Steam Web API key. Get one free at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey).

Set it as an environment variable:

```bash
# Bash / macOS / Linux
export STEAM_API_KEY="your_key_here"

# PowerShell
$env:STEAM_API_KEY = "your_key_here"
```

Or in a `.env` file:

```
STEAM_API_KEY=your_key_here
```

Tools that don't need a key work out of the box with zero configuration.

## Usage with Cursor

Add the Steam MCP server to your Cursor MCP settings (`.cursor/mcp.json` in your project or global settings):

**Via npx (recommended):**

```json
{
  "mcpServers": {
    "steam": {
      "command": "npx",
      "args": ["-y", "@tmhs/steam-mcp"],
      "env": {
        "STEAM_API_KEY": "your_key_here"
      }
    }
  }
}
```

**Via local clone:**

```json
{
  "mcpServers": {
    "steam": {
      "command": "node",
      "args": ["/absolute/path/to/Steam-MCP/dist/index.js"],
      "env": {
        "STEAM_API_KEY": "your_key_here"
      }
    }
  }
}
```

Once configured, the tools are available to Cursor's AI agent. Pair with the [Steam Developer Tools](https://github.com/TMHSDigital/Steam-Cursor-Plugin) plugin for the full skill set.

## Available Tools (v0.4.0) — 20 Total

### Read Tools (No Auth) — 9 tools

These work without an API key:

| Tool | Description |
|------|-------------|
| `steam.getAppDetails` | Store data: price, description, reviews, tags, platforms, system requirements |
| `steam.searchApps` | Search for games/apps by name |
| `steam.getPlayerCount` | Current concurrent player count |
| `steam.getAchievementStats` | Global achievement unlock percentages |
| `steam.getWorkshopItem` | Workshop item details (title, description, tags, subscribers) |
| `steam.getReviews` | Fetch user reviews with filters for language, sentiment, purchase type |
| `steam.getPriceOverview` | Batch price check for multiple apps in a specific region |
| `steam.getAppReviewSummary` | Review score, total counts, and positive percentage (no individual reviews) |
| `steam.getRegionalPricing` | Pricing breakdown across multiple countries/regions |

### Read Tools (API Key) — 5 tools

These require `STEAM_API_KEY` to be set:

| Tool | Description |
|------|-------------|
| `steam.getPlayerSummary` | Player profile: name, avatar, online status |
| `steam.getOwnedGames` | Game library with playtime data |
| `steam.queryWorkshop` | Search/browse Workshop items with filters |
| `steam.getLeaderboardEntries` | Leaderboard scores and rankings (publisher API key + IP allowlist required) |
| `steam.resolveVanityURL` | Convert vanity URL to 64-bit Steam ID |

### Write / Guidance Tools (Publisher Key) — 6 tools

These require a publisher API key with server IP allowlisted in Steamworks partner settings. SDK-only tools return code examples instead of making HTTP calls.

| Tool | Type | Description |
|------|------|-------------|
| `steam.createLobby` | SDK guide | Returns C++/C#/GDScript code for ISteamMatchmaking lobby creation |
| `steam.uploadWorkshopItem` | SDK guide | Returns code for ISteamUGC Workshop upload workflow |
| `steam.updateWorkshopItem` | HTTP POST | Update Workshop item metadata via IPublishedFileService partner API |
| `steam.setAchievement` | HTTP POST | Set/unlock achievements via ISteamUserStats partner API (dev/test) |
| `steam.uploadLeaderboardScore` | HTTP POST | Upload scores via ISteamLeaderboards partner API |
| `steam.grantInventoryItem` | HTTP POST | Grant inventory items via IInventoryService partner API |

## Steam API Endpoints

| Endpoint | Auth |
|----------|------|
| `store.steampowered.com/api/appdetails` | None |
| `store.steampowered.com/api/storesearch` | None |
| `ISteamUserStats/GetNumberOfCurrentPlayers/v1` | None |
| `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2` | None |
| `ISteamUser/GetPlayerSummaries/v2` | API key |
| `IPlayerService/GetOwnedGames/v1` | API key |
| `ISteamUser/ResolveVanityURL/v1` | API key |
| `ISteamRemoteStorage/GetPublishedFileDetails/v1` | None |
| `IPublishedFileService/QueryFiles/v1` | API key |
| `ISteamLeaderboards/GetLeaderboardEntries/v1` | Publisher key + IP allowlist |
| `IPublishedFileService/UpdateDetails/v1` (POST) | Publisher key + IP allowlist |
| `ISteamUserStats/SetUserStatsForGame/v1` (POST) | Publisher key + IP allowlist |
| `ISteamLeaderboards/SetLeaderboardScore/v1` (POST) | Publisher key + IP allowlist |
| `IInventoryService/AddItem/v1` (POST) | Publisher key + IP allowlist |
| `store.steampowered.com/appreviews/{appid}` | None |

## Testing

```bash
npm test          # Run all tests (vitest)
npm run test:watch  # Watch mode
```

## Development

```bash
npm run dev       # Watch mode with auto-reload
npm run build     # Compile TypeScript to dist/
npm start         # Run the compiled server
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add new tools and submit PRs.

## Related

- [Steam Developer Tools](https://github.com/TMHSDigital/Steam-Cursor-Plugin) - Cursor IDE plugin with 30 skills and 9 rules for Steam/Steamworks development

## License

CC BY-NC-ND 4.0 - see [LICENSE](LICENSE) for details.
