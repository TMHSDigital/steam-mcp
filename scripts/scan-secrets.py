#!/usr/bin/env python3
"""Fail CI if partner cookies or API keys look committed.

Scans git-tracked files only so a local gitignored .env is allowed.
Excludes documentation and lockfiles so naming the variables is allowed.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SKIP_NAMES = {
    "package-lock.json",
    ".env.example",
    "SECURITY.md",
    "scan-secrets.py",
}

SKIP_SUFFIXES = {
    ".md",
    ".mdc",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".woff2",
    ".ico",
}

SKIP_DIR_PREFIXES = (
    "rules/",
    "node_modules/",
    "dist/",
)

PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"""STEAM_API_KEY\s*=\s*["']?[0-9a-fA-F]{32}"""),
        "STEAM_API_KEY assigned a 32-char hex value",
    ),
    (
        re.compile(
            r"""steamLoginSecure\s*=\s*["']?(?![*\[/^])[^\s"'<>]{8,}"""
        ),
        "steamLoginSecure cookie assignment",
    ),
    (
        re.compile(r"""STEAM_PARTNER_COOKIES\s*=\s*["']?[^"'\s#]+"""),
        "STEAM_PARTNER_COOKIES assigned a non-empty value",
    ),
]


def tracked_files() -> list[Path]:
    proc = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    out: list[Path] = []
    for rel in proc.stdout.split(b"\0"):
        if not rel:
            continue
        text = rel.decode("utf-8", errors="replace").replace("\\", "/")
        if text in SKIP_NAMES or Path(text).name in SKIP_NAMES:
            continue
        if any(text.startswith(prefix) for prefix in SKIP_DIR_PREFIXES):
            continue
        path = ROOT / text
        if path.suffix.lower() in SKIP_SUFFIXES:
            continue
        if path.is_file():
            out.append(path)
    return out


def main() -> int:
    files = tracked_files()
    hits: list[str] = []
    for path in files:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            print(f"skip unreadable {path}: {exc}", file=sys.stderr)
            continue
        rel = path.relative_to(ROOT).as_posix()
        for pattern, label in PATTERNS:
            if pattern.search(text):
                hits.append(f"{rel}: {label}")
    if hits:
        print("Secret-pattern scan failed:", file=sys.stderr)
        for hit in hits:
            print(f"  {hit}", file=sys.stderr)
        return 1
    print(f"Secret-pattern scan clean ({len(files)} tracked files).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())



if __name__ == "__main__":
    raise SystemExit(main())
