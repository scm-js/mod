/**
 * The names in an archive that has no list of them (a `(listfile)`): storm finds a file by its name's hash, so an
 * archive without a list can only be asked for names one already has. The one prober: the names the game reads by
 * name (`gameFileNames` on every tileset, the startup data, the tables and their wider forms) and every file the
 * archive's own image, sound and portrait tables name, and those of the person's own copy of the game where the caller
 * has one (`tables`: an input, never a second prober).
 */
import type { Archive } from "mopaq";
import { DAT_TABLES, gameFileNames, gameName, STARTUP_NAMES, TILESET_NAMES } from "./gameNames.ts";
import { ModReadError, say } from "./messages.ts";

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
const NAMING_TABLES: readonly [string, string][] = [["arr\\images.tbl", "unit\\"], ["arr\\sfxdata.tbl", "sound\\"], ["arr\\portdata.tbl", "portrait\\"]];

/** The person's own copy of the game, by game name, where the caller has one: its tables name more files to look for. */
export type TablesOf = (name: string) => Promise<Uint8Array | null>;

/** The names to look for in an archive without a list: what the game reads by name, and what the tables name. */
export async function namesToProbe(archive: Archive, tables?: TablesOf): Promise<string[]> {
  const names = new Set<string>([...STARTUP_NAMES, ...TILESET_NAMES.flatMap((t) => [...gameFileNames(t), `tileset\\${t}.vx4ex`])]);
  for (const t of DAT_TABLES) { names.add(`arr\\${t}.dat`); names.add(`arr\\${t}.datex`); }
  for (const n of ["rez\\unitnames.tbl", "unit\\cmdbtns\\uniticons.grp", "rez\\network.tbl"]) names.add(n);
  for (const [table, under] of NAMING_TABLES) {
    let own: Uint8Array | null = null;
    try { own = archive.fileInfo(table) ? archive.readFile(table) : null; } catch { own = null; }
    for (const bytes of [own, tables ? await tables(table).catch(() => null) : null]) {
      if (!bytes) continue;
      try { for (const n of tblStrings(bytes)) if (n) names.add(gameName(under + n)); } catch { /* not a string table */ }
    }
  }
  return [...names];
}

/** The names among `namesToProbe` the archive holds. */
export async function probeNames(archive: Archive, tables?: TablesOf): Promise<string[]> {
  return (await namesToProbe(archive, tables)).filter((n) => { try { return !!archive.fileInfo(n); } catch { return false; } });
}
