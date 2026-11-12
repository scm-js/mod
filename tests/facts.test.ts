// The facts about a mod's files a caller used to work out for itself: each file's kind and the tables' layouts, the
// game a mod is for, its `mod.json` (one rule for which and what), what was left out and why, two files for one game
// path, and the hints its files give about the races it adds. Made data only.
import { describe, expect, it } from "vitest";
import { filesOf, gameOf, isModJsonPath, kindOf, kindTotals, normalizeRaces, raceCandidates, readMod, readModJson, saidRaces, tableShape } from "../src/index.ts";
import { library, modArchive, patcherExe, program } from "./support/patcherExe.ts";
import { madeZip } from "./support/madeZip.ts";

const text = (s: string) => new TextEncoder().encode(s);
const tree = (name: string, files: Record<string, string | Uint8Array>) => filesOf(name, Object.fromEntries(Object.entries(files).map(([p, d]) => [p, typeof d === "string" ? text(d) : d])));
/** A string table of `strings`. */
const tbl = (strings: string[]) => {
  const body = strings.map((s) => text(`${s}\0`)), head = 2 + 2 * strings.length;
  const out = new Uint8Array(head + body.reduce((n, b) => n + b.length, 0)), v = new DataView(out.buffer);
  v.setUint16(0, strings.length, true);
  let at = head;
  body.forEach((b, i) => { v.setUint16(2 + 2 * i, at, true); out.set(b, at); at += b.length; });
  return out;
};

describe("a file's kind, and a table's layout", () => {
  it("is told from the game name alone", () => {
    expect(["arr\\units.dat", "arr\\units.datex", "arr\\images.tbl", "arr\\weapons.txt", "scripts\\iscript.bin", "scripts\\aiscript.bin", "unit\\terran\\scv.grp", "unit\\terran\\marine.lob", "portrait\\x\\y.smk", "sound\\x.wav", "tileset\\jungle.cv5", "rez\\stat_txt.tbl", "maps\\a.scx", "readme.txt"].map(kindOf))
      .toEqual(["tables", "tables", "strings", "other", "scripts", "AI", "pictures", "pictures", "pictures", "sounds", "terrain", "strings", "maps", "other"]);
    expect(kindTotals([{ name: "arr\\units.dat", size: 10 }, { name: "arr\\weapons.dat", size: 5 }, { name: "sound\\a.wav", size: 1 }])).toEqual({ files: 3, bytes: 16, kinds: { tables: { files: 2, bytes: 15 }, sounds: { files: 1, bytes: 1 } } });
  });

  it("is the game's own, DatExtend's expanded or GPTP's .datex, with its entries, from the name and size", () => {
    expect(tableShape("arr\\units.dat", 19876)).toEqual({ table: "units", layout: "dat", entries: 228, standard: 228, legacy: false, extended: false });
    expect(tableShape("arr\\units.dat", 19192)).toMatchObject({ layout: "dat", legacy: true, extended: false });
    expect(tableShape("arr\\units.dat", 97 * 300)).toMatchObject({ layout: "expanded", entries: 300, extended: true });
    expect(tableShape("arr\\units.datex", 99 * 3000)).toMatchObject({ layout: "datex", entries: 3000, extended: true });
    expect(tableShape("arr\\orders.dat", 23 * 7)).toMatchObject({ layout: "datex", entries: 7 });
    expect(tableShape("arr\\weapons.dat", 41)).toMatchObject({ layout: null, entries: null, extended: false });
    expect(tableShape("arr\\images.tbl", 100)).toBeNull();
  });

  it("says the game a mod is for by its files", () => {
    expect(gameOf(["arr\\units.dat"])).toBe("1.16.1");
    expect(gameOf(["arr\\units.dat", "hd2\\unit\\x.dds"])).toBe("remastered");
    expect(gameOf(["anim\\main_000.anim"])).toBe("remastered");
  });
});

