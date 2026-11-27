# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A `sales-report` prompt: the last N complete days (default 7, ending yesterday Pacific Time) compared with the previous period via `steam_getSalesSummary` `compare_previous`, with totals, top gaining and losing countries, and the best and worst day. Needs the publisher toolset and a Financial API Group key. (#135)
- `steam_getNewsForApp` takes `feeds` (for example `["steam_community_announcements"]` for the developer's own posts) and `before` (an ISO date, sent as `enddate`) to look further back. The `competitor-snapshot` prompt reads only announcements. (#134)
- `steam_compareApps` and the compact `steam_getAppDetails` summary return each app's top 10 user tags (`tags`), from the keyless `IStoreBrowseService/GetItems` and `IStoreService/GetTagList` (cached for a day). A failed tag lookup leaves `tags` out instead of failing the call. The nightly contract check covers both endpoints. (#118)
- `steam_getReviews` takes `since` (ISO date or unix seconds) and `max_pages` (default 5, max 20) to read every review since a date in one bounded call: it pages the newest reviews until an older one, and adds `window: { since, oldest_seen, pages, complete }` so a cut-off is visible. The `review-digest` prompt takes an optional `since`. (#117)
- Releases are listed in the official MCP Registry as `io.github.TMHSDigital/steam-mcp`. The publish workflow publishes `server.json` after each npm release; the first listing comes with the next release. (#46)
- The README has one-click "Add to Cursor" and "Install in VS Code" buttons. (#46)
- `steam_getLeaderboardEntries` takes `include_names: true` to add each player's `personaname`, looked up in batches of 100 IDs. If the lookup fails, the entries come back with a `names_warning` instead. (#99)
- `steam_validateStoreAssetDir` takes an optional `slots` map (file name to slot) for art whose name and size don't identify it. Explicit entries win over inference and are reported as `inferred_by: "explicit"`; names not in the folder come back as `warnings`. (#104)
- `steam_getSalesSummary` takes `compare_previous: true` to also total the same-length period just before and add `previous_*`, `delta_*`, and `delta_pct` to each group and to `totals` (and as extra CSV columns). It doubles the number of requests. (#105)

### Changed

- `steam_validateStoreAssetDir` reads each file once: a file whose slot is inferred from its pixel size is validated from the same bytes instead of being read again, and header-only PNG parsing no longer copies the image data. (#133)
- MCP prompts are offered only when every tool they call is loaded, so `STEAM_MCP_TOOLSETS=store` or HTTP mode without the assets opt-in no longer advertises a slash command whose first step fails. The README prompts table lists the toolsets each one needs. (#125)
- Store and library image sizes live in one data file, `src/storeAssets/store-specs.json`, with the date they were last checked against Valve's Steamworks pages and the pages checked. The validator, the folder audit, and the Partner uploader read it; a test fails if a size is copied into code. `SIZE_HALF` now flags any fixed-size slot exported at exactly half size, not only the library hero. (#25)
- The CI secret scan (`scripts/scan-secrets.py`) matches keys in JSON, YAML, and TOML as well as `KEY=value`, also checks `STEAM_FINANCIAL_API_KEY`, tracked `.env` files, and private-key blocks, and now scans the docs. Findings show the rule, file, and line, never the value, and a `--selftest` run in CI proves each rule still matches. (#25)
- `steam_getDeckCompatibility` fetches up to 4 reports at once instead of one at a time, and caches each report for an hour. (#101)
- The Docker image's `node:24-alpine` base is pinned to a digest in both build stages, so release images are reproducible. (#103)

### Fixed

- `steam_getSalesSummary` fetches up to 4 dates at a time, with the current and `compare_previous` windows in one pool, instead of one date after another. A 31-day comparison no longer takes 124+ serial calls. Each date's pages are still read in order, and the output is unchanged (pinned by snapshot tests). (#111)
- The store rate limiter applies appdetails' strict limit (about 200 per 5 minutes) only to `/api/appdetails`. Deck reports, store search, and featured lists draw from their own, looser bucket, so a regional-pricing fan-out no longer stalls them for tens of seconds. (#112)
- `steam_getDeckCompatibility` keeps the other reports when one app's fetch fails (timeout, 5xx, rate limit) and records `error` and `error_type` on that app, as `steam_getRegionalPricing` does. It returns an error only when every fetch failed. `steam_compareApps` reports the real cause when an app's store call fails instead of guessing "missing, delisted, or region-locked". The two tools' worker pools now share `mapPool`. (#119)
- `steam_updateWorkshopItem` refuses, before sending, an update that changes nothing: `tags: []` (which the Web API cannot use to clear tags) or no fields at all. Previously a confirmed call sent no changes and reported `success: true`. `updated` now lists `tags` once instead of `tags[0]`, `tags[1]`, ... (#120)
- `steam_getGlobalStatsForGame` without `stat_names` no longer passes off the first 50 schema stats as all of them: when the schema has more, the output adds `schema_stat_count`, `skipped`, and a note to pass `stat_names` for the rest, and the parameter description says so. (#121)
- `steam_getOwnedGames` returns `game_count: 0` and an empty `games` list for a public profile with no games, instead of calling it private. A response with neither field is still reported as private or invalid. (#122)
- A timeout that fires while Steam is still sending the response body now raises the timeout error instead of "Unexpected non-JSON response", and a success body cut off mid-read is reported as a network failure. (#123)
- `steam_getSalesSummary` and `steam_getChangedSalesDates` now explain a 401/403 in terms of the Financial API Group key and `STEAM_FINANCIAL_API_KEY` instead of telling users to set `STEAM_API_KEY` to a publisher key, and their 400 text names the dates and highwatermark they actually take. (#110)
- Boolean environment flags now trim surrounding whitespace and carriage returns and accept lowercase or uppercase `true` and `yes`. This fixes HTTP opt-in switches such as `STEAM_MCP_HTTP_ALLOW_ASSETS` when the variable is set with a trailing space or CRLF from an env file. Partner-admin remains a strict `STEAM_PARTNER_ADMIN=1` gate. (#124)
- `steam_validateStoreAssetDir` and the achievement icon folder check no longer report every file as missing when the folder path ends in a space or newline. File names are now joined onto the trimmed, resolved folder path that was listed. (#109)
- `steam_getSalesSummary` CSV keeps the `name` column when the top group has no name but a lower one does. Columns now come from every row, not just the first, and the unnamed rows get an empty cell. (#106)
- `steam_getSalesSummary` no longer passes off a partial day as complete: when a date hits the 50-page cap, the output names it in `truncated_dates` with a `warning` (CSV mode adds the warning as a second content block). (#97)
- `steam_validateStoreAssetDir` files `event_header.png` and similar names as the event header instead of the header capsule, so a correct event header no longer fails the folder audit. (#96)
- `steam_getLeaderboardEntries` accepts negative `rangestart`/`rangeend` with `datarequest: 1` (around user), where the range is an offset from the user, so it can show the players ranked above them. Around-user requests default to `-10..10`. Global and friends requests still need 0 or more. (#100)

## [0.10.0] - 2026-11-23

### Breaking changes

- **Write tools are off by default.** The five live-mutation tools are in the `mutations` toolset, which no longer loads unless you set `STEAM_MCP_TOOLSETS=all` (or a list that includes `mutations`). (#61)
- **Node.js 22 or later is required.** Node 20 is end of life. (#56)
- `steam_getPriceOverview` and `steam_getRegionalPricing` no longer return `free`. Check `price_overview: null` with `reason: "no_price_listed"` instead. (#33)
- `steam_queryWorkshop` takes `sort` (`vote`, `date`, `trend`, ...) instead of the integer `query_type`, and `requiredtags` as an array instead of a comma-separated string. (#53)
- A live `steam_grantInventoryItem` call requires `requestid`. Pass the value the dry run returned. (#92)
- `steam_getAppDetails` returns a compact summary by default. Pass `detail: "full"` for every field, or `fields` for specific ones. `steam_getOwnedGames` returns the top 50 games by playtime and `steam_getSchemaForGame` up to 100 achievements unless you raise `limit`. (#35)
- `steam_getLeaderboardsForGame` calls the Partner host and needs a publisher key. (#64)

### Added

- Five new tools (31 total), all keyless:
  - `steam_getGlobalStatsForGame`: all-player totals for aggregated stats, with optional daily history. (#68)
  - `steam_getDeckCompatibility`: Steam Deck category and each test result in plain language, for up to 20 apps. Uses the store's unofficial Deck report endpoint. (#58)
  - `steam_getFeatured`: top sellers, new releases, specials, and coming soon for a region. (#49)
  - `steam_compareApps`: one compact table for 2-10 apps with price, release date, genres, metacritic, reviews, current players, and language count. (#49)
  - `steam_validateStoreAssetDir`: audits a local art folder, infers each image's slot, and lists missing required slots and screenshots. (#43)
- Six read tools for publishers and support (37 total). Partner host, publisher key: `steam_getAppBetas`, `steam_getAppBuilds`, `steam_checkAppOwnership`, `steam_getInventory` (Economy permission). Public API, regular key: `steam_getUserStatsForGame`, `steam_getPlayerBans`. Built from Valve's documented parameters; not yet verified against live Steam with a publisher key. (#59)
- Sales reporting (39 tools): `steam_getSalesSummary` totals units and USD revenue for up to 31 days, grouped by country, day, app, package, or platform, as JSON or CSV. It follows IPartnerFinancialsService's per-date `max_id` paging. `steam_getChangedSalesDates` supports incremental sync. Both read `STEAM_FINANCIAL_API_KEY` (a Financial API Group key), falling back to `STEAM_API_KEY`. Built from Valve's documentation; not yet verified against live Steam. (#42)
- Streamable HTTP transport: `--transport http` (or `STEAM_MCP_TRANSPORT=http`) serves stateless MCP at `POST /mcp`, with `GET /healthz`. It binds to 127.0.0.1 by default, refuses Host headers outside `STEAM_MCP_ALLOWED_HOSTS`, never takes a key from clients, and keeps `mutations` off unless `STEAM_MCP_HTTP_ALLOW_WRITES=1`. A `Dockerfile` builds the HTTP server, and CI builds the image and calls it. `--version` prints the version. (#48)
- HTTP client authentication: `STEAM_MCP_HTTP_TOKEN` sets a bearer token every `/mcp` request must send. The server refuses to listen on a non-loopback address (including the Docker image's `0.0.0.0`) without one. Browser `Origin` headers are checked against `STEAM_MCP_ALLOWED_HOSTS`, and the `assets` toolset, which reads local files, stays off in HTTP mode unless `STEAM_MCP_HTTP_ALLOW_ASSETS=1`.
- `launch-readiness` MCP prompt: PASS/FAIL checklist from the art folder plus the live store page, regional prices, and Deck status. `competitor-snapshot` now uses `steam_compareApps`. (#43)
- MCP prompts: `competitor-snapshot`, `achievement-health`, `review-digest`, `regional-price-audit`, and `workshop-health`. MCP resources: `steam://specs/store-assets`, `steam://enums/eresult`, `steam://enums/ugc-query-type`, `steam://enums/review-filters`, and the `steam://app/{appid}/summary` template. (#62)
- `steam_validateStoreAsset` checks four more slots: `achievementIcon` (256x256 JPG), `communityIcon` (184x184 JPG), `eventCover` (800x450), and `eventHeader` (1920x622). With slot `achievementIcon`, `path` can be a directory: every icon is checked and each `<name>_achieved` must have a `<name>_unachieved`. Partner `steam_uploadStoreImage` accepts only the slots it can upload. (#66)
- Toolsets: `STEAM_MCP_TOOLSETS` picks which tool groups load (`store`, `community`, `publisher`, `mutations`, `sdk`, `assets`, or `all`), and `STEAM_MCP_READ_ONLY=1` removes `mutations` even if listed. A `steam://server-info` MCP resource reports what is enabled. **Breaking:** the five live-mutation tools are now off by default. Set `STEAM_MCP_TOOLSETS=all` (or include `mutations`) to load them. (#61)
- `steam_getPlayerSummary`, `steam_getOwnedGames`, and `steam_getPlayerAchievements` accept a Steam64 ID, a profile URL (`/profiles/...` or `/id/...`), a vanity name, or a SteamID2/SteamID3. Vanities resolve through ResolveVanityURL (cached for an hour), and the output includes `resolved_from`. Write tools still require a literal Steam64 ID so a resolution mistake cannot redirect a mutation. (#44)
- Public GET responses are cached in memory for a short time (player count 30s; store data, news, and reviews 10 min; achievement schema and global percentages 1h). Identical concurrent requests share one call. Per-user and Partner API responses are never cached. `STEAM_MCP_CACHE_TTL=0` disables the cache. Requests also wait for a per-host rate-limit token, so bursts such as `steam_getRegionalPricing` queue instead of tripping the Store's 429. (#45)
- `steam_getLeaderboardEntries` accepts `leaderboard_name` (API or display name) instead of `leaderboardid`. The name is resolved through GetLeaderboardsForGame, and the output includes `resolved_from`; an unknown name lists the boards that exist. A `steam_uploadLeaderboardScore` dry run also accepts `leaderboard_name` and shows the resolved `leaderboardid`, while the live call still requires the numeric ID so the confirmed board is the one written. (#80)
- **Breaking:** a live `steam_grantInventoryItem` call (`dry_run: false`) requires `requestid`. Pass the value the dry run generated. A live call used to make up its own ID when none was given, so a retry could grant the item twice. Values above the uint64 maximum are rejected. (#92)
- `steam_setAchievement` and `steam_clearAchievement` accept `achievements` (1-100 API names) as an alternative to `achievement`. They change all of them in one `SetUserStatsForGame` call, so resetting a test account takes one dry run and one confirmation. The dry-run plan lists every name. (#91)
- Structured output: `steam_getPlayerCount`, `steam_getAppReviewSummary`, and `steam_getPriceOverview` declare an `outputSchema` and return `structuredContent` next to the unchanged JSON text block, so clients can read typed fields without re-parsing text. (#93)
- A documentation site at https://tmhsdigital.github.io/steam-mcp/ with setup for each MCP client and a reference of every tool, its inputs, and the key it needs. It is generated from the registered tools, and a test fails when it is out of date.
- `STEAM_MCP_DEBUG=1` logs every Steam request to stderr and to MCP logging notifications: method, host and path, query parameter names (never values), status, attempt number, latency, and retry waits. A startup line reports the version, tool count, and whether `STEAM_API_KEY` is set. (#67)

### Fixed

- The asset tools (`steam_validateStoreAsset`, `steam_validateStoreAssetDir`, and the Partner-admin upload tools) read only regular local files and folders. Network and device paths are refused before any file access, symbolic links are not followed, reads are capped through one file handle, and errors no longer include raw OS messages.
- `steam_getPriceOverview` and `steam_getRegionalPricing` no longer report `free: true` when Steam lists no price. That response also covers coming-soon, delisted, and unavailable paid games, so it now returns `price_overview: null` with `reason: "no_price_listed"`. **Breaking:** the `free` field is gone. The regional default list uses `DE` instead of the non-country `EU`, failed regions keep their error message and `error_type`, and regional lookups run at most four at a time. Contributed by @ect2000. (#33)
- SDK guide tools escape titles, descriptions, paths, tags, and lobby metadata as proper string literals in C++, C#, and GDScript, so quotes, Windows backslashes, and line breaks no longer break the generated code. Contributed by @ect2000. (#36)
- SDK guides compile against their bindings and use every input. `steam_createLobby`'s C# uses Steamworks.NET's real enum names (`ELobbyType.k_ELobbyTypePublic`), and its GDScript callback no longer shadows `connect`. `steam_uploadWorkshopItem` now returns the C# (Steamworks.NET) block its description promised, and its GDScript sets the description and tags. The C++ and C# examples register their call results. (#54)
- `steam_getReviews` and `steam_getAppReviewSummary` now call `IUserReviewsService/GetAppReviews`. Valve disabled the Store `/appreviews` endpoint on 2026-10-22, so both tools failed on every call. Both remain keyless. `steam_getReviews` adds a `funny` sort and accepts a comma-separated `language` list. `steam_getAppReviewSummary` now counts all purchase types, matching the store page total. (#27)
- `steam_setAchievement` and `steam_clearAchievement` report success only when Steam returns EResult 1. A response with no `result` object used to read as success. Failures now include the EResult. (#52)
- `steam_grantInventoryItem` sends the documented AddItem parameters: one `itemdefid[n]` per copy (`quantity` capped at 100), `notify` as `1`/`0`, and a `requestid` so Steam executes a grant at most once. The dry run generates a `requestid`; pass it to the live call. New optional `itempropsjson` input. (#28)
- `steam_updateWorkshopItem` sends the API key and fields in the POST body instead of the URL, checks for a `response` object before reporting success, and gives the publisher-key hint on HTTP 400/403. (#29)

- `steamFetch` parses `Retry-After` as seconds or an HTTP-date. It used to compute `NaN` for dates and retry with no delay during a rate limit. 502/503/504 are now retried with jittered backoff. A non-JSON body reports its content type and first 100 characters, so a retired endpoint returning HTML is obvious. (#34)
- Error messages no longer tell users to set `STEAM_API_KEY` when it is already set. A bad key is detected from Steam's 403 page and reported as such. `steam_getPlayerAchievements` says "profile or game details are private" on 403 and "no stats or invalid parameters" on 400. Write tools give the publisher-key hint only on 401/403. Steam's `X-eresult` / `X-error_message` headers (or a JSON `error` field) are included whenever present. (#55)

- `steam_queryWorkshop` replaces the integer `query_type` with a `sort` enum (`vote`, `date`, `trend`, `text_search`, `subscriptions`, `playtime`, `updated`) mapped to the correct `EPublishedFileQueryType` values. The old description had "trending" pointing at AcceptedForGame. `requiredtags` is now an array sent as `requiredtags[n]`, with new `match_all_tags`, `excludedtags`, `days`, `return_tags`, and `return_previews` inputs. A search defaults to relevance ordering. **Breaking:** callers passing `query_type` or a comma-separated `requiredtags` string must switch to `sort` and an array. (#53)

- `steam_getLeaderboardsForGame` calls `partner.steam-api.com` and says it needs a publisher key. Valve documents `ISteamLeaderboards` as a publisher interface; the tool claimed a free key was enough. A 401/403 now explains the key and IP-allowlist requirement. (#64)
- Partner `steam_uploadTrailer` no longer advertises a live upload it cannot perform. It is now plan-only: no `confirm` input, annotated read-only, and `dry_run: false` returns `isError` with `[NOT_IMPLEMENTED]` instead of a success-shaped `ok: false`. (#65)
- Partner `steam_uploadStoreImage` refuses an unconfirmed live call through the shared `refusal()` (`isError` plus `[CONFIRM_REQUIRED]`), matching the default-bin write tools. A failed pre-upload validation is also `isError`. (#22)
- `steam_validateStoreAsset` accepts a correctly sized `libraryHero` PNG that is palette-indexed, grayscale, 16-bit, or interlaced (for example after pngquant). Such files used to fail with a `PARSE` error. Only the hero heuristics need decoded pixels, so they are skipped with a `HERO_HEURISTICS_SKIPPED` warning. (#78)
- `steam_validateStoreAssetDir` recognizes screenshots named after a scene, such as `screenshot_main_menu.png` or `ss_hero_fight.png`. The slot word in the name used to win, so these were checked as `mainCapsule` or `libraryHero` and failed. A name starting with `ss` now counts as a screenshot only when a digit or separator follows. (#77)
- `steam_getAppDetails` and `steam_compareApps` no longer fail when store HTML contains a numeric entity above U+10FFFF (such as `&#x110000;`). `stripHtml` leaves out-of-range entities as they are instead of throwing a `RangeError`. (#81)
- `steam_getSalesSummary` rejects impossible dates such as `2024-02-30` or `2024-13-01` with "not a valid date". It used to roll `2024-02-30` over to March 1 and sum that day, or report a misleading "end_date is before start_date". (#82)
- `STEAM_API_KEY` is trimmed in every tool, as `STEAM_FINANCIAL_API_KEY` already was, so a key pasted with a trailing space or newline no longer gets a 403 from most tools while the sales tools accept it. `steam_getGlobalStatsForGame` reads the key through the shared helper, and `steam_getLeaderboardEntries` gives the publisher-key and IP-allowlist guidance on 401/403 like the other partner tools. (#86)
- HTTP transport: a request body over 1 MiB now gets a `413` JSON-RPC error. The server used to destroy the request mid-upload, so the client saw a connection reset. Tests now cover this, the 500 path, the `getGlobalStatsForGame` schema fallback, the `steam://app/{appid}/summary` resource, and cookie redaction on a failed Partner upload. (#87)

### Changed

- **License is now CC BY-ND 4.0** (was CC BY-NC-ND 4.0). You can use the server for commercial work, including at a studio and for commercial games. Distributing modified versions is still not allowed. Versions 0.9.0 and earlier stay under CC BY-NC-ND 4.0. (#40)
- README has a Configuration table covering every environment variable, including `STEAM_MCP_TRANSPORT`, `HOST`/`PORT`, and the Partner-admin settings. `.env.example` lists all of them with defaults, and notes that the server does not load `.env` (but `docker run --env-file` does). (#90)
- README onboarding starts with a one-snippet npx quick start and adds setup for Claude Desktop, Claude Code, VS Code, and Windsurf, plus a troubleshooting table. Removed the `.env` instructions: the server never loaded `.env`. (#39)
- Large outputs are capped by default to save agent context (#35):
  - `steam_getAppDetails` returns a compact summary (about 2 KB instead of about 30 KB). `detail: "full"` returns every field, `fields` picks specific ones. Store HTML is stripped and long text truncated unless `include_html: true`.
  - `steam_getOwnedGames` returns `game_count`, `total_playtime_minutes`, and the top 50 games by playtime. New `sort` (`playtime`, `recent`, `name`), `limit`, and `appids` inputs.
  - `steam_getSchemaForGame` returns up to 100 achievements without icon URLs, plus `achievement_count`. New `limit`, `include_icons`, and `include_stats` inputs.
  - These three tools emit compact JSON.
- Every read tool and both SDK guides now return compact JSON instead of 2-space pretty-printed JSON, about 20% less agent context on large results such as reviews and Workshop queries. Dry-run plans and the small write-tool results stay pretty. `steam_getLeaderboardEntries` returns at most 500 entries per call (`rangeend` is inclusive), and the error says which range to request next. (#89)
- **Requires Node.js 22 or later.** Node 20 reached end of life on 2026-04-30. CI tests Node 22 and 24. (#56)
- Release pipeline: the publish job uses Node 24's bundled npm instead of an unpinned `npm@latest`, and all release-path actions are pinned by commit SHA. npm publishing uses trusted publishing only; there is no long-lived npm token. (#56)
- Each release publishes the HTTP Docker image to `ghcr.io/tmhsdigital/steam-mcp` (`:<version>` and `:latest`) after the same smoke test CI runs. (#48)
- `@modelcontextprotocol/sdk` now requires `^1.32.0`, the version line CI tests. The old `^1.12.1` floor predates the SDK's zod v4 support, so a host with an older SDK in its tree could resolve one that cannot handle these schemas. The lockfile refresh moves hono to 4.13.20 and @hono/node-server to 2.1.11, so `npm audit` reports 0 vulnerabilities. vitest is now 5.1.1. (#83)
- The stale bot no longer closes issues. Issues are labeled stale after 60 days; security, high/critical priority, decision, pinned, and milestoned items are exempt. PRs still close 7 days after going stale. (#41)
- The server version is read from `package.json` at runtime, so a release bump touches only `package.json` and the CHANGELOG. A test fails if the tool counts in the README, CLAUDE.md, or package description drift from the registered tools. CI type-checks the Partner-admin code (`tsconfig.partner.json`), which the published build excludes. (#38)
- Tests now run against the real registered tools: every tool has a success and an error-path handler test with a stubbed `fetch`, input validation uses the tools' own schemas instead of copies, and CI enforces a coverage floor. A nightly `Live contract check` workflow calls every no-auth tool against real Steam and opens an issue when one breaks. (#37)
- Removed `getApiKey()`, a duplicate of `requireApiKey()`. `SteamApiError.endpoint` no longer includes the query string, so it never carries the API key.
- All five write tools share one publisher-key error path (`publisherErrorResponse` in `src/utils/steam-api.ts`).
- Every tool now registers with `registerTool()` instead of the deprecated `server.tool()`, and declares a `title` and MCP `annotations`. Read tools are `readOnlyHint: true`. Confirm-gated writes are `destructiveHint: true`, so hosts can prompt before calling them. SDK guides and `steam_validateStoreAsset` are `openWorldHint: false`. A test enforces annotations on every tool. (#32)

### Security

- `steam_validateStoreAsset` can no longer be made to allocate unbounded memory. It refuses files over 50 MB before reading, decodes library-hero pixels only after the IHDR size matches 3840x1240, caps decoding at 16M pixels, and limits inflate to the size the header declares. A deflate bomb or a forged IHDR now returns a `PARSE` or `SIZE` error instead of crashing the server. (#57)
- Partner `steam_uploadStoreImage` cookie jar: `#HttpOnly_` rows (including `steamLoginSecure`) are now read, only unexpired cookies for Steam domains matching the request host are sent, and every jar value is redacted from output. Live uploads no longer follow redirects, so an expired session returns `[AUTH_MISSING]` instead of a 200 from the login page. Success requires Partner's `success` flag. Uploads time out after 60s. (#30)
- Upgraded `zod` to 4.x (GHSA-mrhx-c7xc-m3w5) and `@modelcontextprotocol/sdk` to 1.32.2. `npm audit` is clean. CI now fails on high-severity runtime advisories, and Dependabot covers npm. (#31)

## [0.9.0] - 2026-09-17

### Security

- All five default-bin Partner API write tools (`steam_grantInventoryItem`, `steam_setAchievement`, `steam_clearAchievement`, `steam_uploadLeaderboardScore`, `steam_updateWorkshopItem`) now default to `dry_run: true` and refuse to contact Steam unless `confirm: true`.
- `steam_getReviews`, `steam_queryWorkshop`, `steam_getWorkshopItem`, and `steam_getNewsForApp` label untrusted free text (user-authored or third-party) so agents treat it as data to summarize, not as commands. The label is defense in depth. The confirm gate is the control. `steam_getPlayerSummary` and `steam_getAppDetails` are deliberately unlabeled.
- Reported by Syed Anas Mohiuddin, Independent Researcher, Maintainer of mcp-safeguard

### Changed

- Package copy now counts 5 write tools and 2 SDK code-example generators, instead of grouping both as 7 write tools.
- Shared confirm/dry-run helpers live in `src/utils/confirm.ts` and are used by both the default bin and the Partner-admin process.

**BREAKING CHANGE:** write tools no-op by default. Callers that invoked them with no flags previously sent a live POST. They now receive a dry-run plan and send nothing. To execute for real, pass `dry_run: false` and `confirm: true`.
