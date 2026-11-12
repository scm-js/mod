// The mod's name between people: the hashes, the hashes without plugins and the lines the reader gives mods made
// here, pinned (the values the readers this one replaced gave, byte for byte), and the rules that moved them on purpose:
// since 2026-11-09 an operating system's file has no line (`older` keeps the hash it had), and since 2026-11-11 every
// module of a mod's code has one, and so has a FireGraft project found only through FireGraft's own list in an archive
// without a list of its names (`beforeCode` keeps the hash it had). Made data only.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Creator } from "mopaq";
import { filesOf, hashLines, hashLinesAsWere, hasCodeLine, isSystemFile, pluginLine, readMod, runningHash, SYSTEM_FILES } from "../src/index.ts";
import { library, modArchive, patcherExe } from "./support/patcherExe.ts";
import { MADE, pieces, treeOf, type Piece } from "./support/madeMods.ts";

/** The values given before every module of a mod's code had a line (2026-11-11). */
const PINS: Record<keyof typeof MADE, { hash: string; withoutPlugins: string; lines: number; total: number; older?: string }> = {
  folder: { hash: "16588089799dd2c6", withoutPlugins: "9c8ee0a531cf9165", lines: 4, total: 3, older: "37fa6fe78082681f" },
  patcher: { hash: "fe8ce40250773439", withoutPlugins: "fe8ce40250773439", lines: 3, total: 2 },
  unlisted: { hash: "eea56b519dca4872", withoutPlugins: "eea56b519dca4872", lines: 1, total: 1 },
  release: { hash: "26bce9c799273bc1", withoutPlugins: "31dfbf31b2b6d395", lines: 5, total: 4 },
  archives: { hash: "1d7f6787dfe99d50", withoutPlugins: "1d7f6787dfe99d50", lines: 2, total: 2 },
};
/** The hash each has since: the folder's runtime DLL, the patchers' own plugins, the release's library beside its program. */
const WITH_CODE: Record<keyof typeof MADE, string> = { folder: "a5558ba86fb8bc3c", patcher: "90abbf9c816345d4", unlisted: "76ab6a4dc8f8f387", release: "dd5f0aa9d39f55ab", archives: "1d7f6787dfe99d50" };
/** What moved besides the hash: the unlisted patcher's project has its line now (its hash before is its `beforeCode`). */
const SINCE: Partial<Record<keyof typeof MADE, { withoutPlugins: string; lines: number }>> = { unlisted: { withoutPlugins: "b9ae0a88907ac8b6", lines: 2 } };
const NAMED: Partial<Record<keyof typeof MADE, string>> = { patcher: "Made.exe", unlisted: "Unlisted.exe" };
const NAME: Record<keyof typeof MADE, string> = { folder: "Made Mod", patcher: "Made", unlisted: "Unlisted", release: "Release", archives: "first" };
const read = async (k: keyof typeof MADE) => readMod(await treeOf(NAME[k], MADE[k](), NAMED[k] ? { named: NAMED[k] } : {}));

describe("the mod's hash, pinned", () => {
  for (const k of Object.keys(MADE) as (keyof typeof MADE)[]) {
    it(`gives a made ${k} the hash it had`, async () => {
      const { identity: id, files } = await read(k);
      expect(id.hash).toBe(WITH_CODE[k]);
      // (what it went by before: answered to as all of its code, or as none of its plugins where it was that)
      const before = id.beforeCode ?? (id.hash === PINS[k].hash ? id.hash : id.withoutPlugins);
      expect({ hash: before, withoutPlugins: id.withoutPlugins, lines: id.lines.length, total: files.length, ...(id.older ? { older: id.older.hash } : {}) }).toEqual({ ...PINS[k], ...SINCE[k] });
      expect(await hashLines(id.lines)).toBe(id.withoutPlugins);
      expect(await hashLines([...id.lines, ...Object.entries(id.plugins).map(([n, s]) => pluginLine(n, s))])).toBe(id.hash);
    });
  }
});

