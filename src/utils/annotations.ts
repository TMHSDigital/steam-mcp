import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

// MCP tool annotations. Hosts use these to decide when to prompt the user
// before a call and how to label the tool. They are hints, not the control:
// live mutations are still gated by confirmSchema in ./confirm.ts.

/** Reads public or keyed data from Steam. */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: true,
};

/** Runs locally only: code generators and file checks. No network. */
export const LOCAL_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
};

/** Mutates live Steam state. Every tool using this must spread confirmSchema. */
export const LIVE_WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/** A live write where repeating the same call has no further effect. */
export const LIVE_WRITE_IDEMPOTENT: ToolAnnotations = {
  ...LIVE_WRITE,
  idempotentHint: true,
};
