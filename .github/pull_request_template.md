## What and why

<!-- Link the issue: Fixes #123 -->

## Steam endpoint

<!-- URL of the Steam Web API / Store endpoint, and whether it needs no key, a Web API key, or a publisher key. -->

## Checklist

- [ ] `npm run build` and `npm test` pass
- [ ] New or changed tool has a handler test with a `fetch` fixture
- [ ] README tool table and counts updated (if tools were added, removed, or renamed)
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]`
- [ ] Tool uses `server.registerTool()` with `annotations`
- [ ] If the tool mutates live Steam state: it spreads `confirmSchema`, calls `refuseIfUnconfirmed` before any network I/O, runs the dry-run branch before `requireApiKey()`, and uses `LIVE_WRITE` annotations
- [ ] Commits are signed off (`git commit -s`), per CONTRIBUTING.md
