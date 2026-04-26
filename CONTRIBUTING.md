# Contributing to Steam MCP Server

## Prerequisites

- Node.js 20 or later
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

1. Create a new file in `src/tools/` (e.g. `src/tools/getReviews.ts`).

2. Follow the existing pattern - export a `register` function:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { steamStoreUrl, steamFetch, errorResponse } from "../utils/steam-api.js";

const inputSchema = {
  appid: z.number().int().positive().describe("Steam application ID"),
};

export function register(server: McpServer): void {
  server.tool(
    "steam_getReviews",
    "Description of what this tool does. Mention if API key is required.",
    inputSchema,
    async ({ appid }) => {
      try {
        const url = steamStoreUrl("/appreviews/" + appid, { json: 1 });
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

3. Import and register it in `src/index.ts`:

```typescript
import { register as registerGetReviews } from "./tools/getReviews.js";
// ...
registerGetReviews(server);
```

4. If the tool needs an API key, use `requireApiKey()` from `steam-api.ts` and mention it in the tool description.

5. Build and test:

```bash
npm run build
```

## Code style

- TypeScript with strict mode enabled
- Never use em dashes. Use a regular dash or rewrite the sentence.
- Never hardcode API keys. Always read from `STEAM_API_KEY` environment variable.
- Every tool should have a clear description and well-typed zod input schema with `.describe()` on each field.
- Wrap all tool handlers in try/catch and use `errorResponse()` for error formatting.

## Pull request guidelines

- One tool per PR when adding new tools
- Include the Steam API endpoint URL in the PR description
- Note whether the endpoint requires authentication
- Test with real Steam API calls before submitting
- Keep changes focused - avoid unrelated refactors in the same PR
- Make sure `npm run build` passes with no errors

## Developer Certificate of Origin and Inbound License Grant

This project uses CC-BY-NC-ND-4.0 as its outbound license, which forbids derivatives. Every pull request is a derivative. Contributions are accepted inbound under a broader grant via the Developer Certificate of Origin (DCO), which resolves the conflict so the project can accept and redistribute contributions.

### Required grant

By submitting a contribution to this repository, you certify that you have the right to do so under the Developer Certificate of Origin (DCO) 1.1, and you grant TMHSDigital a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute your contribution under the project's current license (CC-BY-NC-ND-4.0) or any successor license chosen by the project.

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
