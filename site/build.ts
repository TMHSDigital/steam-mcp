import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TOOLSETS, DEFAULT_TOOLSETS, type ToolsetName } from "../src/tools/index.js";
import { registerPrompts } from "../src/prompts.js";
import { registerResources } from "../src/resources.js";

// Renders the GitHub Pages site in docs/ from the real tool, prompt, and
// resource registrations, so tool names, counts, and key requirements on the
// site cannot drift from the code. `npm run site` writes the files;
// site/build.test.ts fails when the committed files are stale.

export const SITE_URL = "https://tmhsdigital.github.io/steam-mcp/";
export const REPO_URL = "https://github.com/TMHSDigital/steam-mcp";
const NPM_URL = "https://www.npmjs.com/package/@tmhs/steam-mcp";
const PLUGIN_SITE = "https://tmhsdigital.github.io/Steam-Cursor-Plugin/";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string;
  version: string;
  license: string;
};

/** What a tool needs before it can answer. */
export type KeyNeed = "none" | "local" | "key" | "publisher" | "financial";

export const KEY_LABELS: Record<KeyNeed, string> = {
  none: "No key",
  local: "Local, no network",
  key: "Steam Web API key",
  publisher: "Publisher key",
  financial: "Financial API key",
};

const KEY_ORDER: KeyNeed[] = ["none", "local", "key", "publisher", "financial"];

export type ToolKind = "read" | "write" | "guide";

export interface SiteParam {
  name: string;
  required: boolean;
  description: string;
}

export interface SiteTool {
  name: string;
  title: string;
  description: string;
  toolset: ToolsetName;
  key: KeyNeed;
  kind: ToolKind;
  params: SiteParam[];
}

interface ZodLike {
  description?: string;
  safeParse(value: unknown): { success: boolean };
}

/**
 * Derive the key a tool needs from its registered description, which is what
 * the agent reads. Throws when a description states no requirement, so a new
 * tool cannot reach the site without one.
 */
export function keyNeed(toolset: ToolsetName, name: string, description: string): KeyNeed {
  if (toolset === "sdk" || toolset === "assets") return "local";
  if (/Financial API Group key/.test(description)) return "financial";
  if (/publisher (API )?key/i.test(description)) return "publisher";
  if (/No API key required/.test(description)) return "none";
  if (/Requires STEAM_API_KEY/.test(description)) return "key";
  throw new Error(`${name}: description does not say which key it needs`);
}

