/**
 * The mod's name between people: one hash over every file the mod lays and every module of its code, so that two
 * people, two pages or a replay and the mod it was played with can tell whether they hold the same mod. SHA-256 by the
 * platform's Web Crypto (`crypto.subtle`, in every browser and in Node).
 */
import { isSystemFile, leafOf } from "./files.ts";
import { gameName } from "./gameNames.ts";

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
/** The FireGraft project's line: its file name (`Made.fgp`, no folder), lower case. A database (`.fgd`) has none. */
export const firegraftLine = (name: string, sha256: string): string => `${name.toLowerCase()}\t${sha256}`;
/**
 * A game file's line: `<game name>\t<SHA-256>`, the name as `gameName` makes it (lower case, backslashes, a leading
 * backslash kept), so a path (`arr/units.dat`) or a game name may be given. An operating system's file had a line of
 * this shape until 2026-11-09 (`Identity.older.lines`).
 */
export const gameFileLine = (name: string, sha256: string): string => `${gameName(name)}\t${sha256}`;

/**
 * An earlier rule's key in `Identity.earlier`, each the rule of this reader or of the readers before it that named
 * these same files otherwise:
 * - `before-code`: until 2026-11-11, only the plugins given as files had lines, and a FireGraft project found only
 *   through FireGraft's own list had none (`hash`: all of that code, `withoutPlugins`: none of it);
 * - `before-unlisted-project`: from 2026-11-11 until 1.0.0 (scm-sim's reader), every module of the code had its line,
 *   but a FireGraft project found only through FireGraft's own list in an archive without a list still had none;
 *   there only where the mod has such a project;
 * - `older`: until 2026-11-09, an operating system's files had lines too (`Identity.older`); there only where such
 *   files were seen;
 * - `game-files`: the game files alone, before a mod's code and its FireGraft project had lines (what `scmjs` called a
 *   mod's data set then), without an operating system's files (a folder read through a browser's folder picker);
 * - `game-files-older`: the same with an operating system's files' lines, as the rule was until 2026-11-09; there only
 *   where such files were seen;
 * - `without-stock-names`: until 1.2.0, an archive without a list was looked into for the names the game reads and
 *   those its own tables give, and only a reader that passed the person's own tables (`ReadOptions.tables`) looked for
 *   the names 1.16.1's own tables give: the hash and the hash without plugins of the files found without those, as
 *   every other reader gave them. There only where those names found a file the older look did not.
 *
 * Each earlier rule's form over those same fewer files is listed too, with its own rule and `withoutStockNames`, where
 * it is a hash the list does not already hold: the readers that gave those forms passed no tables either.
 */
export type EarlierRule = "before-code" | "before-unlisted-project" | "older" | "game-files" | "game-files-older" | "without-stock-names";
/**
 * A hash an earlier rule gave these files: for matching a replay or a kept mod named then, never for naming a mod now.
 * `withoutStockNames`: the rule's form over the files an archive without a list was found to hold without the names
 * 1.16.1's own tables give (as `without-stock-names`).
 */
export interface EarlierHash { rule: EarlierRule; hash: string; withoutPlugins?: string; withoutStockNames?: true }

/**
 * Members changed, added or removed, by name: the new SHA-256 of each, or null for one removed (`identityWith`).
 * `files`: game files by game name or path, and FireGraft projects by file name (`.fgp`; a database has no line);
 * `plugins`: modules of the mod's code by file name (a plugin, a plugin that loads plugins, a library), as
 * `Identity.plugins` names them (any case).
 */
export interface IdentityChanges { files?: Readonly<Record<string, string | null>>; plugins?: Readonly<Record<string, string | null>> }

/**
 * The hashes of a mod after some of its members changed, from its identity and the changed members' new digests alone
 * (no other file is read): what `readMod` gives the mod with those members as they are now, for an editor that names
 * the mod as it is being edited. `lines` and `plugins` are the identity's after the change, to change again. A
 * member's kind is the caller's to say (a game file, a project, a module): one that `readMod` would take for another
 * kind (a DLL under a game folder) is hashed as the caller says. An operating system's file has no line. The earlier
 * rules' hashes are not worked out again: no replay was tagged by them with the edited files.
 */
export async function identityWith(id: { readonly lines: readonly string[]; readonly plugins: Readonly<Record<string, string>> }, changes: IdentityChanges): Promise<{ lines: string[]; plugins: Record<string, string>; hash: string; withoutPlugins: string }> {
  const lines = new Map(id.lines.map((l) => [lineName(l), l]));
  for (const [name, sha] of Object.entries(changes.files ?? {})) {
    if (/\.fgd$/i.test(name)) continue;
    const line = /\.fgp$/i.test(name) ? firegraftLine(leafOf(name), sha ?? "") : gameFileLine(name, sha ?? "");
    if (sha === null || isSystemLine(line)) lines.delete(lineName(line));
    else lines.set(lineName(line), line);
  }
  const plugins: Record<string, string> = { ...id.plugins };
  for (const [name, sha] of Object.entries(changes.plugins ?? {})) {
    for (const k of Object.keys(plugins)) if (k.toLowerCase() === name.toLowerCase()) delete plugins[k];
    if (sha !== null) plugins[name] = sha;
  }
  const kept = [...lines.values()].sort();
  const all = [...kept, ...Object.entries(plugins).map(([n, sha]) => pluginLine(n, sha))];
  return { lines: kept, plugins, hash: await hashLines(all), withoutPlugins: await hashLines(kept) };
}

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
