import { z } from "zod";

export const confirmSchema = {
  dry_run: z
    .boolean()
    .optional()
    .describe(
      "If true (default), return the planned request without contacting Steam",
    ),
  confirm: z
    .boolean()
    .optional()
    .describe("Required true when dry_run is false. Refuses otherwise."),
};

export function refuseIfUnconfirmed(
  dryRun: boolean,
  confirm: boolean | undefined,
): string | null {
  if (!dryRun && confirm !== true) {
    return "confirm must be true when dry_run is false. No request was sent.";
  }
  return null;
}

export function refusal(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: "text" as const, text: `[CONFIRM_REQUIRED] ${message}` }],
    isError: true,
  };
}

export function dryRunResponse(
  tool: string,
  plan: Record<string, unknown>,
): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            dry_run: true,
            tool,
            would_send: plan,
            note: "Nothing was sent. Re-run with dry_run: false and confirm: true to execute for real.",
          },
          null,
          2,
        ),
      },
    ],
  };
}
