type GuideLanguage = "cpp" | "csharp" | "gdscript";

/** Return a quoted source literal, not a JSON-encoded code fragment. */
export function escapeStringLiteral(value: string, language: GuideLanguage): string {
  if (language !== "cpp") {
    return JSON.stringify(value)
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  // Fixed-width octal preserves UTF-8 bytes without consuming a following digit.
  const escaped = Array.from(Buffer.from(value, "utf8"), (byte) => {
    if (byte === 0x22) return '\\"';
    if (byte === 0x5c) return "\\\\";
    if (byte >= 0x20 && byte <= 0x7e) return String.fromCharCode(byte);
    return `\\${byte.toString(8).padStart(3, "0")}`;
  }).join("");
  return `"${escaped}"`;
}
