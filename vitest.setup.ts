import { beforeEach } from "vitest";
import { clearCache, resetRateLimits } from "./src/utils/cache.js";

// Tests stub fetch per case, so a cached response from one test must not leak
// into the next. cache.test.ts re-enables caching explicitly.
process.env.STEAM_MCP_CACHE_TTL = "0";

beforeEach(() => {
  clearCache();
  resetRateLimits();
});
