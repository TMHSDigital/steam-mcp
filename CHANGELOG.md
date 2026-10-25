# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `steam_getReviews` and `steam_getAppReviewSummary` now call `IUserReviewsService/GetAppReviews`. Valve disabled the Store `/appreviews` endpoint on 2026-10-22, so both tools failed on every call. Both remain keyless. `steam_getReviews` adds a `funny` sort and accepts a comma-separated `language` list. `steam_getAppReviewSummary` now counts all purchase types, matching the store page total. (#27)
- `steam_setAchievement` and `steam_clearAchievement` report success only when Steam returns EResult 1. A response with no `result` object used to read as success. Failures now include the EResult. (#52)
- `steam_grantInventoryItem` sends the documented AddItem parameters: one `itemdefid[n]` per copy (`quantity` capped at 100), `notify` as `1`/`0`, and a `requestid` so Steam executes a grant at most once. The dry run generates a `requestid`; pass it to the live call. New optional `itempropsjson` input. (#28)
- `steam_updateWorkshopItem` sends the API key and fields in the POST body instead of the URL, checks for a `response` object before reporting success, and gives the publisher-key hint on HTTP 400/403. (#29)

- `steamFetch` parses `Retry-After` as seconds or an HTTP-date. It used to compute `NaN` for dates and retry with no delay during a rate limit. 502/503/504 are now retried with jittered backoff. A non-JSON body reports its content type and first 100 characters, so a retired endpoint returning HTML is obvious. (#34)
- Error messages no longer tell users to set `STEAM_API_KEY` when it is already set. A bad key is detected from Steam's 403 page and reported as such. `steam_getPlayerAchievements` says "profile or game details are private" on 403 and "no stats or invalid parameters" on 400. Write tools give the publisher-key hint only on 401/403. Steam's `X-eresult` / `X-error_message` headers (or a JSON `error` field) are included whenever present. (#55)

- `steam_queryWorkshop` replaces the integer `query_type` with a `sort` enum (`vote`, `date`, `trend`, `text_search`, `subscriptions`, `playtime`, `updated`) mapped to the correct `EPublishedFileQueryType` values. The old description had "trending" pointing at AcceptedForGame. `requiredtags` is now an array sent as `requiredtags[n]`, with new `match_all_tags`, `excludedtags`, `days`, `return_tags`, and `return_previews` inputs. A search defaults to relevance ordering. **Breaking:** callers passing `query_type` or a comma-separated `requiredtags` string must switch to `sort` and an array. (#53)

### Changed

- **Requires Node.js 22 or later.** Node 20 reached end of life on 2026-04-30. CI tests Node 22 and 24. (#56)
- Release pipeline: the publish job uses Node 24's bundled npm instead of an unpinned `npm@latest`, and all release-path actions are pinned by commit SHA. (#56)
- The stale bot no longer closes issues. Issues are labeled stale after 60 days; security, high/critical priority, decision, pinned, and milestoned items are exempt. PRs still close 7 days after going stale. (#41)
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
