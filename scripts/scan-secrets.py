#!/usr/bin/env python3
"""Fail CI if a Steam key, partner cookie, or other credential looks committed.

Follows the Game-Systems secret-scanning contract for tool repos:

- Scans git-tracked files, so a local gitignored .env is allowed on disk.
- Every assignment rule accepts `=` or `:`, quoted or unquoted, so .env,
  JSON (an MCP client config), YAML, and TOML forms all match.
- Docs are scanned. The skip list below names exact files and binary
  types; review it when adding to it.
- Findings print the rule id, file, and line, never the matched value.
- `--selftest` runs one string that must match and one look-alike that
  must not for every rule. CI runs it before the scan.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Exact files that may name secrets without holding them.
SKIP_FILES = {
    "package-lock.json",  # lockfile: integrity hashes are long hex
    ".env.example",  # template: placeholders only
    "scripts/scan-secrets.py",  # this file: rule patterns and self-test strings
}

# Binary formats that cannot hold a readable secret.
SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".woff2", ".ico"}

# Generated or vendored trees; never tracked, listed in case they ever are.
SKIP_DIR_PREFIXES = ("node_modules/", "dist/", "coverage/")

# Optional quote around a key name, then = or :, then an optional quote.
ASSIGN = r"""["']?\s*[:=]\s*["']?"""

RULES: list[tuple[str, re.Pattern[str]]] = [
    (
        "steam-web-api-key",
        re.compile(r"(?:STEAM_API_KEY|STEAM_FINANCIAL_API_KEY|STEAM_PUBLISHER_KEY|steam_?api_?key)" + ASSIGN + r"[0-9a-fA-F]{32}\b"),
    ),
    (
        "steam-partner-cookie",
        re.compile(r"steamLoginSecure" + ASSIGN + r"""(?![*\[/^<.])[^\s"'<>]{8,}"""),
    ),
    (
        "steam-partner-cookie-jar",
        re.compile(r"STEAM_PARTNER_COOKIES" + ASSIGN + r"""(?![<$.])[^"'\s#,}]{3,}"""),
    ),
    (
        "private-key-block",
        re.compile(r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----"),
    ),
]

# A tracked .env file is a finding by its name alone.
DOTENV = re.compile(r"(^|/)\.env(\.[^/]*)?$")
DOTENV_ALLOWED = {".env.example"}

SELFTEST: dict[str, tuple[str, str]] = {
    # rule id: (must match, look-alike that must not)
    "steam-web-api-key": (
        '"STEAM_API_KEY": "' + "0123456789abcdef" * 2 + '"',
        '"STEAM_API_KEY": "your_key_here"',
    ),
    "steam-partner-cookie": (
        "steamLoginSecure=" + "7656119" + "8000000000%7C%7Cabc",
        "steamLoginSecure=<redacted>",
    ),
    "steam-partner-cookie-jar": (
        "STEAM_PARTNER_COOKIES: C:/secrets/jar.txt",
        "STEAM_PARTNER_COOKIES=$HOME_PLACEHOLDER",
    ),
    "private-key-block": (
        "-----BEGIN " + "RSA PRIVATE KEY-----",
        "-----BEGIN PUBLIC KEY-----",
    ),
}


def tracked_files() -> list[str]:
    proc = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True)
    return [p.decode("utf-8", errors="replace").replace("\\", "/") for p in proc.stdout.split(b"\0") if p]


def skipped(rel: str) -> bool:
    return (
        rel in SKIP_FILES
        or rel.startswith(SKIP_DIR_PREFIXES)
        or Path(rel).suffix.lower() in SKIP_SUFFIXES
    )


def scan_text(text: str) -> list[tuple[str, int]]:
    hits: list[tuple[str, int]] = []
    for rule_id, pattern in RULES:
        for match in pattern.finditer(text):
            hits.append((rule_id, text.count("\n", 0, match.start()) + 1))
    return hits


def selftest() -> int:
    failures = []
    ids = {rule_id for rule_id, _ in RULES}
    if ids != set(SELFTEST):
        failures.append(f"self-test cases {sorted(SELFTEST)} do not match rules {sorted(ids)}")
    for rule_id, (positive, negative) in SELFTEST.items():
        pattern = dict(RULES)[rule_id]
        if not pattern.search(positive):
            failures.append(f"{rule_id}: did not match its positive case")
        if pattern.search(negative):
            failures.append(f"{rule_id}: matched its look-alike")
    if not DOTENV.search(".env.production") or DOTENV.search("docs/env.md"):
        failures.append("dotenv-file: name check is wrong")
    for failure in failures:
        print(f"self-test failed: {failure}", file=sys.stderr)
    if not failures:
        print(f"Secret-scan self-test passed ({len(SELFTEST)} rules, plus dotenv-file).")
    return 1 if failures else 0


def main() -> int:
    if "--selftest" in sys.argv[1:]:
        return selftest()

    findings: list[str] = []
    scanned = 0
    for rel in tracked_files():
        if DOTENV.search(rel) and Path(rel).name not in DOTENV_ALLOWED:
            findings.append(f"{rel}: dotenv-file (a .env file is tracked)")
            continue
        if skipped(rel):
            continue
        path = ROOT / rel
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            print(f"skip unreadable {rel}: {exc}", file=sys.stderr)
            continue
        scanned += 1
        findings.extend(f"{rel}:{line}: {rule_id}" for rule_id, line in scan_text(text))

    if findings:
        print("Secret scan failed (values are not shown):", file=sys.stderr)
        for finding in findings:
            print(f"  {finding}", file=sys.stderr)
        return 1
    print(f"Secret scan clean ({scanned} tracked files).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
