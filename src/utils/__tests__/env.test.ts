import { describe, expect, it } from "vitest";
import { envFlag } from "../env.js";

describe("envFlag", () => {
  const falseCases: Array<[string, NodeJS.ProcessEnv]> = [
    ["unset", {}],
    ["empty", { NAME: "" }],
    ["whitespace", { NAME: " " }],
    ["zero", { NAME: "0" }],
    ["false", { NAME: "false" }],
    ["no", { NAME: "no" }],
  ];

  it.each(falseCases)("is false for %s", (_label, env) => {
    expect(envFlag("NAME", env)).toBe(false);
  });

  const trueCases: Array<[string, string]> = [
    ["1", "1"],
    ["1 with surrounding spaces", " 1 "],
    ["1 with a carriage return", "1\r"],
    ["true", "true"],
    ["TRUE", "TRUE"],
    ["yes", "yes"],
  ];

  it.each(trueCases)("accepts %s", (_label, value) => {
    expect(envFlag("NAME", { NAME: value })).toBe(true);
  });

  it("keeps the partner gate strict", () => {
    expect(envFlag("NAME", { NAME: "1" }, { strict: true })).toBe(true);
    expect(envFlag("NAME", { NAME: " 1 " }, { strict: true })).toBe(true);
    expect(envFlag("NAME", { NAME: "true" }, { strict: true })).toBe(false);
    expect(envFlag("NAME", { NAME: "yes" }, { strict: true })).toBe(false);
  });
});