describe("a FireGraft project found only through FireGraft's own list", () => {
  it("has its line as a listed one: the same project listed and unlisted, one hash; the hash before is the earlier rule's", async () => {
    const exe = (list: boolean) => patcherExe([{ id: 0x1b4d69b6, bytes: library("GPTP.qdp") }], modArchive(list), { tablesFirst: !list }).exe;
    const read1 = async (list: boolean) => readMod(await treeOf("Made", pieces("", { "Made.exe": exe(list) }), { named: "Made.exe" }));
    const [listed, unlisted] = [await read1(true), await read1(false)];
    expect(unlisted.layers[0].probed).toBe(true);
    expect(unlisted.patches[0].files[unlisted.patches[0].project]).toMatchObject({ name: "Made.fgp", byList: true });
    // (the datalist itself is a game file only where the archive lists it: compared without it)
    const noList = (lines: string[]) => lines.filter((l) => !l.startsWith("firegraft\\datalist.txt\t"));
    expect(noList(listed.identity.lines)).toEqual(unlisted.identity.lines);
    expect(unlisted.identity.lines.some((l) => l.startsWith("made.fgp\t"))).toBe(true);
    // (the same game, by the same rule: the archive without its datalist line is the same project)
    const bare = await hashLines(noList(listed.identity.lines));
    expect(unlisted.identity.withoutPlugins).toBe(bare);
    expect(unlisted.identity.hash).toBe(await hashLines([...noList(listed.identity.lines), ...Object.entries(listed.identity.plugins).map(([n, x]) => pluginLine(n, x))]));
    // (the earlier rule: no line for that project, and none for the patcher's own plugin)
    expect(unlisted.identity.beforeCode).toBe(await hashLines(unlisted.identity.lines.filter((l) => !l.startsWith("made.fgp\t"))));
    expect(listed.identity.beforeCode).toBeUndefined();
  });
});

describe("every module of a mod's code names the mod", () => {
  /** A patcher exe with FireGraft's two plugins in its overlay; `touch` changes one byte of the second. */
  const patcher = (touch = false) => {
    const gptp = library("GPTP.qdp");
    if (touch) gptp[gptp.length - 1] ^= 1;
    return pieces("", { "Made.exe": patcherExe([{ id: 0x45445545, bytes: library("qdp.dll") }, { id: 0x1b4d69b6, bytes: gptp }], modArchive()).exe });
  };
  const exe = async (ps: Piece[]) => (await readMod(await treeOf("Made", ps, { named: "Made.exe" }))).identity;
  const folder = (runtime: string) => pieces("Mod", { "arr/units.dat": "units", "plugins/a.qdp": "plugin a", "plugins/msvcp140.dll": runtime });

  it("the same patcher exe: one hash; one byte of its own plugin other: another hash, the same files", async () => {
    const [a, b, c] = [await exe(patcher()), await exe(patcher()), await exe(patcher(true))];
    expect(Object.keys(a.plugins).sort()).toEqual(["GPTP.qdp", "qdp.dll"]);
    expect(b.hash).toBe(a.hash);
    expect(c.hash).not.toBe(a.hash);
    expect(c.plugins["qdp.dll"]).toBe(a.plugins["qdp.dll"]);
    expect(c.plugins["GPTP.qdp"]).not.toBe(a.plugins["GPTP.qdp"]);
    expect(c.withoutPlugins).toBe(a.withoutPlugins);
    // (a patcher's own plugins had no line before: what it went by is its hash without plugins, so no `beforeCode`)
    expect(a.beforeCode).toBeUndefined();
  });

  it("a library its plugins map: another runtime, another hash, the same hash before", async () => {
    const [a, b] = [(await readMod(await treeOf("Mod", folder("runtime 1")))).identity, (await readMod(await treeOf("Mod", folder("runtime 2")))).identity];
    expect(a.hash).not.toBe(b.hash);
    expect(a.beforeCode).toBe(b.beforeCode);
  });

  it("a DLL beside a mod's plugins is a library, and a line of the hash as a plugin is", async () => {
    const mod = { "arr/units.dat": "made units", "plugins/lister.qdp": "a plugin" };
    const plain = await readMod(await treeOf("a mod", pieces("a mod", mod)));
    const carried = await readMod(await treeOf("a mod", pieces("a mod", { ...mod, "plugins/msvcp140.dll": "a runtime", "plugins/vcruntime140.dll": "another", "readme/x.dll": "not beside the plugins" })));
    expect(carried.modules.filter((m) => m.role === "library").map((m) => m.name)).toEqual(["msvcp140.dll", "vcruntime140.dll"]);
    expect(carried.modules.filter((m) => m.role === "plugin").map((m) => m.name)).toEqual(["lister.qdp"]);
    expect(carried.left).toEqual([{ path: "a mod/readme/x.dll", why: "library" }]);
    expect(carried.identity.hash).not.toBe(plain.identity.hash);
    expect(Object.keys(carried.identity.plugins).sort()).toEqual(["lister.qdp", "msvcp140.dll", "vcruntime140.dll"]);
    expect(carried.identity.lines).toEqual(plain.identity.lines);
    expect(carried.identity.beforeCode).toBe(plain.identity.hash);
    expect(plain.modules.filter((m) => m.role === "library")).toEqual([]);
    expect(plain.identity.beforeCode).toBeUndefined();
  });

  it("gives a line to what `hasCodeLine` says, and to nothing else", () => {
    expect(["plugin", "plugin-loader", "library"].map((role) => hasCodeLine({ role }))).toEqual([true, true, true]);
    expect(["patcher", "provider"].map((role) => hasCodeLine({ role }))).toEqual([false, false]);
    expect(hasCodeLine({ role: "plugin", sameAs: "a.qdp" })).toBe(false);
  });
});

