/**
 * A mod's `mod.json`: what its makers, or the tool that laid it out, say of it that no file of the game can: its name,
 * its makers' address, the races it adds, the game it is for, and the hash a tool wrote. One rule for every caller:
 * which `mod.json` is the mod's (`isModJsonPath`), and what of it is read (`readModJson`). It is no game file and has no
 * line in the mod's hash, unless it lies under one of the game's folders, where it is a file of the mod like any other
 * and not read as this.
 */
import { GAME_FOLDERS } from "./gameNames.ts";
import { saidRaces, type DataSetRace } from "./races.ts";

/** The file's name. */
export const MOD_JSON = "mod.json";
/** The longest name a `mod.json` gives that is kept (longer is cut). */
export const MAX_MOD_NAME = 80;

/** What a `mod.json` says, each field only where it says it in a form that can be used. */
export interface ModJson {
  /** `name`, trimmed, at most `MAX_MOD_NAME` characters; absent when empty. */
  name?: string;
  /** The first of `link`, `url` and `homepage` that is an http(s) address. */
  link?: string;
  /** `races` as `saidRaces` reads it: undefined where it says nothing of them, `[]` where it declares none. */
  races?: DataSetRace[];
  /** `hash` and `withoutPlugins` where they are sixteen lower-case hex digits: the hash a tool wrote when it laid the mod out. */
  declared?: { hash: string; withoutPlugins?: string };
  /** `base`: the game the mod is for, as written (`1.16.1`). */
  base?: string;
  /**
   * `scmjs`, a number: the file is the manifest of a mod folder in text form (tables as text, pictures as PNG sheets),
   * of that format version. Such a folder is not the game's files until it is packed.
   */
  format?: number;
}

const HASH = /^[0-9a-f]{16}$/;

/** A `mod.json`'s text read by the rule; null when it is not JSON or not an object. */
export function readModJson(text: string): ModJson | null {
  let m: unknown;
  try { m = JSON.parse(text); } catch { return null; }
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const r = m as Record<string, unknown>, out: ModJson = {};
  if (typeof r.name === "string" && r.name.trim()) out.name = r.name.trim().slice(0, MAX_MOD_NAME);
  const link = [r.link, r.url, r.homepage].find((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u));
  if (link) out.link = link;
  const races = saidRaces(r.races);
  if (races !== undefined) out.races = races;
  if (typeof r.hash === "string" && HASH.test(r.hash)) out.declared = { hash: r.hash, ...(typeof r.withoutPlugins === "string" && HASH.test(r.withoutPlugins) ? { withoutPlugins: r.withoutPlugins } : {}) };
  if (typeof r.base === "string" && r.base.trim()) out.base = r.base.trim();
  if (typeof r.scmjs === "number" && Number.isFinite(r.scmjs)) out.format = r.scmjs;
  return out;
}

/**
 * Whether a `mod.json` at `path` (forward slashes) is the mod's own: in the folder everything given is in (`top`; ""
 * for none), or one folder down from it (a zip or a release that wraps the mod in a folder of its own), never in one
 * of the game's folders. Of several, the shallowest is the mod's (the first given, at one depth).
 */
export function isModJsonPath(path: string, top: string): boolean {
  const parts = path.split("/");
  if (parts.pop()?.toLowerCase() !== MOD_JSON) return false;
  if (top) { if (parts[0] !== top) return false; parts.shift(); }
  return parts.length === 0 || (parts.length === 1 && !GAME_FOLDERS.includes(parts[0].toLowerCase()));
}
