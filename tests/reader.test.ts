// The reader: the forms a mod is shipped in (MPQDraft's self-executing MPQ made here from its source's layout), what a
// module is told from its bytes, the loader's order, storm's priorities, and the same description from a disk and from
// memory. Every byte is made by the test.
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Creator } from "mopaq";
import { exeArchive, filesOf, firegraftPick, hasCodeLine, inDotFolder, MPQDRAFT_COMPONENT, MPQDRAFT_DLL_MODULE, moduleFacts, planPlugins, readMod, readsStartupData, zipFiles, type ModDescription } from "../src/index.ts";
import { readModAt } from "../src/node.ts";
import { concat, library, modArchive, program, words } from "./support/patcherExe.ts";
import { dll } from "./support/madePe.ts";
import { MADE, madeLoader, treeOf } from "./support/madeMods.ts";
import { madeZip } from "./support/madeZip.ts";

const text = (s: string) => new TextEncoder().encode(s);
/** A made plugin exporting `exports`, importing `imports`, naming itself `name` (eight letters at most). */
const plugin = (name: string, exports: string[] = ["GetMPQDraftPlugin"], imports: { dll: string; names: string[] }[] = []) =>
  withSelf(dll({ base: 0x10000000, bytes: [], exports: exports.map((n, k) => ({ name: n, ordinal: k + 1, rva: 0x1000 })), imports }).file, name);
/** A made DLL naming itself `name` in its export directory (madePe names every one `made.dll`, eight letters). */
function withSelf(file: Uint8Array, name: string): Uint8Array {
  const out = file.slice(), at = 0x400 + 0x1B00 - 0x1000;
  out.set(text(name.padEnd(8, "\0").slice(0, 8)), at);
  return out;
}

/**
 * MPQDraft's self-executing MPQ as its creator writes one (MPQDraft's `SEMPQCreator.cpp`, `QResource.cpp`): the stub,
 * the EFS at the next 512-byte boundary (its header of eight words, the files end to end, the directory of six words an
 * entry, the whole padded to 4096 bytes), then the archive at that boundary. The patcher DLL first, as the fork writes it.
 */
function sempq(entries: { id: number; file: number; execute: boolean; bytes: Uint8Array }[], archive: Uint8Array): { exe: Uint8Array; at: number } {
  const stub = program();
  const efsAt = Math.ceil(stub.length / 512) * 512;
  let off = 32;
  const placed = entries.map((e) => { const at = off; off += e.bytes.length; return { ...e, at }; });
  const dir = concat(...placed.map((e) => words(e.id, e.file, e.execute ? 1 : 0, e.at, e.bytes.length, 0)));
  const size = off + dir.length;
  const efs = concat(words(0x20534645, 1, size, off, entries.length, 0, 0, 0), ...entries.map((e) => e.bytes), dir);
  const end = Math.ceil((efsAt + efs.length) / 4096) * 4096;
  const exe = concat(stub, new Uint8Array(efsAt - stub.length), efs, new Uint8Array(end - efsAt - efs.length), archive);
  return { exe, at: end };
}

const loose = (d: ModDescription) => d.layers.find((l) => l.kind === "folder");

describe("the package's sources", () => {
  it("import nothing but mopaq and their own files, and name no Node or browser API (but the Node adapter)", () => {
    const dir = join(import.meta.dirname, "../src");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts") && n !== "node.ts")) {
      const source = readFileSync(join(dir, f), "utf8");
      const from = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
      expect(from.filter((x) => x !== "mopaq" && !/^\.\/[\w-]+\.ts$/.test(x)), f).toEqual([]);
      expect(source, f).not.toMatch(/\b(process\.|window\.|document\.|require\(|node:)/);
    }
  });
});