describe("the game's paths are told by the game's folders, not by what sits beside a program", () => {
  // (a patcher whose archive lists its FireGraft project: its code members are no path of the folder's)
  const exe = () => patcherExe([{ id: 0x1b4d69b6, bytes: library("GPTP.qdp") }], modArchive()).exe;
  const folder = async (files: Record<string, string | Uint8Array>) => readMod(await treeOf("Mod", pieces("Mod", { "Made.exe": exe(), ...files })));

  it("a read-me, a licence and a DLL beside a patcher exe add no file line; a loose game file adds its own", async () => {
    const alone = await readMod(await treeOf("Made", pieces("", { "Made.exe": exe() }), { named: "Made.exe" }));
    const bare = await folder({});
    const withLoose = await folder({ "arr/units.dat": "units" });
    const full = await folder({ "readme.txt": "read me", "LICENSE": "licence", "fmod.dll": library("fmod.dll"), "arr/units.dat": "units" });
    expect(bare.identity.lines).toEqual(alone.identity.lines);
    expect(full.identity.lines).toEqual(withLoose.identity.lines);
    expect(full.identity.lines).toEqual([...alone.identity.lines, `arr\\units.dat\t${sha("units")}`].sort());
    expect(full.identity.withoutPlugins).toBe(withLoose.identity.withoutPlugins);
    // (the DLL beside the program is a library of its code: a line of the hash, not of the files)
    expect(full.modules.filter((m) => m.role === "library").map((m) => m.name)).toEqual(["fmod.dll"]);
    expect(full.left).toEqual([{ path: "Mod/readme.txt", why: "beside" }, { path: "Mod/LICENSE", why: "beside" }]);
  });

  it("two folders that differ only by a read-me have one hash, the exe's own", async () => {
    const alone = await readMod(await treeOf("Made", pieces("", { "Made.exe": exe() }), { named: "Made.exe" }));
    const [plain, read] = [await folder({}), await folder({ "BG_ReadMe.txt": "read me" })];
    expect(read.identity.hash).toBe(plain.identity.hash);
    expect(read.identity.hash).toBe(alone.identity.hash);
    expect(read.files.map((f) => f.name)).toEqual(alone.files.map((f) => f.name));
    expect(read.left).toEqual([{ path: "Mod/BG_ReadMe.txt", why: "beside" }]);
    expect(read.layers.map((l) => l.kind)).toEqual(["archive"]);
  });

  it("a plugin's own folder beside the plugins, with none of the game's, is still read in the game's paths", async () => {
    const d = await readMod(await treeOf("Mod", pieces("Mod", { "plugins/mtl.qdp": "p", "samase/mtl.ini": "settings", "notes.txt": "n" })));
    expect(d.files.map((f) => f.name)).toEqual(["samase\\mtl.ini"]);
    expect(d.left).toEqual([{ path: "Mod/notes.txt", why: "beside" }]);
  });
});

