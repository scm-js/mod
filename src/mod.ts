/**
 * A mod read once into a description of what its loader would have done on Windows: which loader the mod's shape
 * implies, the layers of files it lays and at what priority storm would hold each, the modules it maps in the loader's
 * order with the interface each is entered by, the FireGraft project it writes and at what moment, what it carries
 * beside its code, and what it goes by between people. Data only: nothing is run, and no Node or browser API is used.
 * A caller turns what it was given into `ModFiles` and calls `readMod`, then takes what it needs from the description.
 *
 * The layers are listed in the order storm would search them backwards: by storm's priority, lowest first, so that a
 * caller laying them in order (the later winning) lays them as storm holds them. The project lands at its moment and
 * the plugins load in the loader's order.
 */
import { Archive } from "mopaq";
import { folderOf, inDotFolder, isSystemFile, leafOf, type ModEntry, type ModFiles } from "./files.ts";
import { archiveInFile, exeArchive, isMpq, MPQDRAFT_COMPONENT, MPQDRAFT_DLL_MODULE, PatcherError, type CarriedModule, type ExeForm } from "./exe.ts";
import { isZip, readZip, ZipError, zipFiles } from "./zip.ts";
import { firegraftLine, hashLines, hashLinesAsWere, hasCodeLine, pluginLine, sha256Hex, type OlderHashes } from "./hash.ts";
import { GAME_ARCHIVE_PRIORITY, GAME_ARCHIVES, GAME_FOLDERS, gameName, readsStartupData } from "./gameNames.ts";
import { gameCopyFiles, gameCopyFolders, gameCopyText, modRoot } from "./layout.ts";
import { probeNames, type TablesOf } from "./names.ts";
import { FIREGRAFT_LISTS, FIREGRAFT_MOMENT, firegraftPick, listedNames } from "./firegraft.ts";
import { moduleFacts, type ModuleEntry } from "./modules.ts";
import { holdsString, programEnd } from "./pe.ts";
import { type DataSetRace } from "./races.ts";
import { isModJsonPath, readModJson } from "./manifest.ts";
import { gameOf } from "./kinds.ts";
import { ModReadError, say, type ModMessage, type ModMessageOf } from "./messages.ts";

export { ModReadError } from "./messages.ts";

/* ── The description ─────────────────────────────────────────── */

/**
 * The loaders a mod's shape implies, outermost first:
 * - `firegraft-patcher`: FireGraft's patcher exe (its overlay's plugins, any count, and its archive);
 * - `mpqdraft-sempq`: MPQDraft's self-executing MPQ (its embedded file system's plugins, and the archive);
 * - `self-executing`: an exe with an archive where storm finds one and neither form around it, read as that archive;
 * - `mpqdraft`: archives given as files, as MPQDraft's patcher takes them (with the plugins beside them);
 * - `replacement`: an archive named as one of the game's own (`patch_rt.mpq`): no loader, the game opens it itself;
 * - `plugin-loader`: a plugin that loads plugins (a folder of plugins and a folder of files it packs into an archive);
 * - `folder`: files in the game's paths with `plugins/` and `firegraft/` beside them, which no loader on Windows lays:
 *   the caller lays and loads them itself.
 */
export type LoaderKind = "firegraft-patcher" | "mpqdraft-sempq" | "self-executing" | "mpqdraft" | "replacement" | "plugin-loader" | "folder";
export interface Loader {
  kind: LoaderKind;
  /** The exe, archive or module it is, or the folder's root ("" the top). */
  path: string;
  words: ModMessage;
}

/**
 * Storm's priority for each band (storm looks through open archives highest first): FireGraft's patcher opens its
 * archives at 0xFFFF00 + i, a plugin that loads plugins its packed folder at 500000, MPQDraft 10000 + i, "giving
 * highest priority to the ones last in the list" (MPQDraft's `LoadPatchMPQs`); the game's own and a map's:
 * `GAME_ARCHIVE_PRIORITY`.
 *
 * The folder form is no loader's: 1.16.1 reads no loose files, so its files are laid as nothing on Windows lays them.
 * It is given 0x1000000, above every band: a person who puts a file in the game's paths beside an archive means it to
 * win.
 */
export const PRIORITY = { firegraft: 0xffff00, pluginLoader: 500000, mpqdraft: 10000, folder: 0x1000000 } as const;

/** A game file a layer gives, by the game's name. */
export interface LayerFile { name: string; size: number; /** A loose file's path in the tree. */ path?: string; /** An archive's member as listed (any case). */ member?: string }
export interface Layer {
  kind: "archive" | "folder";
  /** An archive: the path of the file that holds it in the tree (an `.mpq`, an exe, a member of a zip: `x.zip/a.mpq`). A folder: the root of the game's paths ("" the tree's top). */
  path: string;
  /** Where an archive's header is in its file (an exe's archive; 0 for an `.mpq`). */
  at?: number;
  priority: number;
  by: LoaderKind;
  /** One of the game's own archives it stands in for (`patch_rt.mpq`), when it is named as one. */
  replaces?: string;
  /** Its files: an archive's as its list says, or as the prober found them (`probed`); a folder's game files. */
  files: LayerFile[];
  /** An archive with no list of its names: `files` are those the prober found, and it answers any other name asked. */
  probed?: boolean;
}

/**
 * A module's role:
 * - `plugin`: a loader enters it (MPQDraft's interface, FireGraft's overlay, a `.bwl`);
 * - `plugin-loader`: a plugin whose work is to load other plugins (and lay a folder of files): whoever runs the mod does
 *   that work in its place;
 * - `patcher`: a loader's own DLL carried in the mod (MPQDraft's patcher in an SEMPQ): whoever runs the mod is the loader;
 * - `library`: a DLL beside the plugins or the program, mapped when a module imports it or asks for it;
 * - `provider`: a storm network provider (`.snp`).
 */
export type ModuleRole = "plugin" | "plugin-loader" | "patcher" | "library" | "provider";
export type ModuleSource =
  | { kind: "file"; path: string }
  | { kind: "carried"; exe: string; form: ExeForm; index: number; at: number; size: number; file: number | null }
  | { kind: "member"; archive: string; member: string };
