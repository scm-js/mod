/**
 * The races a mod declares. A race is a byte in a player's record (a map's, a replay's): 0–7 are the game's (Zerg,
 * Terran, Protoss, then Independent, Neutral, User Select, Random and Inactive), any other belongs to the data set in
 * use, and no file of a mod says what its races are called. So a mod may declare them, as a small table that rides
 * beside its name (`mod.json`'s `races`, a hand-over, a replay's tag) and never inside its hashed files. Here: the rule
 * a table of them is read by, wherever it comes from, and the hints a mod's files give (`raceCandidates`), which are
 * never taken for names.
 */
import { gameName } from "./gameNames.ts";
import { tblStrings } from "./names.ts";


/** A race a data set adds to the game's own. Unknown fields of a row are kept where its carrier keeps them. */
export interface DataSetRace {
  /** The race byte: 8–255. (0–7 are the game's and cannot be declared.) */
  id: number;
  /** What it is called, 40 characters at most, trimmed, not empty. */
  name: string;
  /** The lower-case letter its per-race files go by (`game\<letter>console.pcx`, `rez\statbtn<letter>.bin`), when it has them. */
  letter?: string;
  /** The game's race it plays as, where only the game's three are known: 0, 1 or 2. Absent: not declared. */
  like?: 0 | 1 | 2;
  [field: string]: unknown;
}

/** At most this many races a table keeps (more than any mod declares; a relay keeps 16). */
export const MAX_DECLARED_RACES = 248;
export const MAX_RACE_NAME = 40;

/** Whether `id` is a race byte a data set may declare: a whole number 8 to 255. */
export const isDeclarableRace = (id: unknown): id is number => typeof id === "number" && Number.isInteger(id) && id >= 8 && id <= 255;
/** Whether `id` is one of the three races the game plays as (0 zerg, 1 terran, 2 protoss). */
export const isPlayedRace = (id: unknown): id is 0 | 1 | 2 => id === 0 || id === 1 || id === 2;

/**
 * One row as the rule takes it, or null when it is not one: an id of 8–255, a name of 1–40 characters once trimmed; a
 * `letter` of one letter a–z (trimmed, lower-cased) and a `like` of 0, 1 or 2 kept, an invalid one dropped from the row.
 */
export function normalizeRace(row: unknown): DataSetRace | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (!isDeclarableRace(r.id) || typeof r.name !== "string") return null;
  const name = r.name.trim();
  if (!name || name.length > MAX_RACE_NAME) return null;
  const out: DataSetRace = { ...r, id: r.id, name };
  if (typeof r.letter === "string" && /^[a-z]$/i.test(r.letter.trim())) out.letter = r.letter.trim().toLowerCase(); else delete out.letter;
  if (isPlayedRace(r.like)) out.like = r.like; else delete out.like;
  return out;
}

/** A table as the rule takes it: invalid rows dropped (never thrown on), sorted by id, the first row of an id kept. */
export function normalizeRaces(value: unknown): DataSetRace[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>(), out: DataSetRace[] = [];
  for (const row of value) {
    const r = normalizeRace(row);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id); out.push(r);
    if (out.length >= MAX_DECLARED_RACES) break;
  }
  return out.sort((a, b) => a.id - b.id);
}

/**
 * A table as a hand-over or a folder's `mod.json` says it: an array, an empty one too, is what the data set declares
 * now (normalized; `[]`, or rows all invalid: it declares none); anything else (the field absent, `null`, not an
 * array) is "not said", undefined, and whatever the caller kept of the mod's races before stays.
 */
export const saidRaces = (value: unknown): DataSetRace[] | undefined => (Array.isArray(value) ? normalizeRaces(value) : undefined);

/* ── Hints from a mod's files ────────────────────────────────── */

/** How many entries the game's own `rez\network.tbl` has (1.16.1's, the same in Remastered): a mod's past it are its own. */
export const GAME_NETWORK_TBL_ENTRIES = 168;
/** The letters the game's own per-race files go by: Zerg, Terran, Protoss and the console of no race. */
const GAME_RACE_LETTERS = /* @__PURE__ */ new Set(["z", "t", "p", "n"]);

/** What a mod's files suggest about the races it adds: hints for a person naming them, never names in themselves. */
export interface RaceCandidates {
  /** Strings the mod's `rez\network.tbl` has past the game's own table, with their index there (0-based). */
  names: { index: number; name: string }[];
  /** Letters other than z, t, p and n that have `game\<x>console.pcx` or `rez\statbtn<x>.bin`, sorted. */
  letters: string[];
}

/**
 * The hints a mod's files give about the races it adds. `network` is the mod's `rez\network.tbl` (null when it has
 * none); `gameNetwork` the game's own, from a copy of the game (`GAME_NETWORK_TBL_ENTRIES` entries without one);
 * `paths` the mod's files by any spelling of their game names (`ModDescription.files`' names). A race's name must never
 * be filled in from these alone.
 */
export function raceCandidates(files: { network?: Uint8Array | null; gameNetwork?: Uint8Array | null; paths: Iterable<string> }): RaceCandidates {
  const names: RaceCandidates["names"] = [];
  if (files.network) {
    const decode = (b: Uint8Array) => { try { return tblStrings(b); } catch { return []; } };
    const list = decode(files.network);
    const from = (files.gameNetwork ? decode(files.gameNetwork).length : 0) || GAME_NETWORK_TBL_ENTRIES;
    for (let i = from; i < list.length; i++) {
      // (without control characters: a string table's colour codes are bytes below 0x20)
      const name = [...list[i]].filter((c) => c.charCodeAt(0) >= 0x20).join("").trim();
      if (name) names.push({ index: i, name });
    }
  }
  const letters = new Set<string>();
  for (const path of files.paths) {
    const m = /^(?:game\\([a-z])console\.pcx|rez\\statbtn([a-z])\.bin)$/.exec(gameName(path));
    const letter = m?.[1] ?? m?.[2];
    if (letter && !GAME_RACE_LETTERS.has(letter)) letters.add(letter);
  }
  return { names, letters: [...letters].sort() };
}
