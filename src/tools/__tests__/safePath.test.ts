import { mkdtempSync, writeFileSync, rmSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import {
  FileTooLargeError,
  LocalPathError,
  kindOf,
  localPath,
  readLocalFile,
  requireKind,
} from "../../storeAssets/safePath.js";
import { validateStoreAsset } from "../../storeAssets/validate.js";
import { auditStoreAssetDir } from "../../storeAssets/audit.js";
import { registeredTools } from "./harness.js";

const tools = registeredTools();
const callTool = (name: string, args: Record<string, unknown>) => tools.get(name)!.handler(args);

const dir = mkdtempSync(join(tmpdir(), "steam-safepath-"));
const file = join(dir, "a.png");
writeFileSync(file, Buffer.from("0123456789"));
mkdirSync(join(dir, "sub"));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const NETWORK_AND_DEVICE = [
  "\\\\attacker.example\\share\\x.png",
  "//attacker.example/share/x.png",
  "\\\\?\\UNC\\attacker.example\\share\\x.png",
  "\\\\.\\PhysicalDrive0",
  "\\\\?\\C:\\x.png",
  "  \\\\host\\share",
];

describe("local path checks", () => {
  it.each(NETWORK_AND_DEVICE)("refuses %s before any filesystem call", (p) => {
    expect(() => localPath(p)).toThrow(LocalPathError);
    expect(() => kindOf(p)).toThrow(/UNC/);
    expect(() => readLocalFile(p, 100)).toThrow(/UNC/);
  });

  it.each(["NUL", "nul.png", "CON", "C:\\games\\aux.jpg", "/tmp/COM1", "lpt9.png"])("refuses reserved device name %s", (p) => {
    expect(() => localPath(p)).toThrow(/reserved device name/);
  });

  it.each(["console.png", "null.png", "com10.png", "auxiliary.jpg", "header_capsule.png"])("allows ordinary name %s", (p) => {
    expect(() => localPath(p)).not.toThrow();
  });

  it("reads a regular file up to the cap", () => {
    expect(readLocalFile(file, 100).toString()).toBe("0123456789");
    expect(() => readLocalFile(file, 5)).toThrow(FileTooLargeError);
  });

  it("requires the right kind of path", () => {
    expect(requireKind(file, "file").size).toBe(10);
    expect(() => requireKind(file, "directory")).toThrow(/not a directory/);
    expect(() => requireKind(join(dir, "sub"), "file")).toThrow(/not a regular file/);
    expect(() => requireKind(join(dir, "missing.png"), "file")).toThrow(/not found/);
    expect(kindOf(file)).toBe("file");
    expect(kindOf(join(dir, "sub"))).toBe("directory");
    expect(kindOf(join(dir, "missing.png"))).toBeUndefined();
  });

  it("does not follow symbolic links", (ctx) => {
    const link = join(dir, "link.png");
    try {
      symlinkSync(file, link, "file");
    } catch {
      ctx.skip(); // Windows without symlink rights
    }
    expect(() => requireKind(link, "file")).toThrow(/symbolic link/);
    expect(() => readLocalFile(link, 100)).toThrow(/symbolic link/);
  });

  it("validation reports a network path as an IO error without the raw OS error", () => {
    const v = validateStoreAsset("\\\\attacker.example\\share\\hero.png", "libraryHero");
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatchObject({ code: "IO" });
    expect(v.errors[0].message).toMatch(/UNC/);
  });

  it("the folder audit refuses a network directory", () => {
    expect(() => auditStoreAssetDir("\\\\attacker.example\\share")).toThrow(/UNC/);
  });

  it("the tools return an error for a network path", async () => {
    const single = await callTool("steam_validateStoreAsset", { path: "\\\\host\\share\\x.png", slot: "libraryHero" });
    expect(single.isError).toBe(true);
    expect(JSON.stringify(single.content)).toMatch(/UNC/);
    const folder = await callTool("steam_validateStoreAssetDir", { dir: "//host/share" });
    expect(folder.isError).toBe(true);
    expect(JSON.stringify(folder.content)).toMatch(/UNC/);
  });
});