export interface Module {
  /** The file name it goes by (what `GetModuleHandle` finds it by): its file's, else the name its export directory gives. */
  name: string;
  role: ModuleRole;
  entry: ModuleEntry;
  /** It exports `samase_plugin_init` too (on 1.16.1 it sets itself up in a hook on WinMain's call). */
  samase: boolean;
  /** The MPQDraft id a carrying exe gives it (FireGraft's overlay, an EFS's component), else null. */
  id: number | null;
  source: ModuleSource;
  size: number;
  sha256: string;
  /** A carried module whose bytes are a file the mod also carries: that file is the module. */
  sameAs?: string;
  /** Whether the loader loads it (a library: false, mapped when imported). */
  load: boolean;
  /** Why not, from what it is or what its loader's rule says (its `key` is the reason as data). */
  why?: ModMessage;
  /** Its place in the loader's order (0 first), when loaded. */
  order?: number;
}

/**
 * A FireGraft file found, and where. `byList`: found only through FireGraft's own list in an archive that has no list
 * of its names (as the patcher finds it). A project so found has its line in the hash as any other (since 2026-11-11).
 */
export interface FiregraftFile { name: string; size: number; place: string; path?: string; archive?: string; member?: string; byList?: true }
export interface FiregraftPatch {
  kind: "firegraft";
  /** Every `.fgp` and `.fgd` found, in the order found (each named once). */
  files: FiregraftFile[];
  /** Indexes into `files`: the project and its database. */
  project: number;
  database: number | null;
  /** When FireGraft's patcher writes it: the game's first open of `font\font8.fnt` (at a game's start, after the plugins' inits). */
  moment: typeof FIREGRAFT_MOMENT;
}

/**
 * A file the mod ships for its code rather than for the game: a module's own data, a setting. `plugin` and `module`:
 * the ids MPQDraft's server hands it to a plugin by (`GetPluginModule`), where the loader gave it ids (an SEMPQ's).
 */
export interface CarriedFile { name: string; path?: string; source?: ModuleSource; plugin?: number; module?: number; why: ModMessage }

export interface Identity {
  /** The hash's lines but the plugins', sorted: every game file the mod lays and its FireGraft project. */
  lines: string[];
  /**
   * Each module of the mod's code, by its name: its bytes' SHA-256 (a line each, `pluginLine`). Every plugin it carries
   * as a file, and since 2026-11-11 every module of its code that had no line before: a plugin a patcher exe carries
   * (FireGraft's overlay, an SEMPQ's), and a library its plugins map (a DLL in its plugins folder or beside its program).
   * The same plugin carried twice, a loader's own patcher DLL and a network provider (never loaded) have none.
   */
  plugins: Record<string, string>;
  hash: string;
  withoutPlugins: string;
  /**
   * The hash by the rule before 2026-11-11, where it is neither `hash` nor `withoutPlugins`, whatever the reason it
   * differs: then only the plugins given as files had lines (not a patcher exe's own plugins, not the libraries its
   * plugins load), and a FireGraft project found only through FireGraft's own list in an archive without a list of its
   * names had none. The same mod with all of its code; a replay tagged then, and a mod kept then, answer to it.
   */
  beforeCode?: string;
  /**
   * The hashes it had while an operating system's files had lines (until 2026-11-09), where such files were seen, and
   * `files`: the game names of those files whose lines that hash had and this one has not (a loose file where a game
   * file would be, or a member of the mod's archive, such as `glue\battle.net\backgrounds\thumbs.db`).
   */
  older?: OlderHashes & { files: string[] };
  /** The hash its `mod.json` says (a tool that lays a mod out for a runner writes one): the mod's, as that tool read it. */
  declared?: { hash: string; withoutPlugins?: string };
  /** It has code to run (a plugin to load, or a FireGraft project): whoever plays it must run the game's code live. */
  code: boolean;
  /** Its files change what the game read once at the program's start (`readsStartupData`), or an archive could not say. */
  readsStartupData: boolean;
}

/**
 * Why a file given is no part of the mod's files or code (`ModDescription.left`):
 * - `dot-folder`: under a folder whose name starts with a dot (`.git/`), a tool's own;
 * - `system`: an operating system's file (`isSystemFile`: `desktop.ini`, `__MACOSX/`, …);
 * - `game-copy`: a file of a copy of the game that is not one of its archives (under its `Maps` folder);
 * - `too-deep`: a zip inside zips deeper than the reader opens (three);
 * - `program`: an exe that holds no archive (a program only: the game's own, a launcher);
 * - `library`: a DLL neither in a `plugins` folder nor beside a program that holds the mod, which nothing loads;
 * - `same-name`: a plugin, library or FireGraft file with the file name of one taken before (the first is the mod's);
 * - `outside`: a file outside the folder the game's paths start in;
 * - `beside`: a file beside the game's folders (a read-me, notes), or one in `plugins/` or `firegraft/` that is no code.
 */
export type LeftReason = "dot-folder" | "system" | "game-copy" | "too-deep" | "program" | "library" | "same-name" | "outside" | "beside";

export interface ModDescription {
  version: 1;
  /** The name `mod.json` gives, else the one program that holds the mod at its top, else the tree's own name. */
  name: string;
  link?: string;
  /** The races `mod.json` declares; undefined where it says nothing of them. */
  races?: DataSetRace[];
  /** The mod's `mod.json` (`isModJsonPath`), where it has one: its path, and what of it is not elsewhere in the description. */
  manifest?: { path: string; base?: string; format?: number };
  /** The game the mod is for, by its files (`gameOf`). */
  game: "1.16.1" | "remastered";
  loaders: Loader[];
  /** By storm's priority, lowest first (equal priorities in the order found): laid in this order, the later wins. */
  layers: Layer[];
  /** The game files after laying: each name once, from the last layer that gives it, sorted by name. */
  files: (LayerFile & { layer: number })[];
  /** Every module, in the loader's order: the loaded first (by `order`), then those not loaded. */
  modules: Module[];
  patches: FiregraftPatch[];
  carried: CarriedFile[];
  identity: Identity;
  /** What could not be read or was left out, and anything else a person should know, as messages. */
  said: ModMessage[];
  /** Names an archive lists and does not hold, or that could not be read: by game name with the archive's path. */
  unreadable: string[];
  /** The files of a copy of the game in what was given (its archives), left out, by their paths. */
  gameCopy: string[];
  /** Every other file given that is no part of the mod, by its path, with why. */
  left: { path: string; why: LeftReason }[];
  /** Game names that two loose files of the mod's folder are, in another case: the paths, the last of which is used. */
  duplicates: { name: string; paths: string[] }[];
  /**
   * Plugins and FireGraft projects by file name, as a short list for a person: the plugin and project files (those
   * inside an archive too, which no loader loads), and the plugins a patcher exe carries in itself (`patcherPlugins`).
   */
  named: {
    plugins: string[];
    projects: string[];
    patcherPlugins: { exe: string; form: ExeForm; name: string | null; id: number }[];
  };
}

