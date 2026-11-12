// Mods made for the tests: a folder, FireGraft patcher exes, a release with a plugin that loads plugins, archives given
// together. As pieces (path, size, bytes when asked); `treeOf` makes them a tree for `readMod`.
import { Creator } from "mopaq";
import { library, modArchive, patcherExe } from "./patcherExe.ts";
import { dll } from "./madePe.ts";
import { filesOf, type ModFiles } from "../../src/index.ts";

export type Piece = { path: string; size: number; read(): Promise<Uint8Array> };
const text = (s: string) => new TextEncoder().encode(s);
export const pieces = (prefix: string, files: Record<string, Uint8Array | string>): Piece[] =>
  Object.entries(files).map(([path, d]) => { const b = typeof d === "string" ? text(d) : d; return { path: prefix ? `${prefix}/${path}` : path, size: b.length, read: async () => b }; });

/**
 * A plugin that loads plugins, made: MPQDraft's entry exported, `LoadLibraryA` imported, `GetMPQDraftPlugin` asked for by
 * name; `packs`: the name of the archive it packs its folder of files into, held as a string of its own.
 */
export const madeLoader = (packs?: string): Uint8Array => {
  const ask = [..."GetMPQDraftPlugin"].map((c) => c.charCodeAt(0));
  const own: [number, number[]][] = packs ? [[0x1140, [0, ...[...packs].map((c) => c.charCodeAt(0)), 0]]] : [];
  return dll({ base: 0x10000000, bytes: [[0x1100, [0, ...ask, 0]], ...own], exports: [{ name: "GetMPQDraftPlugin", ordinal: 1, rva: 0x1000 }], imports: [{ dll: "KERNEL32.dll", names: ["LoadLibraryA", "GetProcAddress", "FindFirstFileA"] }] }).file;
};

/** Pieces as a tree of files in memory, under `name` (`named`: the one file the person named). */
export const treeOf = async (name: string, ps: Piece[], o: { named?: string } = {}): Promise<ModFiles> =>
  filesOf(name, Object.fromEntries(await Promise.all(ps.map(async (p) => [p.path, await p.read()] as const))), o);

/** The mods made for the pins. */
export const MADE = {
  folder: () => pieces("Made Mod", {
    "arr/units.dat": "units", "rez/stat_txt.tbl": "strings", "unit/terran/marine.grp": "marine", "readme.txt": "notes",
    "plugins/b.qdp": "plugin b", "plugins/a.qdp": "plugin a", "plugins/msvcp140.dll": "runtime", "plugins/apply": "a list",
    "Firegraft/datalist.txt": "a list", "firegraft/Made.fgp": "project", "firegraft/1161.fgd": "database",
    "sound/desktop.ini": "[.ShellClassInfo]", "mod.json": JSON.stringify({ name: "Made Mod", link: "https://example.org/made" }),
  }),
  patcher: () => { const { exe } = patcherExe([{ id: 0x45445545, bytes: library("qdp.dll") }, { id: 0x1b4d69b6, bytes: library("GPTP.qdp") }], modArchive()); return pieces("", { "Made.exe": exe }); },
  unlisted: () => { const { exe } = patcherExe([{ id: 0x1b4d69b6, bytes: library("GPTP-v2.41.qdp") }], modArchive(false), { tablesFirst: true }); return pieces("", { "Unlisted.exe": exe }); },
  release: () => {
    const loader = madeLoader();
    const { exe } = patcherExe([{ id: 0xfc724f8c, bytes: loader }], modArchive());
    return pieces("Release", { "Release.exe": exe, "discord.dll": "a library beside the exe", "README.md": "read me", "mpq/arr/units.dat": "u", "mpq/unit/thingy/x.grp": "g", "plugins/_loader.qdp": loader, "plugins/gptp.qdp": "p", "plugins/aise.qdp": "q" });
  },
  archives: () => {
    const a = new Creator({ sectorSize: 4096, listfile: true }); a.addFile("arr\\weapons.dat", new Uint8Array([1, 2, 3])); a.addFile("rez\\stat_txt.tbl", text("old"));
    const b = new Creator({ sectorSize: 4096, listfile: true }); b.addFile("rez\\stat_txt.tbl", text("new"));
    return pieces("", { "first.mpq": a.write(), "second.mpq": b.write() });
  },
};

