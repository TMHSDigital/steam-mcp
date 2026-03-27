# Steam MCP Server

MCP (Model Context Protocol) server for Steam and Steamworks APIs. Provides structured tools for querying Steam store data, player statistics, achievements, workshop items, leaderboards, and player profiles from AI-powered IDEs.

Built as the companion MCP server for the [Steam Developer Tools](https://github.com/TMHSDigital/Steam-Cursor-Plugin) Cursor plugin.

> **Status:** In development. See the [planned tools](#planned-tools) below.

## Planned Tools

### Read-Only (v0.2.0 of Steam Developer Tools)

| Tool | Description | Auth |
|------|-------------|------|
| `steam.getAppDetails` | Store data: price, reviews, tags, platforms | None |
| `steam.searchApps` | Search for games/apps by name | None |
| `steam.getPlayerCount` | Current concurrent player count | None |
| `steam.getAchievementStats` | Global achievement unlock percentages | None |
| `steam.getPlayerSummary` | Player profile: name, avatar, status | API key |
| `steam.getOwnedGames` | Game library with playtime | API key |
| `steam.getWorkshopItem` | Workshop item details | None |
| `steam.queryWorkshop` | Search/browse Workshop items | API key |
| `steam.getLeaderboardEntries` | Leaderboard scores and rankings | API key |
| `steam.resolveVanityURL` | Convert vanity URL to 64-bit Steam ID | API key |

### Additional Tools (v0.3.0+)

| Tool | Description | Auth |
|------|-------------|------|
| `steam.getReviews` | Fetch user reviews with filters | None |
| `steam.getPriceOverview` | Batch price check across regions | None |
| `steam.getAppReviewSummary` | Review histogram and summary | None |
| `steam.getRegionalPricing` | Pricing breakdown by country | None |

### Write Operations (v0.7.0+)

| Tool | Description | Auth |
|------|-------------|------|
| `steam.createLobby` | Create multiplayer lobbies | SDK |
| `steam.uploadWorkshopItem` | Upload new Workshop items | SDK |
| `steam.updateWorkshopItem` | Update existing Workshop items | SDK |
| `steam.setAchievement` | Unlock achievements (dev/test) | SDK |
| `steam.uploadLeaderboardScore` | Upload leaderboard scores | SDK |
| `steam.grantInventoryItem` | Grant inventory items (dev/test) | SDK |

## Configuration

### Steam API Key

Some tools require a Steam Web API key. Get one free at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey).

Set it as an environment variable:

```bash
export STEAM_API_KEY="your_key_here"
```

Or in a `.env` file:

```
STEAM_API_KEY=your_key_here
```

### No-Key Tools

These tools work without an API key:

- `steam.getAppDetails`
- `steam.searchApps`
- `steam.getPlayerCount`
- `steam.getAchievementStats`
- `steam.getWorkshopItem`
- `steam.getReviews`
- `steam.getPriceOverview`

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
| `ISteamLeaderboards/GetLeaderboardEntries/v1` | API key |

## Related

- [Steam Developer Tools](https://github.com/TMHSDigital/Steam-Cursor-Plugin) - Cursor IDE plugin with 14 skills and 3 rules for Steam/Steamworks development

## License

CC BY-NC-ND 4.0 - see [LICENSE](LICENSE) for details.