/* ── An operating system's files ─────────────────────────────── */

const text = (s: string) => new TextEncoder().encode(s);
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
/** The rule as it was until 2026-11-09, written out: every line, sorted by name, SHA-256, sixteen hex digits. */
const ruleAsWas = (files: Record<string, string>) => sha(Object.keys(files).sort().map((n) => `${n}\t${sha(files[n])}`).join("\n")).slice(0, 16);
const gameNames = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).map(([p, d]) => [p.replace(/\//g, "\\").toLowerCase(), d]));
const folderOf = (files: Record<string, string | Uint8Array>) => filesOf("a mod", Object.fromEntries(Object.entries(files).map(([p, d]) => [`a mod/${p}`, typeof d === "string" ? text(d) : d])));

const MOD: Record<string, string> = { "arr/units.dat": "a made units.dat", "sound/made/new.wav": "RIFF made sound", "lua/.gitignore": "*.bak" };
/** One file of each kind the list names, by a path under a game folder (and the zip folder macOS makes). */
const SYSTEM: Record<string, string> = {
  "sound/desktop.ini": "[ViewState]\r\nFolderType=Music\r\n",
  "sound/made/Desktop.INI": "[ViewState]",
  "unit/Thumbs.db": "thumbnails",
  "unit/ehthumbs.db": "thumbnails",
  "unit/ehthumbs_vista.db": "thumbnails",
  "arr/.DS_Store": "Bud1",
  "arr/._units.dat": "AppleDouble",
  "arr/Icon\r": "",
  "lua/.directory": "[Dolphin]",
  "arr/__MACOSX/units.dat": "anything under that folder",
};
/** Names that only hold one of the list's: files of the mod like any other. */
const NOT_SYSTEM = ["sound/mydesktop.ini", "sound/desktop.ini.bak", "sound/desktop.ini/voice.wav", "unit/thumbs.db.txt", "unit/xthumbs.db", "arr/.ds_store2", "arr/a._b", "arr/_.units.dat", "lua/x.directory", "arr/icon", "my__macosx/units.dat", "samase/config.ini"];

describe("an operating system's files are not a mod's", () => {
  it("is told by name alone, any case and either slash; a name that only holds one is a file like any other", () => {
    for (const path of Object.keys(SYSTEM)) {
      expect(isSystemFile(path), path).toBe(true);
      expect(isSystemFile(path.toUpperCase().replace(/\//g, "\\")), path).toBe(true);
    }
    expect(isSystemFile("__MACOSX/arr/._units.dat")).toBe(true);
    for (const path of NOT_SYSTEM) expect(isSystemFile(path), path).toBe(false);
    for (const name of SYSTEM_FILES.names) expect(Object.keys(SYSTEM).some((p) => p.toLowerCase().endsWith(`/${name}`)), JSON.stringify(name)).toBe(true);
  });

  it("hashLines drops their lines whatever list it is given; the rule as it was keeps them", async () => {
    const lines = Object.entries(gameNames(MOD)).map(([n, d]) => `${n}\t${sha(d)}`);
    const plain = await hashLines(lines);
    expect(plain).toBe(ruleAsWas(gameNames(MOD)));
    for (const [path, data] of Object.entries(gameNames(SYSTEM))) {
      expect(await hashLines([...lines, `${path}\t${sha(data)}`]), path).toBe(plain);
      expect(await hashLinesAsWere([...lines, `${path}\t${sha(data)}`]), path).toBe(ruleAsWas({ ...gameNames(MOD), [path]: data }));
    }
    for (const path of NOT_SYSTEM) expect(await hashLines([...lines, `${path.replace(/\//g, "\\")}\tff`]), path).not.toBe(plain);
    // a game run with fewer of the plugins hashes its lines by the same rule
    const plugins = { "x.qdp": sha("p") };
    expect(await runningHash([...lines, `sound\\desktop.ini\t${sha("d")}`], plugins, ["x.qdp"])).toBe(await runningHash(lines, plugins, ["x.qdp"]));
    expect(await runningHash([...lines, `sound\\desktop.ini\t${sha("d")}`], plugins, [])).toBe(plain);
    // macOS's half of a plugin is not a plugin the mod carries
    const b = text("bytes");
    const d = await readMod(filesOf("x", { "plugins/x.qdp": b, "plugins/._x.qdp": b, "__MACOSX/y.fgp": b, "y.fgp": b, "x/arr/units.dat": b }));
    expect({ plugins: d.named.plugins, projects: d.named.projects }).toEqual({ plugins: ["x.qdp"], projects: ["y.fgp"] });
  });

  it("names a folder alike with each of them and without, and keeps none of them; `older` is the hash it had", async () => {
    const plain = await readMod(folderOf(MOD));
    expect(plain.identity.hash).toBe(ruleAsWas(gameNames(MOD)));
    expect(plain.identity.older).toBeUndefined();
    for (const [path, data] of Object.entries(SYSTEM)) {
      const seen = await readMod(folderOf({ ...MOD, [path]: data }));
      expect(seen.identity.hash, path).toBe(plain.identity.hash);
      expect(seen.identity.lines, path).toEqual(plain.identity.lines);
      expect(seen.files.map((f) => f.name), path).toEqual(plain.files.map((f) => f.name));
      expect(seen.left, path).toEqual([{ path: `a mod/${path}`, why: "system" }]);
      expect(seen.identity.older, path).toEqual({ hash: ruleAsWas(gameNames({ ...MOD, [path]: data })) });
    }
    for (const path of NOT_SYSTEM) {
      const other = await readMod(folderOf({ ...MOD, [path]: "x" }));
      expect(other.identity.hash, path).toBe(ruleAsWas(gameNames({ ...MOD, [path]: "x" })));
      expect(other.identity.older, path).toBeUndefined();
    }
  });

  it("an archive packed from such a folder, a zip made on macOS, a plugin's AppleDouble half: the same mod", async () => {
    const plugged = { ...MOD, "plugins/x.qdp": "a plugin's bytes", "y.fgp": "a project" };
    const plain = await readMod(folderOf(plugged));
    const mpq = new Creator({ listfile: true });
    mpq.addFile("rez\\stat_txt.tbl", text("made strings"));
    const withMember = new Creator({ listfile: true });
    withMember.addFile("rez\\stat_txt.tbl", text("made strings"));
    withMember.addFile("sound\\desktop.ini", text("[ViewState]"));
    withMember.addFile("sound\\cm\\Thumbs.db", text("t"));
    const clean = await readMod(folderOf({ ...plugged, "made.mpq": mpq.write() }));
    const packed = await readMod(folderOf({ ...plugged, "made.mpq": withMember.write(), "__MACOSX/arr/._units.dat": "fork", "sound/desktop.ini": "[loose]" }));
    expect(clean.identity.hash).not.toBe(plain.identity.hash);
    expect(packed.identity.hash).toBe(clean.identity.hash);
    expect(packed.identity.lines).toEqual(clean.identity.lines);
    expect(packed.files.length).toBe(clean.files.length);
    // the older form: the lines of the files where a game file would be (the loose one over the archive's, as the game
    // layers them; the zip's folder was a folder like any other then), with the plugins and without
    const were = { ...gameNames(MOD), "rez\\stat_txt.tbl": "made strings", "y.fgp": "a project", "sound\\desktop.ini": "[loose]", "sound\\cm\\thumbs.db": "t", "__macosx\\arr\\._units.dat": "fork" };
    expect(packed.identity.older).toEqual({ hash: ruleAsWas({ ...were, "plugins\\x.qdp": "a plugin's bytes" }), withoutPlugins: ruleAsWas(were) });
    expect(clean.identity.older).toBeUndefined();
    // macOS's half of a plugin and of a project: no plugin, no project
    const forked = await readMod(folderOf({ ...plugged, "made.mpq": mpq.write(), "plugins/._x.qdp": "fork", "._y.fgp": "fork" }));
    expect(forked.identity.hash).toBe(clean.identity.hash);
    expect(Object.keys(forked.identity.plugins)).toEqual(["x.qdp"]);
    expect(forked.named).toEqual(clean.named);
  });
});
