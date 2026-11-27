export interface EnvFlagOptions {
  strict?: boolean;
}

/**
 * Parse a boolean environment flag. Ordinary switches accept 1, true, and yes
 * after trimming surrounding whitespace and normalizing case. Strict switches
 * keep their narrower operator contract.
 */
export function envFlag(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  options: EnvFlagOptions = {},
): boolean {
  const value = env[name]?.trim().toLowerCase();
  if (options.strict) {
    return value === "1";
  }
  return value === "1" || value === "true" || value === "yes";
}
