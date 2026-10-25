#!/usr/bin/env node
// Live contract check: calls every no-auth tool against real Steam with stable
// inputs and fails if a call errors or the output loses an expected field.
// Catches endpoint retirements (like /appreviews in October 2026) before users do.
// Run after `npm run build`: node scripts/contract-check.mjs

import { registerAllTools } from "../dist/tools/index.js";

const handlers = new Map();
registerAllTools({
  registerTool(name, _config, handler) {
    handlers.set(name, handler);
  },
});

/** [tool, args, required JSON paths in the output] */
const CHECKS = [
  ["steam_getAppDetails", { appid: 440 }, ["name", "steam_appid", "is_free"]],
  ["steam_searchApps", { query: "portal 2" }, ["0.id", "0.name"]],
  ["steam_getPlayerCount", { appid: 440 }, ["player_count"]],
  ["steam_getAchievementStats", { appid: 440 }, ["achievements.0.name", "achievements.0.percent"]],
  ["steam_getWorkshopItem", { publishedfileid: "160250458" }, ["publishedfileid", "title", "consumer_app_id"]],
  ["steam_getReviews", { appid: 440, num_per_page: 2 }, ["query_summary.num_reviews", "reviews.0.review", "cursor"]],
  ["steam_getAppReviewSummary", { appid: 440 }, ["total_reviews", "review_score_desc", "positive_percentage"]],
  ["steam_getPriceOverview", { appids: [620], cc: "US" }, ["prices.620"]],
  ["steam_getRegionalPricing", { appid: 620, countries: ["US", "DE"] }, ["regions.US", "regions.DE"]],
  ["steam_getNewsForApp", { appid: 440, count: 1 }, ["newsitems.0.title"]],
];

function get(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const failures = [];
for (const [tool, args, paths] of CHECKS) {
  const handler = handlers.get(tool);
  if (!handler) {
    failures.push(`${tool}: not registered`);
    continue;
  }
  try {
    const result = await handler(args);
    const text = result.content?.[0]?.text ?? "";
    if (result.isError) {
      failures.push(`${tool}: isError: ${text.slice(0, 300)}`);
      continue;
    }
    const data = JSON.parse(text);
    const missing = paths.filter((p) => get(data, p) === undefined);
    if (missing.length) {
      failures.push(`${tool}: missing ${missing.join(", ")}`);
    } else {
      console.log(`ok   ${tool}`);
    }
  } catch (error) {
    failures.push(`${tool}: threw ${error instanceof Error ? error.message : String(error)}`);
  }
  // Stay well under the Store's rate limit.
  await new Promise((r) => setTimeout(r, 1000));
}

if (failures.length) {
  console.error("\nContract check failed:");
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log(`\nAll ${CHECKS.length} live contract checks passed.`);