interface ToolConfig {
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export function collectTools(): SiteTool[] {
  const tools: SiteTool[] = [];
  for (const [toolset, registrars] of Object.entries(TOOLSETS) as [ToolsetName, typeof TOOLSETS[ToolsetName]][]) {
    for (const register of registrars) {
      register({
        registerTool(name: string, config: ToolConfig) {
          const description = config.description ?? "";
          const kind: ToolKind =
            config.inputSchema && "confirm" in config.inputSchema
              ? "write"
              : config.title?.includes("(SDK Guide)")
                ? "guide"
                : "read";
          tools.push({
            name,
            title: config.title ?? name,
            description,
            toolset,
            key: keyNeed(toolset, name, description),
            kind,
            params: Object.entries((config.inputSchema ?? {}) as Record<string, ZodLike>).map(([p, schema]) => ({
              name: p,
              required: !schema.safeParse(undefined).success,
              description: schema.description ?? "",
            })),
          });
        },
      } as unknown as McpServer);
    }
  }
  return tools;
}

interface Entry {
  name: string;
  title: string;
  description: string;
}

function collectPrompts(): Entry[] {
  const out: Entry[] = [];
  registerPrompts({
    registerPrompt(name: string, config: { title: string; description: string }) {
      out.push({ name, title: config.title, description: config.description });
    },
  } as unknown as McpServer);
  return out;
}

function collectResources(): Entry[] {
  const out: Entry[] = [];
  registerResources({
    registerResource(
      _name: string,
      uri: string | { uriTemplate: { toString(): string } },
      config: { title: string; description: string },
    ) {
      const name = typeof uri === "string" ? uri : uri.uriTemplate.toString();
      out.push({ name, title: config.title, description: config.description });
    },
  } as unknown as McpServer);
  return out;
}

// ---------------------------------------------------------------- helpers

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Tool name without the steam_ prefix, as the key map shows it. */
const short = (name: string) => name.replace(/^steam_/, "");

const TOOLSET_BLURBS: Record<ToolsetName, string> = {
  store: "Store pages, search, player counts, prices, reviews, news, Deck status, featured lists.",
  community: "Profiles, libraries, player achievements and stats, Workshop, bans.",
  publisher: "Leaderboards, achievement schemas, global stats, betas, builds, ownership, inventory, sales.",
  mutations: "Set or clear achievements, upload scores, grant items, edit Workshop metadata.",
  sdk: "C++, C#, and GDScript for lobbies and Workshop uploads, which need the Steamworks SDK.",
  assets: "Check capsule, hero, logo, and icon art against Valve's sizes before you upload.",
};

const TOOLSET_ORDER: ToolsetName[] = ["store", "community", "publisher", "assets", "sdk", "mutations"];

/** Site path prefix on GitHub Pages, for pages served at arbitrary URLs (404). */
const BASE_PATH = new URL(SITE_URL).pathname;

function pageHead(opts: { title: string; description: string; path: string; notFound?: boolean }): string {
  const url = SITE_URL + opts.path;
  const indexing = opts.notFound
    ? `<base href="${BASE_PATH}">
<meta name="robots" content="noindex">`
    : `<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Steam MCP Server">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE_URL}assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Steam MCP Server: live Steam data for your coding agent">
<meta name="twitter:card" content="summary_large_image">`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
${indexing}
<meta name="theme-color" content="#1b2838">
<link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="preload" href="fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="styles.css">
<script src="site.js" defer></script>
</head>`;
}

function nav(current: "home" | "tools" | "other"): string {
  const link = (href: string, label: string, here: boolean) =>
    `<a href="${href}"${here ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<header class="wrap top">
  <a class="brand" href="./"><span class="mark"><img src="assets/logo-128.png" alt="" width="22" height="22"></span>Steam MCP Server</a>
  <nav aria-label="Site">
    ${link("tools.html", "Tools", current === "tools")}
    ${link("./#setup", "Setup", false)}
    ${link("./#writes", "Write safety", false)}
    ${link("./#config", "Configuration", false)}
    <a href="${REPO_URL}">GitHub</a>
  </nav>
</header>`;
}

function footer(): string {
  return `<footer class="wrap foot">
  <p>Steam MCP Server ${esc(pkg.version)}. License <a href="${REPO_URL}/blob/main/LICENSE">CC BY-NC-ND 4.0</a>. Built by <a href="https://github.com/TMHSDigital">TMHSDigital</a>.</p>
  <p>Not affiliated with Valve. Steam and Steamworks are trademarks of Valve Corporation.</p>
  <p><a href="${REPO_URL}">GitHub</a> <a href="${NPM_URL}">npm</a> <a href="${REPO_URL}/blob/main/CHANGELOG.md">Changelog</a> <a href="${REPO_URL}/issues">Issues</a></p>
</footer>`;
}

function codeBlock(code: string, label: string): string {
  return `<div class="code"><pre><code>${esc(code)}</code></pre><button type="button" class="copy" data-copy hidden aria-label="Copy ${esc(label)}">Copy</button></div>`;
}

// ---------------------------------------------------------------- home

const QUICK_JSON = `{
  "mcpServers": {
    "steam": {
      "command": "npx",
      "args": ["-y", "@tmhs/steam-mcp"],
      "env": { "STEAM_API_KEY": "your_key_here" }
    }
  }
}`;

const VSCODE_JSON = `{
  "servers": {
    "steam": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@tmhs/steam-mcp"],
      "env": { "STEAM_API_KEY": "your_key_here" }
    }
  }
}`;

const CLIENTS: { id: string; label: string; code: string; note: string }[] = [
  {
    id: "cursor",
    label: "Cursor",
    code: QUICK_JSON,
    note: `Save as <code>.cursor/mcp.json</code> in a project, or <code>~/.cursor/mcp.json</code> for all projects. Pair it with the <a href="${PLUGIN_SITE}">Steam Developer Tools</a> plugin for skills that use these tools.`,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    code: "claude mcp add steam -e STEAM_API_KEY=your_key_here -- npx -y @tmhs/steam-mcp",
    note: "Run once in a terminal. Leave out <code>-e STEAM_API_KEY=...</code> to start with the keyless tools only.",
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    code: QUICK_JSON,
    note: "Add to <code>claude_desktop_config.json</code> (Settings, Developer, Edit Config), then restart Claude Desktop.",
  },
  {
    id: "vscode",
    label: "VS Code",
    code: VSCODE_JSON,
    note: "Save as <code>.vscode/mcp.json</code>. VS Code uses a <code>servers</code> key, not <code>mcpServers</code>.",
  },
  {
    id: "windsurf",
    label: "Windsurf",
    code: QUICK_JSON,
    note: "Add to <code>~/.codeium/windsurf/mcp_config.json</code>.",
  },
  {
    id: "http",
    label: "HTTP",
    code: "npx -y @tmhs/steam-mcp --transport http --port 3000\n# serves http://127.0.0.1:3000/mcp, GET /healthz returns {\"ok\":true}",
    note: "Stateless Streamable HTTP for hosted or team setups. Binds to 127.0.0.1 unless you pass <code>--host</code>, refuses Host headers outside <code>STEAM_MCP_ALLOWED_HOSTS</code>, never takes a key from clients, and keeps write tools off unless <code>STEAM_MCP_HTTP_ALLOW_WRITES=1</code>. Each release also publishes a Docker image, <code>ghcr.io/tmhsdigital/steam-mcp</code>.",
  },
];

/** Environment variables shown in the configuration table. Each must exist in .env.example. */
export const CONFIG_VARS: [string, string, string][] = [
  ["STEAM_API_KEY", "unset", "Steam Web API key. Leaderboard, partner, and write tools need a publisher key with the server's IP allowlisted."],
  ["STEAM_FINANCIAL_API_KEY", "STEAM_API_KEY", "Financial API Group key for the two sales tools."],
  ["STEAM_MCP_TOOLSETS", "all but mutations", "Comma-separated toolsets to load, or <code>all</code>."],
  ["STEAM_MCP_READ_ONLY", "unset", "<code>1</code> removes <code>mutations</code> even if it is listed."],
  ["STEAM_MCP_CACHE_TTL", "per endpoint", "<code>0</code> turns off the in-memory cache. Any other number of seconds replaces every TTL."],
  ["STEAM_MCP_DEBUG", "unset", "<code>1</code> logs each Steam request (host, path, query keys, status, latency) to stderr. Never logs values."],
  ["STEAM_MCP_TRANSPORT", "stdio", "<code>stdio</code> or <code>http</code>, same as <code>--transport</code>."],
];

function keyMap(tools: SiteTool[]): string {
  const counts = KEY_ORDER.map((k) => [k, tools.filter((t) => t.key === k).length] as const);
  const legend = counts
    .map(([k, n]) => `<li><span class="sw k-${k}" aria-hidden="true"></span>${KEY_LABELS[k]}: ${n}</li>`)
    .join("\n      ");
  const cols = TOOLSET_ORDER.map((set) => {
    const inSet = tools.filter((t) => t.toolset === set);
    const off = !DEFAULT_TOOLSETS.includes(set);
    const chips = inSet
      .map(
        (t) =>
          `<li><a class="chip k-${t.key}" href="tools.html#${t.name}" title="${esc(KEY_LABELS[t.key])}">${esc(short(t.name))}</a></li>`,
      )
      .join("\n        ");
    return `<div class="col${off ? " off" : ""}">
      <h3><span>${set}</span><span class="n">${inSet.length}</span></h3>
      <ul>
        ${chips}
      </ul>${off ? `\n      <p class="offnote">Off by default. Each call is a dry run until you confirm.</p>` : ""}
    </div>`;
  }).join("\n    ");
  return `<div class="legend-row">
      <span class="lab" id="key-legend">Key needed</span>
      <ul class="legend" aria-labelledby="key-legend">
      ${legend}
      </ul>
    </div>
    <div class="map">
    ${cols}
    </div>`;
}

function renderHome(tools: SiteTool[]): string {
  const total = tools.length;
  const keyless = tools.filter((t) => t.key === "none" || t.key === "local").length;
  const prompts = collectPrompts();
  const resources = collectResources();

  const tabs = CLIENTS.map(
    (c, i) =>
      `<button type="button" role="tab" id="tab-${c.id}" aria-controls="panel-${c.id}" aria-selected="${i === 0}"${i === 0 ? "" : ' tabindex="-1"'}>${c.label}</button>`,
  ).join("\n        ");
  const panels = CLIENTS.map(
    (c) => `<div class="panel" role="tabpanel" id="panel-${c.id}" aria-labelledby="tab-${c.id}">
        <h3 class="panel-title">${c.label}</h3>
        ${codeBlock(c.code, `${c.label} setup`)}
        <p>${c.note}</p>
      </div>`,
  ).join("\n      ");

  const toolsetRows = TOOLSET_ORDER.map((set) => {
    const n = tools.filter((t) => t.toolset === set).length;
    const on = DEFAULT_TOOLSETS.includes(set);
    return `<tr><th scope="row"><code>${set}</code></th><td>${n}</td><td>${TOOLSET_BLURBS[set]}</td><td>${on ? "On" : '<strong class="warn">Off</strong>'}</td></tr>`;
  }).join("\n        ");

  const promptItems = prompts
    .map((p) => `<li><code>${esc(p.name)}</code><span>${esc(p.description)}</span></li>`)
    .join("\n        ");
  const resourceItems = resources
    .map((r) => `<li><code>${esc(r.name)}</code><span>${esc(r.description)}</span></li>`)
    .join("\n        ");
  const configRows = CONFIG_VARS.map(
    ([name, def, what]) => `<tr><th scope="row"><code>${name}</code></th><td>${esc(def)}</td><td>${what}</td></tr>`,
  ).join("\n        ");

  const writes = tools.filter((t) => t.kind === "write").length;

  return `${pageHead({
    title: `Steam MCP Server: ${total} Steam tools for your coding agent`,
    description: `MCP server with ${total} Steam Web API tools for Cursor, Claude Code, VS Code, and other MCP clients: store data, player counts, reviews, pricing, achievements, Workshop, leaderboards, and sales. ${keyless} work without an API key.`,
    path: "",
  })}
<body>
<a class="skip" href="#main">Skip to content</a>
${nav("home")}
<main id="main">
  <section class="wrap hero">
    <h1>${total} Steam tools for your coding agent</h1>
    <p class="lede">Store data, player counts, reviews, regional prices, achievements, Workshop, leaderboards, and sales, as MCP tools for Cursor, Claude Code, VS Code, and any other MCP client. ${keyless} of them work with no API key.</p>
    <div class="cta">
      <div class="npx">${codeBlock("npx -y @tmhs/steam-mcp", "install command")}</div>
      <a class="btn" href="#setup">Set it up</a>
    </div>
    ${keyMap(tools)}
    <p class="tracks">This site follows the <code>main</code> branch. The npm release can be behind it: anything under Unreleased in the <a href="${REPO_URL}/blob/main/CHANGELOG.md">changelog</a> is not on npm yet. To run <code>main</code>, build from a <a href="${REPO_URL}#client-setup">local clone</a>.</p>
  </section>

  <section class="wrap band example" aria-labelledby="example-h">
    <div class="copy-col">
      <h2 id="example-h">One question, two tool calls</h2>
      <p>The agent picks the tools, calls them, and answers from what Steam returns. This exchange used two keyless tools. The numbers are what Steam reported on 22 November 2026.</p>
      <p><a href="tools.html">See every tool and what it needs</a></p>
    </div>
    <ol class="transcript">
      <li><span class="who">You ask</span><p class="q">How many people are playing Team Fortress 2 right now, and how is it reviewed?</p></li>
      <li class="call"><span class="who">The agent calls</span><pre><code><a href="tools.html#steam_getPlayerCount">steam_getPlayerCount</a> {"appid":440}
<a href="tools.html#steam_getAppReviewSummary">steam_getAppReviewSummary</a> {"appid":440}</code></pre></li>
      <li class="call"><span class="who">Steam returns</span><pre><code>{"appid":440,"player_count":102022}
{"appid":440,"review_score_desc":"Very Positive",
 "total_reviews":1258222,"positive_percentage":91}</code></pre></li>
      <li><span class="who">The agent answers</span><p><strong>102,022</strong> people are in TF2 right now. Reviews are Very Positive: 91% of 1,258,222.</p></li>
    </ol>
  </section>

  <section class="wrap band" id="setup" aria-labelledby="setup-h">
    <h2 id="setup-h">Setup</h2>
    <p class="lede">Requires Node.js 22 or later. Nothing to clone or build: your client starts the server with <code>npx</code>.</p>
    <div class="tabs" data-tabs>
      <div class="tablist" role="tablist" aria-label="MCP client" hidden>
        ${tabs}
      </div>
      ${panels}
    </div>
    <div class="keys">
      <h3>Which key do you need?</h3>
      <ul>
        <li><span class="sw k-none" aria-hidden="true"></span><strong>None</strong> for store lookups, search, player counts, prices, reviews, news, Deck status, and art checks. Leave <code>STEAM_API_KEY</code> out.</li>
        <li><span class="sw k-key" aria-hidden="true"></span><strong>A free Steam Web API key</strong> from <a href="https://steamcommunity.com/dev/apikey">steamcommunity.com/dev/apikey</a> for profiles, libraries, player achievements, Workshop search, and bans.</li>
        <li><span class="sw k-publisher" aria-hidden="true"></span><strong>A publisher key</strong> from Steamworks, with the server's IP allowlisted, for leaderboards, betas, builds, ownership, inventory, and every write tool.</li>
        <li><span class="sw k-financial" aria-hidden="true"></span><strong>A Financial API Group key</strong> for sales reports. Set it as <code>STEAM_FINANCIAL_API_KEY</code>.</li>
      </ul>
      <p>The server reads keys from its own environment only. It does not load a <code>.env</code> file.</p>
    </div>
  </section>

  <section class="wrap band" id="writes" aria-labelledby="writes-h">
    <h2 id="writes-h">Write safety</h2>
    <p class="lede">Write tools do nothing until you confirm. The ${writes} tools that change live Steam data are off by default. When you turn them on, every call is a dry run that returns a plan and sends nothing. A live call needs both <code>dry_run: false</code> and <code>confirm: true</code>. Without <code>confirm</code> it is refused with <code>[CONFIRM_REQUIRED]</code>.</p>
    <div class="pair">
      <figure>
        <figcaption>Refused: nothing is sent</figcaption>
        ${codeBlock(`{
  "appid": 480,
  "steamid": "76561197960435530",
  "achievement": "ACH_WIN_ONE_GAME",
  "dry_run": false
}`, "refused call")}
      </figure>
      <figure>
        <figcaption>Sent to the Partner API</figcaption>
        ${codeBlock(`{
  "appid": 480,
  "steamid": "76561197960435530",
  "achievement": "ACH_WIN_ONE_GAME",
  "dry_run": false,
  "confirm": true
}`, "confirmed call")}
      </figure>
    </div>
    <p>Write tools take a literal Steam64 ID, never a vanity name, so a lookup mistake cannot redirect a change. Reviews, Workshop text, and news come back labeled as third-party content, for the agent to summarize rather than follow. See <a href="${REPO_URL}/blob/main/SECURITY.md">SECURITY.md</a> to report a vulnerability.</p>
  </section>

  <section class="wrap band ref ref-first" id="toolsets" aria-labelledby="toolsets-h">
    <h2 id="toolsets-h">Toolsets</h2>
    <p class="lede">Load only the toolsets you use. Fewer tools means less for the agent to read on every turn. Set <code>STEAM_MCP_TOOLSETS</code> to a comma-separated list. The <code>steam://server-info</code> resource tells the agent which toolsets are off, so it can explain a missing tool.</p>
    <div class="table">
      <table>
        <thead><tr><th scope="col">Toolset</th><th scope="col">Tools</th><th scope="col">Covers</th><th scope="col">Default</th></tr></thead>
        <tbody>
        ${toolsetRows}
        </tbody>
      </table>
    </div>
    ${codeBlock('"env": { "STEAM_API_KEY": "your_key_here", "STEAM_MCP_TOOLSETS": "store,publisher,mutations" }', "toolset example")}
  </section>

  <section class="wrap band ref two" aria-labelledby="prompts-h">
    <div>
      <h2 id="prompts-h">Prompts</h2>
      <p>Ready-made workflows that most clients show as slash commands. Each one tells the agent which tools to chain and what to report.</p>
      <ul class="defs">
        ${promptItems}
      </ul>
    </div>
    <div>
      <h2>Resources</h2>
      <p>Reference data the agent can read instead of guessing.</p>
      <ul class="defs">
        ${resourceItems}
      </ul>
    </div>
  </section>

  <section class="wrap band ref" id="config" aria-labelledby="config-h">
    <h2 id="config-h">Configuration</h2>
    <p class="lede">Every setting is an environment variable in your client's <code>env</code> block. These are the common ones. The <a href="${REPO_URL}#configuration">README</a> and <a href="${REPO_URL}/blob/main/.env.example"><code>.env.example</code></a> list every setting, including HTTP host and port.</p>
    <div class="table">
      <table>
        <thead><tr><th scope="col">Variable</th><th scope="col">Default</th><th scope="col">What it does</th></tr></thead>
        <tbody>
        ${configRows}
        </tbody>
      </table>
    </div>
  </section>

  <section class="wrap band ref companion" aria-labelledby="companion-h">
    <h2 id="companion-h">Steam Developer Tools</h2>
    <p>This server is the live-data half of <a href="${PLUGIN_SITE}">Steam Developer Tools</a>, a Cursor plugin with 30 skills and 9 rules for Steamworks development. The skills call these tools to check real store pages, stats, and leaderboards while you build.</p>
  </section>
</main>
${footer()}
</body>
</html>
`;
}

// ---------------------------------------------------------------- tools

const KIND_LABELS: Record<ToolKind, string> = {
  read: "Read only",
  write: "Live write, confirm-gated",
  guide: "Code guide, no network",
};

function kindLabel(t: SiteTool): string {
  if (t.kind === "read" && t.toolset === "assets") return "Reads local files";
  return KIND_LABELS[t.kind];
}

function renderTools(tools: SiteTool[]): string {
  const total = tools.length;
  const toc = TOOLSET_ORDER.map((set) => {
    const items = tools
      .filter((t) => t.toolset === set)
      .map((t) => `<li><a class="k-${t.key}" href="#${t.name}">${esc(short(t.name))}</a></li>`)
      .join("\n          ");
    return `<li><a class="set" href="#set-${set}">${set}</a>
        <ul>
          ${items}
        </ul>
      </li>`;
  }).join("\n      ");

  const legend = KEY_ORDER.map(
    (k) => `<li><span class="sw k-${k}" aria-hidden="true"></span>${KEY_LABELS[k]}</li>`,
  ).join("\n      ");

  const groups = TOOLSET_ORDER.map((set) => {
    const inSet = tools.filter((t) => t.toolset === set);
    const on = DEFAULT_TOOLSETS.includes(set);
    const entries = inSet
      .map((t) => {
        const params = t.params.length
          ? `<table class="params">
          <caption>Inputs</caption>
          <tbody>
          ${t.params
            .map(
              (p) =>
                `<tr><th scope="row"><code>${esc(p.name)}</code>${p.required ? ' <span class="req">required</span>' : ""}</th><td>${esc(p.description)}</td></tr>`,
            )
            .join("\n          ")}
          </tbody>
        </table>`
          : `<p class="noparams">No inputs.</p>`;
        return `<article class="tool k-${t.key}" id="${t.name}">
        <h3>${esc(t.title)}</h3>
        <p class="meta"><code>${esc(t.name)}</code><span class="badge"><span class="sw k-${t.key}" aria-hidden="true"></span>${KEY_LABELS[t.key]}</span><span class="badge">${kindLabel(t)}</span></p>
        <p class="desc">${esc(t.description)}</p>
        ${params}
      </article>`;
      })
      .join("\n      ");
    return `<section class="group" id="set-${set}" aria-labelledby="h-${set}">
      <h2 id="h-${set}"><code>${set}</code> <span class="n">${inSet.length} tools, ${on ? "on by default" : "off by default"}</span></h2>
      <p class="lede">${TOOLSET_BLURBS[set]}</p>
      ${entries}
    </section>`;
  }).join("\n    ");

  return `${pageHead({
    title: `Tool reference: all ${total} Steam MCP tools`,
    description: `Every Steam MCP Server tool with its inputs, the API key it needs, and whether it reads, writes, or runs locally.`,
    path: "tools.html",
  })}
<body>
<a class="skip" href="#main">Skip to content</a>
${nav("tools")}
<div class="wrap reference">
  <nav class="toc" aria-label="Tools">
    <ul>
      ${toc}
    </ul>
  </nav>
  <main id="main">
    <h1 class="page-title">Tool reference</h1>
    <p class="lede">All ${total} tools, generated from the server's own registrations: the description your agent reads, the inputs it can pass, and the key the tool needs. Tool names in the server are prefixed <code>steam_</code>.</p>
    <ul class="legend">
      ${legend}
    </ul>
    ${groups}
  </main>
</div>
${footer()}
</body>
</html>
`;
}

// ---------------------------------------------------------------- basics

function render404(): string {
  return `${pageHead({
    title: "Page not found: Steam MCP Server",
    description: "This page does not exist on the Steam MCP Server site.",
    path: "404.html",
    notFound: true,
  })}
<body>
${nav("other")}
<main id="main" class="wrap notfound">
  <h1>No page here</h1>
  <p class="lede">The address may be mistyped, or the page moved. The site has two pages: the <a href="./">overview and setup</a>, and the <a href="tools.html">tool reference</a>.</p>
</main>
${footer()}
</body>
</html>
`;
}

const PAGES = ["", "tools.html"];

function renderSitemap(): string {
  const urls = PAGES.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function renderRobots(): string {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}sitemap.xml
`;
}

/** Every generated file in docs/, keyed by its path relative to docs/. */
export function renderSite(): Record<string, string> {
  const tools = collectTools();
  return {
    "index.html": renderHome(tools),
    "tools.html": renderTools(tools),
    "404.html": render404(),
    "sitemap.xml": renderSitemap(),
    "robots.txt": renderRobots(),
  };
}