describe("mod.json", () => {
  it("is read by one rule: a name of 80 characters at most, a link, races, a hash, the game, a text folder's format", () => {
    expect(readModJson("not json")).toBeNull();
    expect(readModJson("[1]")).toBeNull();
    expect(readModJson(JSON.stringify({ name: `  ${"n".repeat(100)} `, homepage: "https://example.org/x", url: "ftp://no", races: [{ id: 69, name: " Askosi ", letter: "A" }], hash: "0123456789abcdef", withoutPlugins: "bad", base: "1.16.1", scmjs: 1 })))
      .toEqual({ name: "n".repeat(80), link: "https://example.org/x", races: [{ id: 69, name: "Askosi", letter: "a" }], declared: { hash: "0123456789abcdef" }, base: "1.16.1", format: 1 });
    expect(readModJson("{}")).toEqual({});
    // ("races": [] declares none; absent says nothing)
    expect(readModJson(JSON.stringify({ races: [] }))).toEqual({ races: [] });
  });

  it("is the mod's at the top of what was given or one folder down, never in a game folder", () => {
    expect(isModJsonPath("Mod/mod.json", "Mod")).toBe(true);
    expect(isModJsonPath("Mod/Release/mod.json", "Mod")).toBe(true);
    expect(isModJsonPath("Mod/Release/x/mod.json", "Mod")).toBe(false);
    expect(isModJsonPath("Mod/lua/mod.json", "Mod")).toBe(true);
    expect(isModJsonPath("Mod/arr/mod.json", "Mod")).toBe(false);
    expect(isModJsonPath("mod.json", "")).toBe(true);
    expect(isModJsonPath("Other/mod.json", "Mod")).toBe(false);
  });

  it("names the mod and goes with the description; one under a game folder is a file of the mod's", async () => {
    const d = await readMod(tree("Mod", { "Mod/arr/units.dat": "u", "Mod/mod.json": JSON.stringify({ name: "Made", link: "https://example.org", base: "1.16.1" }), "Mod/unit/mod.json": "{}" }));
    expect({ name: d.name, link: d.link, manifest: d.manifest }).toEqual({ name: "Made", link: "https://example.org", manifest: { path: "Mod/mod.json", base: "1.16.1" } });
    expect(d.files.map((f) => f.name)).toEqual(["arr\\units.dat", "unit\\mod.json"]);
    expect(d.left).toEqual([]);
    // (a deeper one is not the mod's: a library's own)
    const deep = await readMod(tree("Mod", { "Mod/arr/units.dat": "u", "Mod/tools/lib/mod.json": JSON.stringify({ name: "Not this" }) }));
    expect(deep.name).toBe("Mod");
    expect(deep.manifest).toBeUndefined();
    // (a zip named alone: its own folder is the top)
    const zipped = await readMod(filesOf("Pack", { "Pack.zip": madeZip({ "Mod/arr/units.dat": text("u"), "Mod/mod.json": text(JSON.stringify({ name: "Zipped" })) }) }, { named: "Pack.zip" }));
    expect(zipped.name).toBe("Zipped");
  });

  it("says a folder in text form, and a mod.json that is no JSON", async () => {
    const d = await readMod(tree("Mod", { "Mod/tables/units.txt": "x", "Mod/mod.json": JSON.stringify({ scmjs: 1, name: "Made" }) }));
    expect(d.said.map((s) => [s.key, s.params])).toContainEqual(["text-folder", { path: "Mod/mod.json", format: 1 }]);
    const bad = await readMod(tree("Mod", { "Mod/arr/units.dat": "u", "Mod/mod.json": "{ no" }));
    expect(bad.said.map((s) => s.key)).toContain("json-unreadable");
  });
});

