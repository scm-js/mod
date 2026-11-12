/**
 * The names in an archive that has no list of them (a `(listfile)`): storm finds a file by its name's hash, so an
 * archive without a list can only be asked for names one already has. The one prober: the names the game reads by
 * name (`gameFileNames` on every tileset, the startup data, the tables and their wider forms), every file the
 * archive's own image, sound and portrait tables name, and every file 1.16.1's own tables name (`STOCK_TABLE_NAMES`,
 * names only). What it finds depends on the archive's bytes alone: no caller's copy of the game is asked.
 */
import type { Archive } from "mopaq";
import { DAT_TABLES, gameFileNames, gameName, STARTUP_NAMES, TILESET_NAMES } from "./gameNames.ts";
import { ModReadError, say } from "./messages.ts";
import { STOCK_TABLE_NAMES } from "./stockNames.ts";

/** The game's strings' code page. */
const WINDOWS_1252 = /* @__PURE__ */ new TextDecoder("windows-1252");

/** A string table (`.tbl`): a count, an offset a string, the strings ending in a zero. Throws `ModReadError` on one that does not hold together. */
export function tblStrings(bytes: Uint8Array): string[] {
  if (bytes.length < 2) throw new ModReadError(say("tbl-too-short", {}));
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), count = v.getUint16(0, true);
  if (2 + 2 * count > bytes.length) throw new ModReadError(say("tbl-offsets-past-end", {}));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const at = v.getUint16(2 + 2 * i, true);
    if (at > bytes.length) throw new ModReadError(say("tbl-string-past-end", { index: i }));
    const end = bytes.indexOf(0, at);
    out.push(WINDOWS_1252.decode(bytes.subarray(at, end < 0 ? bytes.length : end)));
  }
  return out;
}

/** The tables whose strings name files, and the folder those files are under. */
export const NAMING_TABLES: readonly [string, string][] = [["arr\\images.tbl", "unit\\"], ["arr\\sfxdata.tbl", "sound\\"], ["arr\\portdata.tbl", "portrait\\"]];

/**
 * A copy of the game's files, by game name.
 * @deprecated Since 1.2.0 no prober asks it: 1.16.1's own tables' names are looked for in every archive without a list
 * (`STOCK_TABLE_NAMES`), so what an archive is found to hold no longer depends on who reads it.
 */
export type TablesOf = (name: string) => Promise<Uint8Array | null>;

/**
 * The names 1.16.1's own tables give (`STOCK_TABLE_NAMES`), by folder: each folder, then the names in it. A word that
 * ends in a backslash is a folder, every other word a name in the folder before it.
 */
export function stockFolders(): string[][] {
  const out: string[][] = [];
  for (const word of STOCK_TABLE_NAMES.split(/\s+/)) {
    if (!word) continue;
    if (word.endsWith("\\")) out.push([word]);
    else out[out.length - 1].push(word);
  }
  return out;
}

/** Those names whole (each folder and a name in it, joined), made once. */
let stock: readonly string[] | null = null;
const stockNames = (): readonly string[] => (stock ??= stockFolders().flatMap(([folder, ...leaves]) => leaves.map((leaf) => folder + leaf)));

/** The names the game reads by name, and those the archive's own tables give: what was looked for before 1.2.0. */
function ownNames(archive: Archive): Set<string> {
  const names = new Set<string>([...STARTUP_NAMES, ...TILESET_NAMES.flatMap((t) => [...gameFileNames(t), `tileset\\${t}.vx4ex`])]);
  for (const t of DAT_TABLES) { names.add(`arr\\${t}.dat`); names.add(`arr\\${t}.datex`); }
  for (const n of ["rez\\unitnames.tbl", "unit\\cmdbtns\\uniticons.grp", "rez\\network.tbl"]) names.add(n);
  for (const [table, under] of NAMING_TABLES) {
    let own: Uint8Array | null = null;
    try { own = archive.fileInfo(table) ? archive.readFile(table) : null; } catch { own = null; }
    if (!own) continue;
    try { for (const n of tblStrings(own)) if (n) names.add(gameName(under + n)); } catch { /* not a string table */ }
  }
  return names;
}

/**
 * The names to look for in an archive without a list: what the game reads by name, what the archive's own tables
 * name, and what 1.16.1's own tables name (`STOCK_TABLE_NAMES`), in that order, each once.
 * `_tables` is not asked (deprecated since 1.2.0, kept so a call written for 1.0 still compiles).
 */
export async function namesToProbe(archive: Archive, _tables?: TablesOf): Promise<string[]> {
  const names = ownNames(archive);
  for (const n of stockNames()) names.add(n);
  return [...names];
}

/** The names among `namesToProbe` the archive holds. `_tables` is not asked (deprecated since 1.2.0). */
export async function probeNames(archive: Archive, _tables?: TablesOf): Promise<string[]> {
  return (await namesToProbe(archive)).filter((n) => holds(archive, n));
}

const holds = (archive: Archive, name: string): boolean => { try { return !!archive.fileInfo(name); } catch { return false; } };

/**
 * Among `found` (names the prober found in the archive), those found only by 1.16.1's own tables' names: what a reader
 * before 1.2.0 that passed no `tables` did not find (`EarlierRule` "without-stock-names").
 */
export function foundByStockNamesOnly(archive: Archive, found: readonly string[]): Set<string> {
  const own = ownNames(archive);
  return new Set(found.filter((n) => !own.has(n)));
}
