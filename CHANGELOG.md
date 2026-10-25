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

### Changed

- All five write tools share one publisher-key error path (`publisherErrorResponse` in `src/utils/steam-api.ts`).

## [0.9.0] - 2026-09-17

### Security

- All five default-bin Partner API write tools (`steam_grantInventoryItem`, `steam_setAchievement`, `steam_clearAchievement`, `steam_uploadLeaderboardScore`, `steam_updateWorkshopItem`) now default to `dry_run: true` and refuse to contact Steam unless `confirm: true`.
- `steam_getReviews`, `steam_queryWorkshop`, `steam_getWorkshopItem`, and `steam_getNewsForApp` label untrusted free text (user-authored or third-party) so agents treat it as data to summarize, not as commands. The label is defense in depth. The confirm gate is the control. `steam_getPlayerSummary` and `steam_getAppDetails` are deliberately unlabeled.
- Reported by Syed Anas Mohiuddin, Independent Researcher, Maintainer of mcp-safeguard

### Changed

- Package copy now counts 5 write tools and 2 SDK code-example generators, instead of grouping both as 7 write tools.
- Shared confirm/dry-run helpers live in `src/utils/confirm.ts` and are used by both the default bin and the Partner-admin process.

**BREAKING CHANGE:** write tools no-op by default. Callers that invoked them with no flags previously sent a live POST. They now receive a dry-run plan and send nothing. To execute for real, pass `dry_run: false` and `confirm: true`.
