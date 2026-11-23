import { closeSync, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";

// Local file access for the asset tools. Paths come from the model, so they
// are checked before any filesystem call: on Windows, opening a UNC path
// (\\host\share) makes the OS authenticate to that host, and device paths
// (\\.\, \\?\, NUL, CON) can block or never end.

export class LocalPathError extends Error {}

/** Files above this are refused before reading. Steam store images are far smaller. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.[^.]*)?$/i;

/** Reject network and device paths, then resolve to an absolute local path. */
export function localPath(input: string): string {
  const p = input.trim();
  if (!p) throw new LocalPathError("Path is empty.");
  if (/^[\\/]{2}/.test(p)) {
    throw new LocalPathError("Network (UNC) and device paths are not allowed. Use a local file path.");
  }
  // Split on both separators so the check is the same on every platform.
  const name = p.split(/[\\/]+/).filter(Boolean).pop() ?? "";
  if (RESERVED_WINDOWS_NAME.test(name)) {
    throw new LocalPathError(`${name} is a reserved device name, not a file.`);
  }
  return resolve(p);
}

function describe(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return "not found";
  if (code === "EACCES" || code === "EPERM") return "permission denied";
  return "cannot be read";
}

type Kind = "file" | "directory";

/**
 * lstat the path and require a regular file or a directory. Symbolic links
 * are refused rather than followed, so a link cannot point at a share.
 */
export function requireKind(input: string, kind: Kind): { path: string; size: number } {
  const path = localPath(input);
  let st;
  try {
    st = lstatSync(path);
  } catch (error) {
    throw new LocalPathError(`${input}: ${describe(error)}.`);
  }
  if (st.isSymbolicLink()) throw new LocalPathError(`${input} is a symbolic link. Pass the path of the real ${kind}.`);
  if (kind === "file" && !st.isFile()) throw new LocalPathError(`${input} is not a regular file.`);
  if (kind === "directory" && !st.isDirectory()) throw new LocalPathError(`${input} is not a directory.`);
  return { path, size: st.size };
}

/** The kind of an existing path, or undefined if it is missing or neither. Never follows links. */
export function kindOf(input: string): Kind | undefined {
  const path = localPath(input);
  try {
    const st = lstatSync(path);
    return st.isFile() ? "file" : st.isDirectory() ? "directory" : undefined;
  } catch {
    return undefined;
  }
}

export class FileTooLargeError extends LocalPathError {
  constructor(readonly bytes: number, readonly max: number) {
    super(`File is ${bytes} bytes; files over ${max} bytes are rejected without reading.`);
  }
}

/** Read a regular local file through one descriptor, never more than maxBytes. */
export function readLocalFile(input: string, maxBytes: number): Buffer<ArrayBuffer> {
  const { path, size } = requireKind(input, "file");
  if (size > maxBytes) throw new FileTooLargeError(size, maxBytes);
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch (error) {
    throw new LocalPathError(`${input}: ${describe(error)}.`);
  }
  try {
    // Re-check on the open descriptor: the path could have been swapped.
    const st = fstatSync(fd);
    if (!st.isFile()) throw new LocalPathError(`${input} is not a regular file.`);
    if (st.size > maxBytes) throw new FileTooLargeError(st.size, maxBytes);
    const buf = Buffer.alloc(st.size);
    let read = 0;
    while (read < st.size) {
      const n = readSync(fd, buf, read, st.size - read, read);
      if (n === 0) break;
      read += n;
    }
    return buf.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}