export interface ReadOptions {
  /** The person's own copy of the game, by game name: its tables name more files to look for in an archive without a list. */
  tables?: TablesOf;
  /** Hears how far the reading is. */
  progress?: (message: ModMessage) => void;
  /** Each game file's bytes as they are hashed (a caller may compare them with the person's game), by game name. */
  onFile?: (file: LayerFile & { layer: number }, bytes: Uint8Array) => Promise<void> | void;
}

/* ── The reading ─────────────────────────────────────────────── */

interface Piece { path: string; size: number; read(): Promise<Uint8Array> }
interface OpenArchive { path: string; archive: Archive; at: number; form: ExeForm | "mpq"; carried: CarriedModule[] }

const PLUGIN_FILE = /\.(qdp|bwl)$/i;
const CODE_MEMBER = /\.(qdp|bwl|fgp|fgd)$/i;

/**
 * One of `named.patcherPlugins` for a person: the exe's file name, the form, the name the plugin gives itself where it
 * gives one, its id in hex (`Made.exe (FireGraft patcher plugin GPTP.qdp, id 1b4d69b6)`).
 */
export function patcherPluginWords(p: ModDescription["named"]["patcherPlugins"][number]): ModMessageOf<"patcher-plugin"> {
  return say("patcher-plugin", { exe: leafOf(p.exe), form: p.form, named: p.name ? "yes" : "no", name: p.name ?? "", id: p.id.toString(16) });
}

/** Whether a file name is a plugin's: MPQDraft's `.qdp`, Chaoslauncher's `.bwl`. */
export const isPluginFile = (name: string): boolean => PLUGIN_FILE.test(name);
/** Whether a file name is of a mod's code rather than the game's: a plugin, FireGraft's project (`.fgp`) or database (`.fgd`). */
export const isCodeFile = (name: string): boolean => CODE_MEMBER.test(name);

/** A name for a module a carrying exe holds: its own (`GPTP.qdp`), else by its id; unique among `taken`. */
function carriedName(m: CarriedModule, taken: Set<string>): string {
  const id = m.id.toString(16).padStart(8, "0");
  let name = m.name && /\.(qdp|dll|bwl)$/i.test(m.name) ? m.name : m.file ? `module-${id}-${m.file.toString(16)}.bin` : `plugin-${id}.qdp`;
  if (taken.has(name.toLowerCase())) name = name.replace(/(\.[^.]+)$/, `-${id}$1`);
  taken.add(name.toLowerCase());
  return name;
}

/** Byte-wise order of names, as a loader's `std::sort` of file names has it. */
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The plugins among `plugins` (file modules a folder of plugins holds) in the loader's order, and those left out with
 * why. With a plugin that loads plugins (`loader`), its own rule: only `.qdp` files, a name starting with `_` left
 * out, the rest sorted by name; a plugin without MPQDraft's entry is left out as that loader leaves it. The folder
 * form: every plugin file by name. `off`: names (lower case) a caller turns off.
 */
export function plugInOrder<T extends { name: string; entry: ModuleEntry; role: ModuleRole }>(plugins: readonly T[], o: { loader: boolean; off?: ReadonlySet<string> }): { load: T[]; skipped: { module: T; why: ModMessage }[] } {
  const load: T[] = [], skipped: { module: T; why: ModMessage }[] = [];
  for (const p of [...plugins].sort((a, b) => byName(a.name, b.name))) {
    const why = p.role === "plugin-loader" ? say("why-plugin-loader", {})
      : o.loader && p.name.startsWith("_") ? say("why-underscore", {})
        : o.loader && !/\.qdp$/i.test(p.name) ? say("why-qdp-only", {})
          : o.loader && p.entry !== "mpqdraft" && p.entry !== "none" ? say("why-no-entry", {})
            : o.off?.has(p.name.toLowerCase()) ? say("why-off", {}) : null;
    if (why) skipped.push({ module: p, why }); else load.push(p);
  }
  return { load, skipped };
}

