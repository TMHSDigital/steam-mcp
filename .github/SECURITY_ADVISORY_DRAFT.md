# GitHub Security Advisory Draft

Paste into a GitHub Security Advisory when publishing. Do not request a CVE from this draft.

## Title

Ungated Steam Partner API write tools in the default MCP server bin

## Severity

Medium

Suggested CVSS 3.1 vector (5.3 Medium):

`CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:H/A:N`

Rationale: an unauthenticated Steam user can author review or Workshop text that an agent later loads. Integrity impact is high if that agent then invokes a publisher-key write tool. Attack complexity is high because the MCP host must have a publisher Web API key configured and the agent must treat untrusted text as instructions. User interaction is required (the operator or agent must fetch the untrusted content).

## CWE

CWE-862 Missing Authorization

(The publisher API key is still required. What was missing is a confirmation step before a live mutation.)

## Affected versions

`@tmhs/steam-mcp` <= 0.8.0

## Patched version

`@tmhs/steam-mcp` 0.9.0

## Summary

Five tools registered in the default `steam-mcp` bin POST to the live Steam Partner Web API as soon as they are invoked. They had no dry-run default, no confirmation flag, and no code path that could refuse an unconfirmed call. The same repository already gated Partner-admin image and trailer uploads behind `refuseIfUnconfirmed` plus a separate process requiring `STEAM_PARTNER_ADMIN=1`. The five default-bin write tools had neither layer.

Two read tools in the original report (`steam_getReviews`, `steam_queryWorkshop`) returned Steam user-authored text into the agent context without labeling it as untrusted. `steam_getWorkshopItem` is the same class (Workshop title and description). That is the injection path that can reach the ungated sinks.

## Impact

An agent with this server enabled and a Steam publisher Web API key in `STEAM_API_KEY` can grant inventory items, set or clear achievements, upload leaderboard scores, or update Workshop item metadata without an explicit confirmation from the operator.

## Affected write tools (0.8.0 and earlier)

- `steam_grantInventoryItem` -> `IInventoryService/AddItem`
- `steam_setAchievement` -> `ISteamUserStats/SetUserStatsForGame`
- `steam_clearAchievement` -> `ISteamUserStats/SetUserStatsForGame`
- `steam_uploadLeaderboardScore` -> `ISteamLeaderboards/SetLeaderboardScore`
- `steam_updateWorkshopItem` -> `IPublishedFileService/UpdateDetails`

## Injection path (read tools)

- `steam_getReviews` returns full review bodies.
- `steam_queryWorkshop` returns Workshop `title` and `short_description`.
- `steam_getWorkshopItem` returns Workshop `title` and `description`.

Those fields are authored by arbitrary Steam users. In 0.8.0 they were returned verbatim with no delimiting. 0.9.0 still returns the full text (it is not stripped) but labels it as untrusted data. The label is defense in depth. The confirm gate on write tools is the control.

## Remediation

Upgrade to `@tmhs/steam-mcp` 0.9.0. Write tools now default to `dry_run: true` and refuse to send unless `dry_run: false` and `confirm: true`.

## Credit

Reported by Syed Anas Mohiuddin, Independent Researcher, Maintainer of mcp-safeguard

Disclosed as part of an MCP-server security research effort.