describe("MPQDraft's self-executing MPQ", () => {
  const gptp = withSelf(plugin("x"), "GPTP.qdp"), patcher = library("MPQDraft.dll");
  const made = () => sempq([
    { id: MPQDRAFT_COMPONENT, file: MPQDRAFT_DLL_MODULE, execute: false, bytes: patcher },
    { id: 0x1b4d69b6, file: 0, execute: true, bytes: gptp },
    { id: 0x1b4d69b6, file: 1, execute: false, bytes: text("[settings]\r\n") },
  ], modArchive());

  it("is read from its embedded file system: the archive after it, its entries in order", () => {
    const { exe, at } = made();
    const found = exeArchive(exe)!;
    expect(found).toMatchObject({ form: "mpqdraft-sempq", at });
    expect(found.plugins.map((p) => [p.id, p.file, p.execute, p.name])).toEqual([[MPQDRAFT_COMPONENT, MPQDRAFT_DLL_MODULE, false, "MPQDraft.dll"], [0x1b4d69b6, 0, true, "GPTP.qdp"], [0x1b4d69b6, 1, false, null]]);
    expect(found.plugins[1].bytes).toEqual(gptp);
  });

  it("is described as MPQDraft's loader: its plugin loaded, its own patcher not, its data file carried, its archive at 10000", async () => {
    const d = await readMod(filesOf("Made", { "Made.exe": made().exe }, { named: "Made.exe" }));
    expect(d.loaders.map((l) => l.kind)).toEqual(["mpqdraft-sempq"]);
    expect(d.layers.map((l) => [l.kind, l.priority, l.by])).toEqual([["archive", 10000, "mpqdraft-sempq"]]);
    expect(d.modules.map((m) => [m.name, m.role, m.load, m.entry])).toEqual([["GPTP.qdp", "plugin", true, "mpqdraft"], ["MPQDraft.dll", "patcher", false, "dllmain"]]);
    expect(d.modules[1].why?.key).toBe("why-mpqdraft-patcher");
    expect(d.carried.map((c) => [c.why.key, c.why.text])).toEqual([["why-plugin-data", expect.stringMatching(/GetPluginModule/)]]);
    expect(d.patches[0].files[d.patches[0].project].name).toBe("Made.fgp");
    expect(d.named.patcherPlugins).toEqual([{ exe: "Made.exe", form: "mpqdraft-sempq", name: "GPTP.qdp", id: 0x1b4d69b6 }]);
    // (read from a disk, the same mod)
    const dir = mkdtempSync(join(tmpdir(), "sempq-"));
    writeFileSync(join(dir, "Made.exe"), made().exe);
    const { description } = await readModAt(join(dir, "Made.exe"));
    expect(description.identity.hash).toBe(d.identity.hash);
    expect(description.modules.filter((m) => m.load).map((m) => m.name)).toEqual(["GPTP.qdp"]);
  });
});

describe("a module, told from its bytes", () => {
  it("by the interface it exports, and whether it loads plugins by what it asks for", () => {
    expect(moduleFacts(plugin("a")).entry).toBe("mpqdraft");
    expect(moduleFacts(plugin("a", ["GetPluginAPI", "GetData", "ApplyPatchSuspended", "ApplyPatch"])).entry).toBe("bwl");
    expect(moduleFacts(plugin("a", ["SnpBind", "SnpQuery"])).entry).toBe("snp");
    expect(moduleFacts(plugin("a", ["SomethingElse"])).entry).toBe("dllmain");
    expect(moduleFacts(text("not a library")).entry).toBe("none");
    expect(moduleFacts(plugin("a", ["GetMPQDraftPlugin", "samase_plugin_init"])).samase).toBe(true);
    expect(moduleFacts(madeLoader()).loadsPlugins).toBe(true);
    // (its own export of the name is not asking for it; nor is the name without LoadLibrary to load anything with)
    expect(moduleFacts(plugin("a", ["GetMPQDraftPlugin"], [{ dll: "KERNEL32.dll", names: ["LoadLibraryA"] }])).loadsPlugins).toBe(false);
  });

  it("in the loader's order: a plugin that loads plugins brings its rule, the folder form loads every plugin by name", () => {
    const a = plugin("a"), b = plugin("b"), bwl = plugin("c", ["GetPluginAPI", "ApplyPatchSuspended"]);
    expect(planPlugins([{ name: "b.qdp", bytes: b }, { name: "_a.qdp", bytes: a }, { name: "B.qdp", bytes: b }])).toEqual({ load: ["B.qdp", "_a.qdp", "b.qdp"], skipped: [] });
    const plan = planPlugins([{ name: "b.qdp", bytes: b }, { name: "_a.qdp", bytes: a }, { name: "_loader.qdp", bytes: madeLoader() }, { name: "c.qdp", bytes: bwl }, { name: "d.bwl", bytes: a }]);
    expect(plan.load).toEqual(["b.qdp"]);
    expect(plan.skipped.map((s) => [s.name, s.why.key, s.why.text])).toEqual([
      ["_a.qdp", "why-underscore", "its loader leaves out a name that starts with _"],
      ["_loader.qdp", "why-plugin-loader", "it loads the mod's other plugins: the mod needs those plugins loaded in its order, not this plugin itself"],
      ["c.qdp", "why-no-entry", "it has no GetMPQDraftPlugin, which its loader asks for"],
      ["d.bwl", "why-qdp-only", "its loader loads .qdp files only"],
    ]);
    expect(planPlugins([{ name: "a.qdp", bytes: a }], new Set(["a.qdp"])).skipped.map((s) => [s.name, s.why.text])).toEqual([["a.qdp", "turned off"]]);
  });
});

