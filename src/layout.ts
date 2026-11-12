/**
 * Where the game's paths start in a tree a person gave, and what of it is a copy of the game rather than a mod. Pure.
 */
import { GAME_ARCHIVES, GAME_FOLDERS } from "./gameNames.ts";
import { say, type ModMessageOf } from "./messages.ts";

/**
 * The folder of the drop the game's paths start in: the one that holds `arr/`, else the one holding the most files
 * under the game's folders. "" is the drop's root. `paths` are the dropped files' paths, forward slashes.
 */
export function modRoot(paths: readonly string[]): string {
  const score = new Map<string, number>(), hasArr = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      const folder = parts[i].toLowerCase();
      if (!GAME_FOLDERS.includes(folder) || folder === "maps") continue;
      const root = parts.slice(0, i).join("/");
      score.set(root, (score.get(root) ?? 0) + 1);
      if (folder === "arr") hasArr.add(root);
    }
  }
  const best = (list: string[]) => list.sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || a.split("/").length - b.split("/").length)[0];
  return best([...hasArr]) ?? best([...score.keys()]) ?? "";
}

/**
 * Whether files handed over (forward slashes) are laid in the game's paths — `arr/units.dat`, `plugins/apply`,
 * `plugins/gptp.qdp`, a mod's members by their game names — rather than in a folder's own layout
 * (`Release/mpq/arr/units.dat`, a picked folder's name first): the game's folders are at the root of what was handed.
 * A caller that finds so reads them with `ModFiles.layout` "game".
 */
export function inGamePaths(paths: readonly string[]): boolean {
  const top = (p: string) => (p.includes("/") ? p.split("/")[0].toLowerCase() : "");
  return paths.some((p) => top(p) !== "maps" && GAME_FOLDERS.includes(top(p))) && modRoot(paths) === "";
}

/** The files among `paths` (forward slashes) that are a copy of the game's own and so no part of a mod: in every folder
 *  that holds a `StarDat.mpq`, that folder's `GAME_ARCHIVES` and every file under its `Maps` folder. */
export function gameCopyFiles(paths: readonly string[]): Set<string> {
  const dir = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf("/")));
  const leaf = (p: string) => p.slice(p.lastIndexOf("/") + 1).toLowerCase();
  const copies = new Set(paths.filter((p) => leaf(p) === "stardat.mpq").map((p) => dir(p).toLowerCase()));
  const out = new Set<string>();
  if (!copies.size) return out;
  for (const p of paths) {
    if (copies.has(dir(p).toLowerCase()) && (GAME_ARCHIVES as readonly string[]).includes(leaf(p))) { out.add(p); continue; }
    for (const c of copies) if (p.toLowerCase().startsWith(c ? `${c}/maps/` : "maps/")) { out.add(p); break; }
  }
  return out;
}

/**
 * What `gameCopyFiles` left out (`gameCopy`, those paths), by the copy of the game each is of: the copy's folder as it
 * was handed over ("" for a copy at the root of what was given) and its files, the game's archives first in
 * `GAME_ARCHIVES` order, then the rest by path. The copies in the order of their folders.
 */
export function gameCopyFolders(gameCopy: readonly string[]): { folder: string; paths: string[] }[] {
  const dir = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf("/")));
  const leaf = (p: string) => p.slice(p.lastIndexOf("/") + 1).toLowerCase();
  const folders = [...new Map(gameCopy.filter((p) => leaf(p) === "stardat.mpq").map((p) => [dir(p).toLowerCase(), dir(p)])).values()];
  // (each file to the deepest copy it is of: its own folder's archive, or anything under its Maps folder)
  const of = (p: string) => {
    const lower = p.toLowerCase();
    let best: string | null = null;
    for (const f of folders) {
      const c = f.toLowerCase();
      const mine = (dir(lower) === c && (GAME_ARCHIVES as readonly string[]).includes(leaf(p))) || lower.startsWith(c ? `${c}/maps/` : "maps/");
      if (mine && (best === null || f.length > best.length)) best = f;
    }
    return best ?? dir(p);
  };
  const rank = (p: string) => { const i = (GAME_ARCHIVES as readonly string[]).indexOf(leaf(p)); return i < 0 || dir(p).toLowerCase() !== of(p).toLowerCase() ? GAME_ARCHIVES.length : i; };
  const groups = new Map<string, { folder: string; paths: string[] }>();
  for (const p of gameCopy) {
    const folder = of(p), key = folder.toLowerCase();
    if (!groups.has(key)) groups.set(key, { folder, paths: [] });
    groups.get(key)!.paths.push(p);
  }
  for (const g of groups.values()) g.paths.sort((a, b) => rank(a) - rank(b) || (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
  return [...groups.values()].sort((a, b) => (a.folder.toLowerCase() < b.folder.toLowerCase() ? -1 : a.folder.toLowerCase() > b.folder.toLowerCase() ? 1 : 0));
}

/**
 * What is said of the copies of the game left out of a mod (`gameCopy`), one sentence for each copy: its folder as
 * handed over (`given`, the name of what was given, for a copy at its root) and its files' names, six at most
 * (`more`: how many past those).
 */
export function gameCopyText(gameCopy: readonly string[], given: string): ModMessageOf<"game-copy">[] {
  return gameCopyFolders(gameCopy).map(({ folder, paths }) => {
    const names = paths.map((p) => p.slice(p.lastIndexOf("/") + 1));
    return say("game-copy", { folder: folder || given, list: names.slice(0, 6).join(", "), more: Math.max(0, names.length - 6) });
  });
}

