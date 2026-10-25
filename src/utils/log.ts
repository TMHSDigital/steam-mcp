// Opt-in debug logging. stdout is the MCP channel, so lines go to stderr, and
// optionally to the client via MCP logging notifications. Never pass secrets:
// use describeUrl() for anything that may carry a key.

type Sink = (line: string) => void;

let mcpSink: Sink | undefined;

export function debugEnabled(): boolean {
  const v = process.env.STEAM_MCP_DEBUG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Also forward debug lines to the MCP client (server.sendLoggingMessage). */
export function setMcpLogSink(sink: Sink | undefined): void {
  mcpSink = sink;
}

export function debug(message: string): void {
  if (!debugEnabled()) return;
  const line = `[steam-mcp] ${message}`;
  process.stderr.write(`${line}\n`);
  try {
    mcpSink?.(line);
  } catch {
    // Logging must never break a tool call.
  }
}

/** host + path + query keys only. Values are dropped, so a key can never appear. */
export function describeUrl(url: string): string {
  try {
    const u = new URL(url);
    const keys = [...new Set(u.searchParams.keys())];
    return `${u.host}${u.pathname}${keys.length ? ` ?${keys.join(",")}` : ""}`;
  } catch {
    return "<unparseable url>";
  }
}
