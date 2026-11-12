/**
 * What a mod's file is, told from its game name and its size alone: its kind (a table, a picture, a sound, …), and for
 * one of the game's eleven `.dat` tables, the layout it is in and how many entries it has: the game's own, or wider
 * (DatExtend's expanded layout, GPTP's `.datex`). Nothing is decoded; the numbers are the game's tables'.
 */
import { DAT_TABLES, gameName } from "./gameNames.ts";

/** The kinds of file a mod changes, in the order they are named. */
export const MOD_KINDS = ["tables", "scripts", "pictures", "sounds", "terrain", "strings", "AI", "maps", "other"] as const;
export type ModKind = (typeof MOD_KINDS)[number];

/** A file's kind by its game name (any case or slash). */
export function kindOf(name: string): ModKind {
  const lower = gameName(name);
  const [top] = lower.split("\\");
  if (/^scripts\\(aiscript|bwscript)\.bin$/.test(lower)) return "AI";
  if (top === "scripts") return "scripts";
  if (top === "arr") return lower.endsWith(".tbl") ? "strings" : /\.dat(ex)?$/.test(lower) ? "tables" : "other";
  if (top === "tileset") return "terrain";
  if (top === "maps" || /\.sc[mx]$/.test(lower)) return "maps";
  if (/\.(wav|ogg)$/.test(lower) || top === "sound" || top === "music") return "sounds";
  if (lower.endsWith(".tbl") || top === "font") return "strings";
  if (/\.(grp|pcx|lo[a-z]|dds|anim|smk|spk|bmp|png)$/.test(lower) || ["unit", "game", "dlgs", "cursor", "portrait"].includes(top)) return "pictures";
  return "other";
}

/** How many files of each kind, and how many bytes, among `files` (a description's `files`, or any list by game name). */
export function kindTotals(files: Iterable<{ name: string; size: number }>): { files: number; bytes: number; kinds: Partial<Record<ModKind, { files: number; bytes: number }>> } {
  const kinds: Partial<Record<ModKind, { files: number; bytes: number }>> = {};
  let count = 0, bytes = 0;
  for (const f of files) {
    const k = kindOf(f.name), c = (kinds[k] ??= { files: 0, bytes: 0 });
    c.files++; c.bytes += f.size; count++; bytes += f.size;
  }
  return { files: count, bytes, kinds };
}

/* ── The game's tables ───────────────────────────────────────── */

export type DatTableName = (typeof DAT_TABLES)[number];

/**
 * Each of the game's `.dat` tables: its entries and size in 1.16.1 (`size`), its size before Brood War where that
 * differs (`legacy`: units.dat without Brood War's columns), and the size of one entry in DatExtend's expanded layout
 * and in GPTP's `.datex` layout, where each table is as wide as the file is long.
 */
export const DAT_SHAPES: Readonly<Record<DatTableName, { entries: number; size: number; legacy: number | null; expanded: number; datex: number }>> = {
  units: { entries: 228, size: 19876, legacy: 19192, expanded: 97, datex: 99 },
  weapons: { entries: 130, size: 5460, legacy: null, expanded: 42, datex: 42 },
  flingy: { entries: 209, size: 3135, legacy: null, expanded: 15, datex: 15 },
  sprites: { entries: 517, size: 3229, legacy: null, expanded: 7, datex: 7 },
  images: { entries: 999, size: 37962, legacy: null, expanded: 38, datex: 38 },
  upgrades: { entries: 61, size: 1281, legacy: null, expanded: 21, datex: 21 },
  techdata: { entries: 44, size: 836, legacy: null, expanded: 19, datex: 19 },
  orders: { entries: 189, size: 4158, legacy: null, expanded: 22, datex: 23 },
  sfxdata: { entries: 1144, size: 10296, legacy: null, expanded: 9, datex: 9 },
  portdata: { entries: 110, size: 1320, legacy: null, expanded: 12, datex: 12 },
  mapdata: { entries: 65, size: 260, legacy: null, expanded: 4, datex: 4 },
};

/** The table a file is (`arr\units.dat`, `arr\units.datex`), or null. */
export function datTableOf(name: string): DatTableName | null {
  const m = /^arr\\([^\\]+)\.dat(?:ex)?$/.exec(gameName(name));
  return m && (DAT_TABLES as readonly string[]).includes(m[1]) ? (m[1] as DatTableName) : null;
}

/**
 * A table file's layout and width, from its name and size:
 * - `dat`: the game's own, `entries` as the game has them (`legacy`: units.dat from before Brood War);
 * - `expanded`: DatExtend's expanded layout (PyMS), `entries` from the size;
 * - `datex`: GPTP's `.datex` layout (a `.datex` name always is), `entries` from the size.
 *
 * `extended` is true for every layout but the game's own. `layout` is null for a size that is no layout of the table.
 */
export interface TableShape {
  table: DatTableName;
  layout: "dat" | "expanded" | "datex" | null;
  entries: number | null;
  /** The game's own count of entries. */
  standard: number;
  legacy: boolean;
  extended: boolean;
}

/** The shape of a table file (`arr\units.dat`, its size in bytes), or null when the name is no table's. */
export function tableShape(name: string, size: number): TableShape | null {
  const table = datTableOf(name);
  if (!table) return null;
  const s = DAT_SHAPES[table];
  const shape = (layout: TableShape["layout"], entries: number | null, legacy = false): TableShape => ({ table, layout, entries, standard: s.entries, legacy, extended: layout !== null && layout !== "dat" });
  if (/\.datex$/i.test(name)) return size > 0 && size % s.datex === 0 ? shape("datex", size / s.datex) : shape(null, null);
  if (size === s.size) return shape("dat", s.entries);
  if (s.legacy !== null && size === s.legacy) return shape("dat", s.entries, true);
  if (size > 0 && size % s.expanded === 0) return shape("expanded", size / s.expanded);
  if (size > 0 && size % s.datex === 0) return shape("datex", size / s.datex);
  return shape(null, null);
}

/**
 * Whether the game a mod is for is StarCraft: Remastered, by its files: Remastered's own folders (`anim\`, `hd2\`,
 * `sd\`) or picture formats (`.dds`, `.anim`). Otherwise the game is 1.16.1, which every loader the reader knows is for.
 */
export function gameOf(names: Iterable<string>): "1.16.1" | "remastered" {
  for (const n of names) if (/^(anim|hd2|sd)\\|\.(dds|anim)$/.test(gameName(n))) return "remastered";
  return "1.16.1";
}
