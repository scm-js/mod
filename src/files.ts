/**
 * A mod as a tree of files by name (`ModFiles`): what every caller turns what it was given into, so that one reader
 * (`readMod`) reads every mod the same way. An adapter makes one: a folder or a file on a disk (`diskFiles`, in
 * `@scm-js/mod/node`), a folder dropped on a page or picked, files handed over by another page, a mod kept in a
 * browser, a zip (`zipFiles`), files in memory (`filesOf`). Reading is asynchronous everywhere, because a browser reads
 * a file only so; listing is done once, up front, because every adapter knows its files' names and sizes before it
 * reads them.
 */
import { ModReadError, say } from "./messages.ts";

/** One file of the tree: its path (forward slashes; a folder's files start with the folder's own name) and its size. */
export interface ModEntry { path: string; size: number }

export interface ModFiles {
  /** What the person would call what they gave: the folder's, archive's, exe's or zip's name. */
  name: string;
  /** Every file of the tree, each once. */
  list(): Promise<readonly ModEntry[]>;
  /** A file's bytes, by its path in the list. */
  read(path: string): Promise<Uint8Array>;
  /**
   * The one file the person named, where they named a file (an exe, an archive, a zip) rather than a folder or several
   * files: its path. The tree's other files are then only the files beside it in its folder, which Windows finds
   * beside a program (the DLLs it imports), never part of the mod's files.
   */
  named?: string;
  /**
   * "game": the paths are the game's own (`arr/units.dat`, `plugins/gptp.qdp`), as a page may hand a mod's members over:
   * every file but the code and the archives is a game file by its path. Otherwise the tree is read as a folder is,
   * where the game's paths start at its game folders and what lies beside them is the mod's code and notes.
   */
  layout?: "game";
}

/** A tree held in memory (made in a test, or files handed over whole). */
export function filesOf(name: string, files: Readonly<Record<string, Uint8Array>> | ReadonlyMap<string, Uint8Array>, o: { named?: string; layout?: "game" } = {}): ModFiles {
  const map = files instanceof Map ? files as ReadonlyMap<string, Uint8Array> : new Map(Object.entries(files));
  return {
    name, ...o,
    list: async () => [...map].map(([path, b]) => ({ path, size: b.length })),
    read: async (path) => { const b = map.get(path); if (!b) throw new ModReadError(say("not-in-tree", { path, name })); return b; },
  };
}

/* ── Files that are never a mod's ─────────────────────────────── */

/**
 * Files an operating system or its file manager leaves in folders, and into the archives and zips made of them: never
 * the game's, so never a mod's. Told by name alone, any case — the last
 * part of a path, or a folder on the way to it:
 *
 * - `desktop.ini`: Windows Explorer's settings for a folder (its view, its icon);
 * - `Thumbs.db`, `ehthumbs.db`, `ehthumbs_vista.db`: Explorer's and Media Center's caches of thumbnails;
 * - `.DS_Store`: the macOS Finder's settings for a folder; `Icon\r`: a folder's own icon there;
 * - `._<name>`: the AppleDouble half of a file, which macOS writes beside it on a disk that is not its own and into
 *   every zip it makes; `__MACOSX/`: the folder those zips keep them in;
 * - `.directory`: KDE's settings for a folder.
 *
 * A mod's hash has no line for one (`hashLines`), and the reader leaves them out of the mod's files. Why it matters: the
 * same folder is not handed over alike by every route. A browser's folder handle (a folder picker) never
 * hands over `desktop.ini` or `Thumbs.db`: Chromium's `FileSystemAccessManagerImpl::IsSafePathComponent` refuses the
 * names `base::IsReservedNameOnWindows` lists, on every system. A dropped folder, an `<input webkitdirectory>` and the
 * command line hand them over. With these files in the hash a mod was named by how its folder had been read.
 *
 * Only names that are certain never to be a game file are here. A handle hides more than these (`.lnk`, `.url` and
 * `.scf` files, Windows' device names such as `aux.wav`, names that begin or end with a space, a dot or `~`, and on
 * Windows, by Chromium's table of file types, every `.ini`, `.cfg`, `.dll` and `.manifest`): those may be a mod's own
 * files, so they keep their lines, and a route that cannot read one has a mod short of that file and says so with
 * another hash.
 */
export const SYSTEM_FILES = {
  /** File names, lower case. */
  names: ["desktop.ini", "thumbs.db", "ehthumbs.db", "ehthumbs_vista.db", ".ds_store", "icon\r", ".directory"],
  /** What a file name starts with. */
  prefixes: ["._"],
  /** Folder names, lower case: everything under one. */
  folders: ["__macosx"],
} as const;

/** Whether a path (either slash, any case) is one of `SYSTEM_FILES`: by its file name, or by a folder it is under. */
export function isSystemFile(path: string): boolean {
  const parts = path.toLowerCase().split(/[\\/]/).filter(Boolean);
  const leaf = parts.pop() ?? "";
  return (SYSTEM_FILES.names as readonly string[]).includes(leaf)
    || SYSTEM_FILES.prefixes.some((p) => leaf.startsWith(p))
    || parts.some((folder) => (SYSTEM_FILES.folders as readonly string[]).includes(folder));
}

/**
 * Whether a path lies under a folder whose name starts with a dot (`.git/`, `.vscode/`): a tool's own folder, never
 * one of the game's paths (none of the game's folders starts with one) and never a mod's code. A file whose own name
 * starts with a dot is told by `isSystemFile` (`.DS_Store`) or kept: it may be one of the mod's (`lua/.gitignore`).
 */
export function inDotFolder(path: string): boolean {
  const parts = path.split(/[\\/]/).filter(Boolean);
  parts.pop();
  return parts.some((p) => p.startsWith(".") && p !== "." && p !== "..");
}

/** The last part of a path, either slash. */
export const leafOf = (path: string): string => path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
/** The folder a path is in ("" at the top), forward slashes. */
export const folderOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf("/")));
