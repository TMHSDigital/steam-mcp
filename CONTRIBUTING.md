# Contributing to Steam MCP Server

## Prerequisites

- Node.js 22 or later
- npm
- A Steam Web API key for testing authenticated tools (free at https://steamcommunity.com/dev/apikey)

## Setup

```bash
git clone https://github.com/TMHSDigital/Steam-MCP.git
cd Steam-MCP
npm install
npm run build
```

Set your API key for testing:

```bash
# PowerShell
$env:STEAM_API_KEY = "your_key_here"

# Bash
export STEAM_API_KEY="your_key_here"
```

Run in development mode (auto-reloads on changes):

```bash
npm run dev
```

## Adding a new tool

1. Create a new file in `src/tools/` (e.g. `src/tools/getPlayerCount.ts`).

2. Follow the existing pattern - export a `register` function that calls `server.registerTool()` (never the deprecated `server.tool()`):

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamApiUrl, steamFetch, errorResponse } from "../utils/steam-api.js";
import { READ_ONLY } from "../utils/annotations.js";

const inputSchema = {
  appid: z.number().int().positive().describe("Steam application ID"),
};

export function register(server: McpServer): void {
  server.registerTool(
    "steam_getPlayerCount",
    {
      title: "Get Player Count",
      description:
        "Get the current number of concurrent players for a Steam app. No API key required.",
      inputSchema,
      annotations: READ_ONLY,
    },
    async ({ appid }) => {
      try {
        const url = steamApiUrl("/ISteamUserStats/GetNumberOfCurrentPlayers/v1/", { appid });
        const data = await steamFetch(url);

        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
```

   Pick `annotations` from `src/utils/annotations.ts`: `READ_ONLY` for Steam reads, `LOCAL_ONLY` for tools that never touch the network, `LIVE_WRITE` or `LIVE_WRITE_IDEMPOTENT` for confirm-gated mutations.

3. Add it to a toolset in `src/tools/index.ts` (`store`, `community`, `publisher`, `mutations`, `sdk`, or `assets`). Live-mutation tools go in `mutations`, which is off by default:

```typescript
import { register as registerGetPlayerCount } from "./getPlayerCount.js";
// ...
export const TOOLSETS = {
  store: [registerGetAppDetails, registerGetPlayerCount, /* ... */],
```

   Add the tool to the README toolset table too.
4. If the tool needs an API key, use `requireApiKey()` from `steam-api.ts` and mention it in the tool description.

5. If the tool performs a live mutation (inventory grant, achievement/stat write, leaderboard write, Workshop metadata update, Partner-admin upload, or similar), spread `confirmSchema` from `src/utils/confirm.ts`, call `refuseIfUnconfirmed` before any network I/O, run the dry-run branch before `requireApiKey()`, and prepend a capability warning to the tool description. Do not add a new write tool that can send unconfirmed. Read-only Steam POSTs (for example `GetPublishedFileDetails`) are not mutations and must not use this gate.

6. Add a row for the tool to the README tool table and bump the tool counts (README, `CLAUDE.md`, `package.json` description). Then run `npm run site` and commit the regenerated `docs/` pages, which list every tool. `npm test` fails until they match.

7. Add a handler test under `src/tools/__tests__/` that stubs `fetch` with a fixture, and build and test:

```bash
npm run build
npm test
```

## Code style

- TypeScript with strict mode enabled
- Never use em dashes. Use a regular dash or rewrite the sentence.
- Never hardcode API keys. Always read from `STEAM_API_KEY` environment variable.
- Every tool should have a clear description and well-typed zod input schema with `.describe()` on each field.
- Wrap all tool handlers in try/catch and use `errorResponse()` for error formatting.
- Live mutations must use the shared confirm gate (`confirmSchema`, `refuseIfUnconfirmed`, dry-run before `requireApiKey()`).

## Pull request guidelines

- One tool per PR when adding new tools
- Include the Steam API endpoint URL in the PR description
- Note whether the endpoint requires authentication
- Test with real Steam API calls before submitting
- Keep changes focused - avoid unrelated refactors in the same PR
- Make sure `npm run build`, `npm run typecheck`, and `npm test` pass

## Release checklist

The version lives in `package.json`, mirrored in `server.json` (a test enforces that they match). Both servers read it at runtime from `src/version.ts`.

1. Move the `[Unreleased]` entries in `CHANGELOG.md` under a new version heading with today's date.
2. `npm version <patch|minor|major> --no-git-tag-version` (updates `package.json` and `package-lock.json`), and set both `version` fields in `server.json` to the same value. `npm test` fails until they match.
3. If the tool list changed, update the counts in `package.json` `description`, the README badge, summary line, and tool tables, and `CLAUDE.md`. `npm test` fails until they match the registered tools.
4. If a supported-version boundary moved, update the table in `SECURITY.md`.
5. Run `npm run site` and commit the regenerated `docs/` pages: they show the version, so `npm version` makes them stale.
6. `npm run build && npx tsc -p tsconfig.partner.json && npm run typecheck && npm test`
7. Commit, push, and publish a GitHub release tagged `vX.Y.Z`. The publish workflow ships it to npm, then lists it in the official MCP Registry from `server.json`. The Docker workflow pushes `ghcr.io/tmhsdigital/steam-mcp`.

## Developer Certificate of Origin and Inbound License Grant

This project uses CC-BY-ND-4.0 as its outbound license, which forbids derivatives. Every pull request is a derivative. Contributions are accepted inbound under a broader grant via the Developer Certificate of Origin (DCO), which resolves the conflict so the project can accept and redistribute contributions.

### Required grant

By submitting a contribution to this repository, you certify that you have the right to do so under the Developer Certificate of Origin (DCO) 1.1, and you grant TMHSDigital a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute your contribution under the project's current license (CC-BY-ND-4.0) or any successor license chosen by the project.

### DCO sign-off

Every commit in a pull request must have a `Signed-off-by:` trailer matching the commit author:

```
Signed-off-by: Jane Developer <jane@example.com>
```

Signing is done at commit time:

```bash
git commit -s -m "feat: add new skill"
```

The GitHub DCO App enforces this on every PR.

For the full inbound/outbound model and rationale, see [`standards/licensing.md`](https://github.com/TMHSDigital/Developer-Tools-Directory/blob/main/standards/licensing.md) in the Developer-Tools-Directory meta-repo.
