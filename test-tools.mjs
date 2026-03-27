import { spawn } from "child_process";

const server = spawn("node", ["dist/index.js"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env },
});

let buffer = "";
const results = {};

server.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && msg.id >= 10) {
        const content = msg.result?.content?.[0]?.text;
        if (msg.result?.isError) {
          results[msg.id] = `ERROR: ${content}`;
        } else {
          const parsed = JSON.parse(content);
          results[msg.id] = parsed;
        }
      }
    } catch {}
  }
});

server.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

function send(obj) {
  server.stdin.write(JSON.stringify(obj) + "\n");
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  },
});

await new Promise((r) => setTimeout(r, 1000));

send({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "steam.getAppDetails", arguments: { appid: 1145360 } } });
send({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "steam.searchApps", arguments: { term: "Hollow Knight" } } });
send({ jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "steam.getPlayerCount", arguments: { appid: 730 } } });
send({ jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "steam.getAchievementStats", arguments: { appid: 367520 } } });
send({ jsonrpc: "2.0", id: 14, method: "tools/call", params: { name: "steam.getWorkshopItem", arguments: { publishedfileid: "814498849" } } });

await new Promise((r) => setTimeout(r, 8000));

console.log("\n=== TEST RESULTS ===\n");

const tests = [
  [10, "getAppDetails (Hades)", (d) => d.name === "Hades" ? "PASS" : `FAIL: name=${d.name}`],
  [11, "searchApps (Hollow Knight)", (d) => Array.isArray(d) && d.length > 0 ? `PASS: ${d.length} results, first="${d[0].name}"` : "FAIL: no results"],
  [12, "getPlayerCount (CS2)", (d) => d.player_count > 0 ? `PASS: ${d.player_count.toLocaleString()} players` : "FAIL: no count"],
  [13, "getAchievementStats (Hollow Knight)", (d) => d.achievements?.length > 0 ? `PASS: ${d.achievements.length} achievements` : "FAIL: no achievements"],
  [14, "getWorkshopItem (814498849)", (d) => d.title ? `PASS: "${d.title}"` : "FAIL: no title"],
];

let passed = 0;
for (const [id, name, check] of tests) {
  const data = results[id];
  if (!data) {
    console.log(`  [FAIL] ${name}: no response received`);
  } else if (typeof data === "string" && data.startsWith("ERROR")) {
    console.log(`  [FAIL] ${name}: ${data}`);
  } else {
    const result = check(data);
    const status = result.startsWith("PASS") ? "PASS" : "FAIL";
    if (status === "PASS") passed++;
    console.log(`  [${status}] ${name}: ${result}`);
  }
}

console.log(`\n  ${passed}/5 no-auth tools passed\n`);

if (process.env.STEAM_API_KEY) {
  console.log("=== TESTING API-KEY TOOLS ===\n");

  send({ jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "steam.resolveVanityURL", arguments: { vanityurl: "gabelogannewell" } } });

  await new Promise((r) => setTimeout(r, 3000));

  const vanityResult = results[20];
  if (vanityResult?.steamid) {
    console.log(`  [PASS] resolveVanityURL: steamid=${vanityResult.steamid}`);
    const steamid = vanityResult.steamid;

    send({ jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "steam.getPlayerSummary", arguments: { steamid } } });
    send({ jsonrpc: "2.0", id: 22, method: "tools/call", params: { name: "steam.getOwnedGames", arguments: { steamid } } });
    send({ jsonrpc: "2.0", id: 23, method: "tools/call", params: { name: "steam.queryWorkshop", arguments: { appid: 440, numperpage: 3 } } });
    send({ jsonrpc: "2.0", id: 24, method: "tools/call", params: { name: "steam.getLeaderboardEntries", arguments: { appid: 239350, leaderboardid: 1 } } });

    await new Promise((r) => setTimeout(r, 8000));

    const keyTests = [
      [21, "getPlayerSummary", (d) => d.personaname ? `PASS: "${d.personaname}"` : "FAIL"],
      [22, "getOwnedGames", (d) => d.game_count > 0 ? `PASS: ${d.game_count} games` : "FAIL"],
      [23, "queryWorkshop (TF2)", (d) => d.items?.length > 0 ? `PASS: ${d.items.length} items` : "FAIL"],
      [24, "getLeaderboardEntries", (d) => d.totalLeaderBoardEntryCount !== undefined ? `PASS: ${d.totalLeaderBoardEntryCount} total entries` : `FAIL: ${JSON.stringify(d).slice(0,100)}`],
    ];

    let keyPassed = 0;
    for (const [id, name, check] of keyTests) {
      const data = results[id];
      if (!data) {
        console.log(`  [FAIL] ${name}: no response`);
      } else if (typeof data === "string") {
        console.log(`  [FAIL] ${name}: ${data}`);
      } else {
        const result = check(data);
        if (result.startsWith("PASS")) keyPassed++;
        console.log(`  [${result.startsWith("PASS") ? "PASS" : "FAIL"}] ${name}: ${result}`);
      }
    }
    console.log(`\n  ${keyPassed}/4 API-key tools passed`);
    console.log(`\n  TOTAL: ${passed + keyPassed + 1}/10 tools passed\n`);
  } else {
    console.log(`  [FAIL] resolveVanityURL: ${JSON.stringify(vanityResult).slice(0,100)}`);
  }
} else {
  console.log("STEAM_API_KEY not set -- skipping 5 API-key tools\n");
  console.log(`  TOTAL: ${passed}/5 no-auth tools tested (5 skipped)\n`);
}

server.kill();