describe("the description", () => {
  it("gives each layer storm's priority, laid lowest first so that the higher wins", async () => {
    const patch = new Creator({ sectorSize: 4096, listfile: true }); patch.addFile("scripts\\aiscript.bin", text("ai"));
    const other = new Creator({ sectorSize: 4096, listfile: true }); other.addFile("arr\\units.dat", text("u"));
    const d = await readMod(filesOf("Given", { "Given/patch_rt.mpq": patch.write(), "Given/extra.mpq": other.write(), "Given/arr/weapons.dat": text("w") }));
    expect(d.layers.map((l) => [l.path, l.priority, l.by, l.replaces ?? null])).toEqual([
      ["Given/patch_rt.mpq", 7000, "replacement", "patch_rt.mpq"], ["Given/extra.mpq", 10000, "mpqdraft", null], ["Given", 0x1000000, "folder", null],
    ]);
    const release = await readMod(await treeOf("Release", MADE.release()));
    expect(release.layers.map((l) => [l.kind, l.priority, l.by])).toEqual([["folder", 500000, "plugin-loader"], ["archive", 0xffff00, "firegraft-patcher"]]);
    expect(release.loaders.map((l) => l.kind)).toEqual(["firegraft-patcher", "plugin-loader"]);
    expect(release.name).toBe("Release");
    expect(release.modules.filter((m) => m.load).map((m) => m.name)).toEqual(["aise.qdp", "gptp.qdp"]);
    expect(release.modules.filter((m) => m.role === "library").map((m) => m.name)).toEqual(["discord.dll"]);
    expect(release.patches[0]).toMatchObject({ moment: { at: "file-open", name: "font\\font8.fnt" } });
    // (what of the release is not the mod's: its read-me, beside the game's folders)
    expect(release.left).toEqual([{ path: "Release/README.md", why: "outside" }]);
  });

  it("takes an archive a plugin that loads plugins names in its bytes for that loader's packing of its folder", async () => {
    const packed = new Creator({ sectorSize: 4096, listfile: true }); packed.addFile("arr\\units.dat", text("u"));
    const loader = madeLoader("temp.mpq");
    const withFolder = await readMod(filesOf("Release", { "Release/temp.mpq": packed.write(), "Release/mpq/arr/units.dat": text("u"), "Release/plugins/_loader.qdp": loader, "Release/plugins/gptp.qdp": text("p") }));
    expect(withFolder.layers.map((l) => [l.path, l.priority, l.by])).toEqual([["Release/mpq", 500000, "plugin-loader"]]);
    expect(withFolder.said.map((s) => [s.key, s.params])).toContainEqual(["packing-laid-instead", { path: "Release/temp.mpq", loader: "_loader.qdp", priority: 500000 }]);
    expect(withFolder.said.map((s) => s.text).join(" ")).toContain("Release/temp.mpq is _loader.qdp's own packing of its folder of files");
    const alone = await readMod(filesOf("Release", { "Release/temp.mpq": packed.write(), "Release/plugins/_loader.qdp": loader }));
    expect(alone.layers.map((l) => [l.path, l.priority, l.by, l.files.length])).toEqual([["Release/temp.mpq", 500000, "plugin-loader", 1], ["Release", 500000, "plugin-loader", 0]]);
    // (an archive the loader does not name is an archive of its own, as MPQDraft lays one)
    const other = await readMod(filesOf("Release", { "Release/extra.mpq": packed.write(), "Release/mpq/arr/units.dat": text("u"), "Release/plugins/_loader.qdp": loader }));
    expect(other.layers.map((l) => [l.path, l.priority, l.by])).toEqual([["Release/extra.mpq", 10000, "mpqdraft"], ["Release/mpq", 500000, "plugin-loader"]]);
  });

  it("leaves out a tool's folder (.git), reads a zip as its files, and says when the startup data is read again", async () => {
    expect(inDotFolder("Mod/.git/objects/x")).toBe(true);
    expect(inDotFolder("Mod/arr/.units.dat")).toBe(false);
    const d = await readMod(filesOf("Mod", { "Mod/arr/units.dat": text("u"), "Mod/arr/.git/x.mpq": text("not read"), "Mod/unit/x.grp": text("g") }));
    expect(d.files.map((f) => f.name)).toEqual(["arr\\units.dat", "unit\\x.grp"]);
    expect(d.left).toEqual([{ path: "Mod/arr/.git/x.mpq", why: "dot-folder" }]);
    expect(d.identity.readsStartupData).toBe(true);
    expect(readsStartupData(["arr\\units.dat"])).toBe(false);
    const fromZip = await readMod(zipFiles("Pack.zip", madeZip({ "arr/units.dat": text("u") })));
    expect(fromZip.files.map((f) => [f.name, f.path])).toEqual([["arr\\units.dat", "Pack/arr/units.dat"]]);
  });

  it("picks FireGraft's database for 1.16.1 among the ones a datalist lists", () => {
    const found = ["114a.fgd", "115a.fgd", "1161.fgd", "Mod.fgp"].map((name) => ({ name, place: "Mod.exe" }));
    expect(firegraftPick(found)).toEqual({ project: 3, database: 2 });
    expect(firegraftPick([{ name: "x.fgd", place: "" }])).toEqual({ project: null, database: null });
  });
});