describe("what was left out, and why", () => {
  it("each file given that is no part of the mod, with its reason", async () => {
    const d = await readMod(tree("Mod", {
      "Mod/Release/arr/units.dat": "u", "Mod/Release/notes.txt": "beside", "Mod/Release/plugins/a.qdp": "p", "Mod/Release/plugins/readme.txt": "beside",
      "Mod/Other/a.qdp": "same name", "Mod/tools/helper.dll": "nothing loads it", "Mod/tools/x.txt": "outside", "Mod/Release/Thumbs.db": "t", "Mod/.git/HEAD": "ref",
      "Mod/tools/launcher.exe": program(),
    }));
    const why = Object.fromEntries(d.left.map((l) => [l.path, l.why]));
    expect(why).toEqual({
      "Mod/.git/HEAD": "dot-folder", "Mod/Release/Thumbs.db": "system", "Mod/Other/a.qdp": "same-name", "Mod/tools/launcher.exe": "program",
      "Mod/Release/notes.txt": "beside", "Mod/Release/plugins/readme.txt": "beside", "Mod/tools/x.txt": "outside", "Mod/tools/helper.dll": "library",
    });
  });

  it("a copy of the game: its archives said, its maps left out", async () => {
    const d = await readMod(tree("Given", { "Given/Starcraft/StarDat.mpq": "x", "Given/Starcraft/BrooDat.mpq": "x", "Given/Starcraft/Maps/a.scm": "m", "Given/Mod/arr/units.dat": "u" }));
    expect(d.gameCopy).toEqual(["Given/Starcraft/StarDat.mpq", "Given/Starcraft/BrooDat.mpq"]);
    expect(d.left).toEqual([{ path: "Given/Starcraft/Maps/a.scm", why: "game-copy" }]);
    expect(d.said.map((s) => s.key)).toEqual(["game-copy"]);
  });

  it("two files for one game path in another case: both said, the last laid", async () => {
    const d = await readMod(tree("Mod", { "Mod/arr/units.dat": "first", "Mod/Arr/Units.dat": "second" }));
    expect(d.duplicates).toEqual([{ name: "arr\\units.dat", paths: ["Mod/arr/units.dat", "Mod/Arr/Units.dat"] }]);
    expect(d.files).toMatchObject([{ name: "arr\\units.dat", path: "Mod/Arr/Units.dat" }]);
    expect(d.said.map((s) => s.key)).toEqual(["duplicate"]);
  });

  it("a release beside its exe: the program and the libraries in its folder are the mod's, its read-me is not", async () => {
    const { exe } = patcherExe([{ id: 0x1b4d69b6, bytes: library("GPTP.qdp") }], modArchive());
    const d = await readMod(tree("Release", { "Release/Game.exe": exe, "Release/fmod.dll": library("fmod.dll"), "Release/ReadMe.txt": "read me" }));
    expect(d.name).toBe("Game");
    expect(d.modules.map((m) => [m.name, m.role])).toEqual([["GPTP.qdp", "plugin"], ["fmod.dll", "library"]]);
  });
});

describe("races", () => {
  it("a table as one rule reads it: a letter in either case, rows that are none dropped", () => {
    expect(normalizeRaces([{ id: 69, name: "Askosi", letter: " A ", like: 1 }, { id: 69, name: "again" }, { id: 7, name: "game's" }, { id: 70, name: "" }, { id: 71, name: "x", letter: "ab", like: 5, own: true }]))
      .toEqual([{ id: 69, name: "Askosi", letter: "a", like: 1 }, { id: 71, name: "x", own: true }]);
    expect(saidRaces(null)).toBeUndefined();
    expect(saidRaces([])).toEqual([]);
  });

  it("hints from a mod's files: network.tbl past the game's, and letters of a console of its own", () => {
    const game = Array.from({ length: 168 }, (_, i) => `game ${i}`);
    const c = raceCandidates({ network: tbl([...game, "\x03Askosi", ""]), paths: ["game\\aconsole.pcx", "rez\\statbtnt.bin", "Rez/StatBtnQ.bin"] });
    expect(c).toEqual({ names: [{ index: 168, name: "Askosi" }], letters: ["a", "q"] });
    expect(raceCandidates({ network: tbl(["a", "b", "own"]), gameNetwork: tbl(["a", "b"]), paths: [] }).names).toEqual([{ index: 2, name: "own" }]);
  });
});
