import { createRequire } from "node:module";

// package.json is the single source of truth for the version. This file sits
// one level below the package root in both src/ and dist/, and npm always
// ships package.json, so the relative path resolves in every layout.
const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

export const VERSION = pkg.version;