/** Plugins held by name and bytes, in the loader's order (`plugInOrder`), told from their bytes. */
export function planPlugins(plugins: readonly { name: string; bytes: Uint8Array }[], off: ReadonlySet<string> = new Set()): { load: string[]; skipped: { name: string; why: ModMessage }[] } {
  const told = plugins.map((p) => { const f = moduleFacts(p.bytes); return { name: p.name, entry: f.entry, role: (f.loadsPlugins ? "plugin-loader" : "plugin") as ModuleRole }; });
  const plan = plugInOrder(told, { loader: told.some((p) => p.role === "plugin-loader"), off });
  return { load: plan.load.map((p) => p.name), skipped: plan.skipped.map((s) => ({ name: s.module.name, why: s.why })) };
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The description of the mod in `tree`. Throws `ModReadError` for what cannot be read at all. */
export async function readMod(tree: ModFiles, o: ReadOptions = {}): Promise<ModDescription> {
  const progress = o.progress ?? (() => {});
  const game = tree.layout === "game";
  const listed = await tree.list();
  const left: { path: string; why: LeftReason }[] = [];
  // (a tool's folder: never the game's, never the mod's code; the tree's own folder name is not one of its folders)
  const all = listed.filter((e) => {
    const out = inDotFolder(game || !e.path.includes("/") ? e.path : e.path.slice(e.path.indexOf("/") + 1));
    if (out) left.push({ path: e.path, why: "dot-folder" });
    return !out;
  });
  const asPiece = (e: ModEntry): Piece => ({ path: e.path, size: e.size, read: () => tree.read(e.path) });
  const named = tree.named !== undefined ? all.find((e) => e.path === tree.named) ?? null : null;
  // (a file the person named: its folder's other files are only what Windows finds beside a program)
  const beside = named ? all.filter((e) => e !== named) : [];
  const said: ModMessage[] = [];

  // (the folder every file of the tree is in, when they are all in one: what was given's own name; "" else)
  const firstPart = (p: string) => (p.includes("/") ? p.slice(0, p.indexOf("/")) : null);
  const top = all.length && all.every((e) => firstPart(e.path) !== null && firstPart(e.path) === firstPart(all[0].path)) ? firstPart(all[0].path)! : "";
  const atTop = (path: string) => folderOf(path) === top;

  const loose: Piece[] = [], archives: OpenArchive[] = [], pluginPieces: Piece[] = [], libraryPieces: Piece[] = [], dlls: Piece[] = [], providerPieces: Piece[] = [];
  const paths: string[] = [], memberCode: string[] = [];
  const firegraft: (FiregraftFile & { read(): Promise<Uint8Array> })[] = [];
  const unreadable: string[] = [], gameCopy: string[] = [];
  // An operating system's files where a file of the mod's would be, by game name: not the mod's, read only for `older`.
  const systemLoose: Piece[] = [], system = new Map<string, () => Promise<Uint8Array>>();
  const takeFiregraft = (f: FiregraftFile & { read(): Promise<Uint8Array> }): boolean => {
    const leaf = leafOf(f.name);
    if (firegraft.some((x) => leafOf(x.name).toLowerCase() === leaf.toLowerCase())) return false;
    firegraft.push({ ...f, name: leaf });
    return true;
  };
  let modJson: Piece | null = null;
  const sameName = (list: Piece[], leaf: string) => list.some((f) => leafOf(f.path).toLowerCase() === leaf);

  const take = async (pieces: Piece[], depth: number, single: boolean, base: string): Promise<void> => {
    // A copy of the game in a list of pieces: its own archives and everything under its Maps folder are not the mod's
    // (a single file named is what it is). Never read; the archives among them are said, the rest left out.
    const copy = single ? new Set<string>() : gameCopyFiles(pieces.filter((p) => !isSystemFile(p.path)).map((p) => p.path));
    const copyArchives = [...copy].filter((p) => /\.(mpq|exe|zip)$/i.test(p));
    if (copyArchives.length) { gameCopy.push(...copyArchives); for (const m of gameCopyText(copyArchives, tree.name)) progress(m); }
    for (const p of pieces) {
      if (copy.has(p.path)) { if (!/\.(mpq|exe|zip)$/i.test(p.path)) left.push({ path: p.path, why: "game-copy" }); continue; }
      // (An operating system's file is nothing of the mod's, whatever its name ends in: macOS's `._gptp.qdp` is no plugin.)
      if (isSystemFile(p.path)) { systemLoose.push(p); left.push({ path: p.path, why: "system" }); continue; }
      paths.push(p.path);
      const lower = p.path.toLowerCase();
      let leaf = leafOf(lower);
      // (the one file named, with no extension of a mod's container: what it is by its first bytes)
      let bytes: Uint8Array | null = null;
      if (single && depth === 0 && !/\.(zip|mpq|exe)$/.test(leaf)) {
        bytes = await p.read();
        const as = isZip(bytes) ? "zip" : isMpq(bytes) ? "mpq" : programEnd(bytes) !== null ? "exe" : null;
        if (as) leaf = `${leaf}.${as}`;
      }
      if (PLUGIN_FILE.test(leaf)) { if (!sameName(pluginPieces, leaf)) pluginPieces.push(p); else left.push({ path: p.path, why: "same-name" }); }
      // (a DLL in a plugins folder: what a plugin may import. A library, in either layout, and so no game file.)
      const library = /\.dll$/.test(leaf) && lower.split("/").slice(0, -1).includes("plugins");
      if (library) { if (!sameName(libraryPieces, leaf)) libraryPieces.push(p); else left.push({ path: p.path, why: "same-name" }); }
      else if (/\.dll$/.test(leaf) && !game) dlls.push(p);
      // (a storm network provider, `*.snp` in the game's folder: a module of the mod's, which storm loads for a game
      // between people; its file stays where it was among the files, so no hash moves)
      if (/\.snp$/.test(leaf) && !sameName(providerPieces, leaf)) providerPieces.push(p);
      if (/\.(fgp|fgd)$/.test(leaf)) {
        if (!takeFiregraft({ name: p.path, size: p.size, place: folderOf(p.path), path: p.path, read: p.read })) left.push({ path: p.path, why: "same-name" });
        continue;
      }
      if (PLUGIN_FILE.test(leaf) || library || (!game && /\.dll$/.test(leaf))) continue;
      if (isModJsonPath(p.path, base) && (!modJson || p.path.split("/").length < modJson.path.split("/").length)) modJson = p;
      if (!/\.(zip|mpq|exe)$/.test(leaf)) { loose.push(p); continue; }
      progress(say("opening", { path: p.path }));
      bytes ??= await p.read();
      if (/\.zip$/.test(leaf) && isZip(bytes)) {
        if (depth > 2) { left.push({ path: p.path, why: "too-deep" }); continue; }
        const prefix = p.path.replace(/\.zip$/i, "");
        let members: ReturnType<typeof readZip>;
        try { members = readZip(bytes); }
        catch (e) { if (e instanceof ZipError) throw new ModReadError(say("zip-unreadable", { path: p.path, why: e.detail })); throw e; }
        await take(members.map((m) => ({ path: `${prefix}/${m.path}`, size: m.size, read: m.read })), depth + 1, false, single && depth === 0 ? prefix : base);
      } else if (/\.mpq$/.test(leaf) && isMpq(bytes)) {
        try { archives.push({ path: p.path, archive: Archive.open(bytes), at: 0, form: "mpq", carried: [] }); }
        catch (e) { throw new ModReadError(say("archive-unopenable", { path: p.path, why: errorText(e) })); }
      } else if (/\.exe$/.test(leaf)) {
        let found: ReturnType<typeof exeArchive>;
        try {
          found = exeArchive(bytes);
          // (no program's header to go by: an archive where storm would look for one in any file, or none)
          if (!found && programEnd(bytes) === null) { const at = archiveInFile(bytes); if (at >= 0) found = { bytes, at, form: "archive-after-program", plugins: [] }; }
        }
        catch (e) { if (e instanceof PatcherError) throw new ModReadError(say("exe-unreadable", { path: p.path, why: e.detail })); throw e; }
        // (An exe that holds no archive is a program only: StarCraft's own, a launcher. Left alone, unless it is what was named.)
        if (!found) {
          if (single && depth === 0) throw new ModReadError(say("exe-no-archive", { path: p.path }));
          left.push({ path: p.path, why: "program" });
          continue;
        }
        // (the whole exe and where the header is: the archive's tables may lie before its header)
        try { archives.push({ path: p.path, archive: Archive.open(found.bytes, { offset: found.at }), at: found.at, form: found.form, carried: found.plugins }); }
        catch (e) { throw new ModReadError(say("exe-archive-unopenable", { path: p.path, at: found.at, why: errorText(e) })); }
      } else loose.push(p);
    }
  };
  await take((named ? [named] : all).map(asPiece), 0, !!named, top);
  // (beside a named program: the DLLs Windows finds in its folder)
  if (named) for (const e of beside) if (/\.dll$/i.test(e.path) && !isSystemFile(e.path)) dlls.push(asPiece(e));

  // The archives' files, in the order given; each one's FireGraft files, and its own lists read by name.
  const layers: Layer[] = [];
  let fireIndex = 0, draftIndex = 0;
  for (const a of archives) {
    let names = (a.archive.files() ?? []).filter((n) => !n.startsWith("("));
    const probed = !names.length;
    if (probed) {
      progress(say("probing", { path: a.path }));
      names = await probeNames(a.archive, o.tables);
    }
    const leaf = leafOf(a.path).toLowerCase();
    const replaces = a.form === "mpq" && (GAME_ARCHIVES as readonly string[]).includes(leaf) && atTop(a.path) ? leaf : undefined;
    const by: LoaderKind = a.form === "firegraft-patcher" ? "firegraft-patcher" : a.form === "mpqdraft-sempq" ? "mpqdraft-sempq" : a.form === "archive-after-program" ? "self-executing" : replaces ? "replacement" : "mpqdraft";
    const priority = by === "firegraft-patcher" ? PRIORITY.firegraft + fireIndex++ : replaces ? GAME_ARCHIVE_PRIORITY[replaces as keyof typeof GAME_ARCHIVE_PRIORITY] : PRIORITY.mpqdraft + draftIndex++;
    const files: LayerFile[] = [];
    const read = (n: string) => async () => a.archive.readFile(n) ?? new Uint8Array(0);
    for (const n of names) {
      const name = gameName(n);
      // (a name the archive's list holds and its table does not: a patcher lists files it never packed. Left out.)
      let info: ReturnType<Archive["fileInfo"]> = null;
      try { info = a.archive.fileInfo(n); } catch { info = null; }
      if (!info) { unreadable.push(`${name} (${a.path})`); continue; }
      // (An archive packed from a folder Explorer had been in holds its desktop.ini too: not the mod's.)
      if (isSystemFile(name)) { system.set(name, read(n)); continue; }
      if (/\.(fgp|fgd)$/.test(name)) takeFiregraft({ name: n, size: info.uncompressedSize, place: a.path, archive: a.path, member: n, read: read(n) });
      if (CODE_MEMBER.test(name)) { paths.push(n); memberCode.push(n); continue; }
      files.push({ name, size: info.uncompressedSize, member: n });
    }
    // FireGraft's own lists, read by name (an archive without a list holds them all the same): the project its
    // datalist names is found as the patcher finds it. Not game files of the mod's when the archive does not list them.
    const datalist = (() => { try { return a.archive.fileInfo(FIREGRAFT_LISTS[0]) ? a.archive.readFile(FIREGRAFT_LISTS[0]) : null; } catch { return null; } })();
    const fromList = listedNames(datalist);
    if (probed) for (const n of fromList) {
      if (!/\.(fgp|fgd)$/i.test(n)) continue;
      let info: ReturnType<Archive["fileInfo"]> = null;
      try { info = a.archive.fileInfo(n); } catch { info = null; }
      if (info) takeFiregraft({ name: n, size: info.uncompressedSize, place: a.path, archive: a.path, member: n, byList: true, read: read(n) });
    }
    layers.push({ kind: "archive", path: a.path, at: a.at, priority, by, ...(replaces ? { replaces } : {}), files, ...(probed ? { probed: true } : {}) });
  }

  // The loose files: the game's paths start at the folder that holds the game's folders (`modRoot`), decided by the
  // loose files alone. With none of the game's folders among them, they start at the folder everything given is in
  // (its own name), never at a folder made up of what sits beside a program or inside an archive. A folder of a
  // plugin's own files beside the plugins, `samase/mtl.ini` with `plugins/mtl.qdp`, is then read as the game's
  // `samase\mtl.ini`, as the plugin asks for it, and a read-me beside a mod's exe is beside the game's paths.
  const underGameFolder = (path: string) => path.toLowerCase().split("/").slice(0, -1).some((f) => f !== "maps" && GAME_FOLDERS.includes(f));
  const root = game ? "" : loose.some((p) => underGameFolder(p.path)) ? modRoot(loose.map((p) => p.path)) : top && !GAME_FOLDERS.includes(top.toLowerCase()) ? top : "";
  // The game's paths are folders; a file beside them (a read-me, the mod's own notes) is not one of the game's, nor one
  // beside the plugins or the FireGraft project. Handed over in the game's paths, each is a member of the mod's archive.
  const gameFile = (rel: string) => game || (rel.includes("/") && !["plugins", "firegraft"].includes(rel.split("/")[0].toLowerCase()));
  const looseFiles: (LayerFile & { read(): Promise<Uint8Array> })[] = [];
  const json = modJson as Piece | null;
  // (the manifest and a network provider are the mod's, though no game file)
  const leaveOut = (p: Piece, why: LeftReason) => { if (p !== json && !providerPieces.includes(p)) left.push({ path: p.path, why }); };
  for (const p of loose) {
    if (root && !p.path.startsWith(root + "/")) { leaveOut(p, "outside"); continue; }
    const rel = root ? p.path.slice(root.length + 1) : p.path;
    if (!gameFile(rel)) { leaveOut(p, "beside"); continue; }
    looseFiles.push({ name: gameName(rel), size: p.size, path: p.path, read: p.read });
  }
  for (const p of systemLoose) {
    // (macOS's half of a plugin or of a project was taken for a plugin or a project then, not for a game file: the hash
    // such a mod had is not worked out again)
    if (/\.(qdp|bwl|fgp|fgd|dll)$/i.test(p.path)) continue;
    if (root && !p.path.startsWith(root + "/")) continue;
    const rel = root ? p.path.slice(root.length + 1) : p.path;
    if (!gameFile(rel)) continue;
    system.set(gameName(rel), p.read);
  }
  // (two loose files for one game name, in another case: the last is laid, as a later layer wins)
  const duplicates: ModDescription["duplicates"] = [];
  const byGameName = new Map<string, string[]>();
  for (const f of looseFiles) { const list = byGameName.get(f.name); if (list) list.push(f.path!); else byGameName.set(f.name, [f.path!]); }
  for (const [name, list] of byGameName) if (list.length > 1) duplicates.push({ name, paths: list });

  // The modules: the plugins and files a self-executing exe carries, the plugin files, the libraries.
  const told = new Map<Piece | CarriedModule, Awaited<ReturnType<typeof factsOf>>>();
  const factsOf = async (bytes: Uint8Array) => ({ ...moduleFacts(bytes), sha256: await sha256Hex(bytes) });
  // (DLLs beside a program that holds the mod: Windows looks in the program's folder first)
  const programs = new Set(archives.filter((a) => a.form !== "mpq").map((a) => folderOf(a.path)));
  const besideProgram = dlls.filter((d) => named || programs.has(folderOf(d.path)));
  for (const d of dlls) if (!besideProgram.includes(d) && !named) left.push({ path: d.path, why: "library" });
  for (const p of [...pluginPieces, ...libraryPieces, ...besideProgram, ...providerPieces]) told.set(p, await factsOf(await p.read()));
  const fileModules: Module[] = pluginPieces.map((p) => {
    const f = told.get(p)!;
    return { name: leafOf(p.path), role: f.loadsPlugins ? "plugin-loader" : f.entry === "snp" ? "provider" : "plugin", entry: f.entry, samase: f.samase, id: null, source: { kind: "file", path: p.path }, size: p.size, sha256: f.sha256, load: false };
  });
  const bySha = new Map(fileModules.map((m) => [m.sha256, m.name]));
  const taken = new Set(fileModules.map((m) => m.name.toLowerCase()));
  const carriedModules: Module[] = [], carried: CarriedFile[] = [];
  for (const a of archives) for (const [index, c] of a.carried.entries()) {
    const f = await factsOf(c.bytes);
    const source: ModuleSource = { kind: "carried", exe: a.path, form: a.form as ExeForm, index, at: c.at, size: c.size, file: c.file };
    // (an SEMPQ's entries that are not run: MPQDraft's own patcher DLL, and the data files of its plugins)
    if (a.form === "mpqdraft-sempq" && c.id === MPQDRAFT_COMPONENT && c.file === MPQDRAFT_DLL_MODULE) { carriedModules.push({ name: carriedName(c, taken), role: "patcher", entry: f.entry, samase: f.samase, id: c.id, source, size: c.size, sha256: f.sha256, load: false, why: say("why-mpqdraft-patcher", {}) }); continue; }
    if (!c.execute) { carried.push({ name: carriedName(c, taken), source, plugin: c.id, module: c.file ?? 0, why: say("why-plugin-data", { id: c.id.toString(16).padStart(8, "0") }) }); continue; }
    const sameAs = bySha.get(f.sha256);
    carriedModules.push({ name: sameAs ?? carriedName(c, taken), role: f.loadsPlugins ? "plugin-loader" : "plugin", entry: f.entry, samase: f.samase, id: c.id, source, size: c.size, sha256: f.sha256, ...(sameAs ? { sameAs } : {}), load: false });
  }
  for (const n of memberCode) if (PLUGIN_FILE.test(n)) carried.push({ name: leafOf(n), source: { kind: "member", archive: archives.find((a) => { try { return !!a.archive.fileInfo(n); } catch { return false; } })?.path ?? "", member: n }, why: say("why-plugin-in-archive", {}) });
  // (DLLs: those in a plugins folder, then those beside a program that holds the mod)
  const libraryModules: Module[] = [];
  const libSeen = new Set<string>();
  for (const p of [...libraryPieces].sort((a, b) => byName(leafOf(a.path), leafOf(b.path))).concat([...besideProgram].sort((a, b) => byName(a.path, b.path)))) {
    const name = leafOf(p.path);
    if (libSeen.has(name.toLowerCase())) { left.push({ path: p.path, why: "same-name" }); continue; }
    libSeen.add(name.toLowerCase());
    const f = told.get(p)!;
    libraryModules.push({ name, role: f.entry === "snp" ? "provider" : "library", entry: f.entry, samase: f.samase, id: null, source: { kind: "file", path: p.path }, size: p.size, sha256: f.sha256, load: false, why: say("why-library", {}) });
  }
  for (const p of [...providerPieces].sort((a, b) => byName(a.path, b.path))) {
    const name = leafOf(p.path);
    if (libSeen.has(name.toLowerCase())) continue;
    libSeen.add(name.toLowerCase());
    const f = told.get(p)!;
    libraryModules.push({ name, role: "provider", entry: f.entry, samase: f.samase, id: null, source: { kind: "file", path: p.path }, size: p.size, sha256: f.sha256, load: false, why: say("why-provider", {}) });
  }
  // The loader's order: a carrying exe's plugins first, in its order (its loader loads them before anything of the
  // folder's), then the folder's plugins by their loader's rule.
  const pluginLoader = [...carriedModules, ...fileModules].find((m) => m.role === "plugin-loader") ?? null;
  let order = 0;
  for (const m of carriedModules) {
    if (m.role === "patcher") continue;
    if (m.sameAs) { m.why = say("why-same-plugin", { name: m.sameAs }); continue; }
    if (m.role === "plugin-loader") { m.why = say("why-plugin-loader", {}); continue; }
    m.load = true; m.order = order++;
  }
  const plan = plugInOrder(fileModules, { loader: !!pluginLoader });
  for (const m of plan.load) { m.load = true; m.order = order++; }
  for (const s of plan.skipped) s.module.why = s.why;
  const modules = [...carriedModules, ...fileModules, ...libraryModules].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  // The layers: the archives, then the loose files. With a plugin that loads plugins, the folder of files is its packed
  // folder (opened at 500000); else it is the folder form.
  // (a folder of no files is a layer only where a plugin that loads plugins lays it: it is that loader's to fill)
  const hasFolder = looseFiles.length > 0 || (!!root && !!pluginLoader);
  if (hasFolder) {
    const byLoader = !!pluginLoader;
    layers.push({ kind: "folder", path: root, priority: byLoader ? PRIORITY.pluginLoader : PRIORITY.folder, by: byLoader ? "plugin-loader" : "folder", files: looseFiles.map(({ read: _read, ...f }) => f) });
  }
  // A plugin that loads plugins packs its folder of files into an archive of its own and opens that: an archive beside
  // it that it names in its own bytes is that packing, not a layer of its own. With the folder there, the folder is laid
  // in its place (what the loader packs from it); without, the archive is laid where the loader opens it.
  const cacheOf = new Map<string, string>();
  if (pluginLoader) {
    const piece = pluginLoader.source.kind === "file" ? pluginPieces.find((p) => p.path === (pluginLoader.source as { path: string }).path) : null;
    const carriedBy = pluginLoader.source.kind === "carried" ? archives.find((a) => a.path === (pluginLoader.source as { exe: string }).exe)?.carried[(pluginLoader.source as { index: number }).index] : null;
    const bytes = piece ? await piece.read() : carriedBy?.bytes ?? null;
    for (const l of [...layers]) {
      const a = l.kind === "archive" ? archives.find((x) => x.path === l.path) : null;
      if (!bytes || !a || a.form !== "mpq" || l.replaces) continue;
      const leaf = leafOf(a.path);
      if (!holdsString(bytes, leaf) && !holdsString(bytes, leaf.toLowerCase())) continue;
      cacheOf.set(a.path, pluginLoader.name);
      if (looseFiles.length) { layers.splice(layers.indexOf(l), 1); said.push(say("packing-laid-instead", { path: a.path, loader: pluginLoader.name, priority: PRIORITY.pluginLoader })); }
      else { l.priority = PRIORITY.pluginLoader; l.by = "plugin-loader"; }
    }
  }
  // Laid as storm searches them: by priority, lowest first, so that the later wins (equal ones in the order found).
  layers.sort((a, b) => a.priority - b.priority);
  // (each game file from the last layer that gives it)
  const readers = new Map<string, () => Promise<Uint8Array>>();
  const winner = new Map<string, LayerFile & { layer: number }>();
  const looseByPath = new Map(looseFiles.map((f) => [f.path!, f.read]));
  layers.forEach((l, k) => {
    const a = l.kind === "archive" ? archives.find((x) => x.path === l.path)! : null;
    for (const f of l.files) {
      winner.set(f.name, { ...f, layer: k });
      readers.set(f.name, a ? async () => a.archive.readFile(f.member!) ?? new Uint8Array(0) : looseByPath.get(f.path!)!);
    }
  });
  const files = [...winner.values()].sort((a, b) => byName(a.name, b.name));

  // A copy of the game with nothing of a mod beside it.
  const copies = gameCopyFolders(gameCopy);
  if (copies.length && !archives.length && !pluginPieces.length && !firegraft.length && !loose.some((p) => underGameFolder(p.path))) said.push(say("copy-only", { folder: copies[0].folder || tree.name }));

  // The hash: every game file the mod lays, its FireGraft projects, every module of its code.
  const lines: string[] = [];
  let done = 0, last = 0;
  for (const f of files) {
    let bytes: Uint8Array;
    try { bytes = await readers.get(f.name)!(); }
    catch { const l = layers[f.layer]; unreadable.push(l.kind === "archive" ? `${f.name} (${l.path})` : f.name); done++; continue; }
    lines.push(`${f.name}\t${await sha256Hex(bytes)}`);
    await o.onFile?.(f, bytes);
    done++;
    if (Date.now() - last > 200) { last = Date.now(); progress(say("reading-files", { done, total: files.length })); }
  }
  // (each FireGraft project, found by a list or a folder, or only through FireGraft's own list in an archive that has
  // none: it changes the game either way. Until 2026-11-11 the last had no line: `was` are the lines as they were.)
  const was = [...lines];
  for (const f of firegraft) {
    if (!/\.fgp$/i.test(f.name)) continue;
    const line = firegraftLine(f.name, await sha256Hex(await f.read()));
    lines.push(line);
    if (!f.byList) was.push(line);
  }
  // (every module of its code: the plugin files, then what had no line until 2026-11-11 — a patcher's own plugins and the
  // libraries its plugins map)
  const pluginSha: Record<string, string> = {};
  for (const m of fileModules) pluginSha[m.name] = m.sha256;
  const fileLines = Object.entries(pluginSha).map(([n, sha]) => pluginLine(n, sha));
  for (const m of [...carriedModules, ...libraryModules]) if (hasCodeLine(m)) pluginSha[m.name] ??= m.sha256;
  const pluginLines = Object.entries(pluginSha).map(([n, sha]) => pluginLine(n, sha));
  const hash = await hashLines([...lines, ...pluginLines]), withoutPlugins = await hashLines(lines);
  // (the hash by the rule before 2026-11-11: the plugin files' lines alone, no line for a project found only by its list)
  const before = await hashLines([...was, ...fileLines]);
  const beforeCode = before !== hash && before !== withoutPlugins ? before : undefined;
  // The hash it had while an operating system's files counted, where any were seen: every line by the rule then, theirs
  // with them (and the plugin files' lines alone, as the code had then).
  let older: Identity["older"];
  if (system.size) {
    const were = [...was], counted: string[] = [];
    for (const [name, read] of system) { try { were.push(`${name}\t${await sha256Hex(await read())}`); counted.push(name); } catch { /* left out then too */ } }
    if (counted.length) older = { hash: await hashLinesAsWere([...were, ...fileLines]), ...(fileLines.length ? { withoutPlugins: await hashLinesAsWere(were) } : {}), files: counted.sort() };
  }

  // mod.json: its name, its makers' address, its races, the game it is for, the hash a tool wrote.
  let name = tree.name, link: string | undefined, races: DataSetRace[] | undefined, declared: Identity["declared"], manifest: ModDescription["manifest"];
  let namedByJson = false;
  if (json) {
    const m = readModJson(new TextDecoder().decode(await json.read()));
    if (!m) said.push(say("json-unreadable", { path: json.path }));
    else {
      manifest = { path: json.path, ...(m.base !== undefined ? { base: m.base } : {}), ...(m.format !== undefined ? { format: m.format } : {}) };
      if (m.name) { name = m.name; namedByJson = true; }
      link = m.link; races = m.races; declared = m.declared;
      if (m.format !== undefined) said.push(say("text-folder", { path: json.path, format: m.format }));
    }
  }
  // (else a release is named after the one program at its top that holds it)
  const holders = archives.filter((a) => a.form !== "mpq" && atTop(a.path));
  if (!namedByJson && !named && holders.length === 1) name = leafOf(holders[0].path).replace(/\.exe$/i, "");

  // The loaders, outermost first.
  const loaders: Loader[] = [];
  for (const a of archives) {
    const words = a.form === "firegraft-patcher" ? say("loader-firegraft", { plugins: a.carried.length })
      : a.form === "mpqdraft-sempq" ? say("loader-sempq", { files: a.carried.length })
        : a.form === "archive-after-program" ? say("loader-self-executing", {})
          : layers.find((l) => l.path === a.path)?.replaces ? say("loader-replacement", { name: leafOf(a.path) }) : say("loader-mpqdraft", {});
    const cache = cacheOf.get(a.path);
    loaders.push({ kind: layers.find((l) => l.path === a.path)?.by ?? "plugin-loader", path: a.path, words: cache ? say("loader-packing", { loader: cache, priority: PRIORITY.pluginLoader, laid: layers.some((l) => l.path === a.path) ? "no" : "yes" }) : words });
  }
  if (pluginLoader) loaders.push({ kind: "plugin-loader", path: pluginLoader.name, words: say("loader-plugin-loader", { priority: PRIORITY.pluginLoader }) });
  else if (looseFiles.length || pluginPieces.length) loaders.push({ kind: "folder", path: root, words: say("loader-folder", {}) });

  if (unreadable.length) said.push(say("unheld", { list: unreadable.slice(0, 3).join(", "), more: Math.max(0, unreadable.length - 3) }));
  for (const d of duplicates) said.push(say("duplicate", { name: d.name, paths: d.paths.join(", ") }));
  const copyWords: ModMessageOf<"game-copy">[] = gameCopyText(copies.flatMap((c) => c.paths), tree.name);
  said.push(...copyWords);
  if (!files.length && !said.some((s) => s.key === "game-copy" || s.key === "copy-only")) said.push(say("no-game-files", { name: tree.name }));

  const fg = firegraftPick(firegraft);
  const patches: FiregraftPatch[] = fg.project === null ? [] : [{ kind: "firegraft", files: firegraft.map(({ read: _read, ...f }) => f), project: fg.project, database: fg.database, moment: FIREGRAFT_MOMENT }];
  const names = files.map((f) => f.name);
  return {
    version: 1, name, ...(link ? { link } : {}), ...(races !== undefined ? { races } : {}), ...(manifest ? { manifest } : {}),
    game: gameOf(names),
    loaders, layers, files, modules, patches, carried,
    identity: {
      lines: lines.sort(), plugins: pluginSha, hash, withoutPlugins, ...(beforeCode ? { beforeCode } : {}), ...(older ? { older } : {}), ...(declared ? { declared } : {}),
      code: modules.some((m) => m.load) || patches.length > 0,
      readsStartupData: readsStartupData(names) || layers.some((l) => l.probed && !l.files.length),
    },
    said, unreadable, gameCopy: copies.flatMap((c) => c.paths), left, duplicates,
    named: {
      plugins: [...new Set(paths.filter((p) => PLUGIN_FILE.test(p)).map(leafOf))].sort(),
      projects: [...new Set(paths.filter((p) => /\.fgp$/i.test(p)).map(leafOf))].sort(),
      patcherPlugins: archives.flatMap((a) => a.carried.filter((c) => c.execute && !(c.id === MPQDRAFT_COMPONENT && c.file === MPQDRAFT_DLL_MODULE)).map((c) => ({ exe: a.path, form: a.form as ExeForm, name: c.name, id: c.id }))),
    },
  };
}

/**
 * A file of the tree by its path in the description: a file the tree lists, or a member of a zip in it (a layer, a
 * module or a project the reader found inside a zip it opened: `pack.zip` lists as `pack/…`).
 */
export async function readPath(tree: ModFiles, path: string): Promise<Uint8Array> {
  const listed = new Set((await tree.list()).map((e) => e.path));
  if (listed.has(path)) return tree.read(path);
  const parts = path.split("/");
  for (let k = parts.length - 1; k >= 1; k--) {
    const zip = `${parts.slice(0, k).join("/")}.zip`;
    if (!listed.has(zip)) continue;
    const inner = zipFiles(zip, await tree.read(zip), parts.slice(0, k).join("/"));
    return readPath(inner, path);
  }
  throw new ModReadError(say("not-in-tree", { path, name: tree.name }));
}

/**
 * A reader of each game file of the description (`files`), each archive opened once: what a caller keeps to read a file
 * of the mod later.
 */
export function fileReaders(tree: ModFiles, d: ModDescription): (f: LayerFile & { layer: number }) => () => Promise<Uint8Array> {
  const open = new Map<number, Promise<Archive>>();
  return (f) => {
    const l = d.layers[f.layer];
    if (l.kind === "folder") return () => readPath(tree, f.path!);
    return async () => {
      if (!open.has(f.layer)) open.set(f.layer, openLayer(tree, l));
      return (await open.get(f.layer)!).readFile(f.member!) ?? new Uint8Array(0);
    };
  };
}

/** The bytes of a module of the description, or of a file it carries (`tree`: the files it was read from). */
export async function moduleBytes(tree: ModFiles, m: { name: string; source?: ModuleSource }): Promise<Uint8Array> {
  const s = m.source;
  if (!s) throw new ModReadError(say("module-no-source", { name: m.name }));
  if (s.kind === "file") return readPath(tree, s.path);
  if (s.kind === "carried") return (await readPath(tree, s.exe)).subarray(s.at, s.at + s.size);
  throw new ModReadError(say("module-in-archive", { name: m.name, archive: s.archive }));
}

/** An archive layer of the description opened (an `.mpq`, or the archive inside an exe, at its header). */
export async function openLayer(tree: ModFiles, l: Layer): Promise<Archive> {
  return Archive.open(await readPath(tree, l.path), l.at ? { offset: l.at } : undefined);
}

/** The bytes of a FireGraft file of the description. */
export async function firegraftBytes(tree: ModFiles, d: ModDescription, f: FiregraftFile): Promise<Uint8Array> {
  if (f.path !== undefined) return readPath(tree, f.path);
  const l = d.layers.find((x) => x.path === f.archive);
  if (!l) throw new ModReadError(say("firegraft-archive-missing", { name: f.name, archive: f.archive ?? "" }));
  const b = (await openLayer(tree, l)).readFile(f.member!);
  if (!b) throw new ModReadError(say("firegraft-unreadable", { name: f.name, path: l.path }));
  return b;
}

/** The project and database of a description's FireGraft patch, read (null without one). */
export async function firegraftFilesOf(tree: ModFiles, d: ModDescription): Promise<{ name: string; fgp: Uint8Array; fgd: Uint8Array | null; from: string } | null> {
  const p = d.patches[0];
  if (!p) return null;
  const project = p.files[p.project], database = p.database === null ? null : p.files[p.database];
  return { name: project.name, fgp: await firegraftBytes(tree, d, project), fgd: database ? await firegraftBytes(tree, d, database) : null, from: project.place };
}
