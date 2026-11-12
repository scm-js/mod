/**
 * The mod's name between people: one hash over every file the mod lays and every module of its code, so that two
 * people, two pages or a replay and the mod it was played with can tell whether they hold the same mod. SHA-256 by the
 * platform's Web Crypto (`crypto.subtle`, in every browser and in Node).
 */
import { isSystemFile } from "./files.ts";

/** One file's SHA-256, lower-case hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  let s = "";
  for (const x of d) s += x.toString(16).padStart(2, "0");
  return s;
}

const lineName = (l: string) => l.slice(0, l.indexOf("\t"));

/** Whether a line `name<TAB>sha256` is of an operating system's file (`isSystemFile`), which the hash has no line for. */
export const isSystemLine = (line: string): boolean => isSystemFile(lineName(line));

/**
 * The mod's name between people: the first sixteen hex digits of SHA-256 over the lines `<game name>\t<SHA-256 hex of
 * its bytes>`, game names lower case with backslashes, sorted by name, joined with "\n". `lines` are such lines in any
 * order; a line of an operating system's file (`isSystemLine`) is dropped first, so the hash is the same whatever list
 * the caller made.
 */
export async function hashLines(lines: readonly string[]): Promise<string> {
  return hashLinesAsWere(lines.filter((l) => !isSystemLine(l)));
}

/**
 * `hashLines` as it was until 2026-11-09: every line given, an operating system's files among them. For matching a
 * hash made then (a replay's tag, a mod this browser kept, a bot made for a mod), never for naming a mod now.
 */
export async function hashLinesAsWere(lines: readonly string[]): Promise<string> {
  const sorted = [...lines].sort((a, b) => (lineName(a) < lineName(b) ? -1 : lineName(a) > lineName(b) ? 1 : 0));
  return (await sha256Hex(new TextEncoder().encode(sorted.join("\n")))).slice(0, 16);
}

/**
 * The lines of a mod's code, in the same shape: a module of its code is `plugins\<file name>`, the FireGraft project
 * `<file name>.fgp`, lower case.
 */
export const pluginLine = (name: string, sha256: string): string => `plugins\\${name.toLowerCase()}\t${sha256}`;

/**
 * Whether a module of the description has a line of its own in the hash (`pluginLine`, since 2026-11-11 for every module
 * of the mod's code): a plugin, given as a file or carried by a patcher exe (its loader loads it), a plugin that loads
 * plugins, and a library its plugins map. Not the same plugin carried twice (`sameAs`: the file has the line), not
 * MPQDraft's own patcher DLL (role "patcher": whoever runs the mod is the loader), not a network provider (never loaded).
 */
export const hasCodeLine = (m: { role: string; sameAs?: string }): boolean => !m.sameAs && (m.role === "plugin" || m.role === "plugin-loader" || m.role === "library");
export const firegraftLine = (name: string, sha256: string): string => `${name.toLowerCase()}\t${sha256}`;

/**
 * The hash of a game run with only some of the mod's code: its other lines (`files`: the game files' and the
 * project's, `Identity.lines`) and the lines of the modules that run (`plugins`: a module's name → its SHA-256,
 * `Identity.plugins`; `running`: the names that run). Whoever runs fewer of the mod's modules presents another hash,
 * so two games running different code never agree to play together.
 */
export function runningHash(files: readonly string[], plugins: Readonly<Record<string, string>>, running: readonly string[]): Promise<string> {
  const on = new Set(running.map((n) => n.toLowerCase()));
  return hashLines([...files, ...Object.entries(plugins).filter(([n]) => on.has(n.toLowerCase())).map(([n, sha]) => pluginLine(n, sha))]);
}

/** The hashes a mod went by until 2026-11-09, while an operating system's files had lines: its own, and without its plugins. */
export interface OlderHashes { hash: string; withoutPlugins?: string }