describe("one description from a disk and from memory", () => {
  it("names a made folder, patcher and release alike, with the same modules, project and layers", async () => {
    for (const [k, name] of [["folder", "Made Mod"], ["patcher", "Made"], ["release", "Release"]] as const) {
      const ps = MADE[k](), dir = mkdtempSync(join(tmpdir(), "doors-"));
      for (const p of ps) { mkdirSync(join(dir, p.path, ".."), { recursive: true }); writeFileSync(join(dir, p.path), await p.read()); }
      const top = join(dir, ps[0].path.includes("/") ? ps[0].path.split("/")[0] : ps[0].path);
      const memory = await readMod(await treeOf(name, ps, k === "patcher" ? { named: "Made.exe" } : {}));
      const { description: disk } = await readModAt(top);
      expect(disk.identity, k).toEqual(memory.identity);
      expect(disk.name, k).toBe(memory.name);
      // (every module of the code a line of the hash, as `hasCodeLine` says)
      expect(Object.keys(disk.identity.plugins).sort(), k).toEqual(disk.modules.filter((m) => hasCodeLine(m)).map((m) => m.name).sort());
      // (in the order each walks its files: a disk's by name, memory's as given)
      expect(disk.modules.map((m) => m.name).sort(), k).toEqual(memory.modules.map((m) => m.name).sort());
      expect((disk.patches[0]?.files.map((f) => f.name) ?? []).sort(), k).toEqual((memory.patches[0]?.files.map((f) => f.name) ?? []).sort());
      expect(loose(disk)?.priority ?? null, k).toBe(k === "release" ? 500000 : k === "folder" ? 0x1000000 : null);
    }
  });
});
