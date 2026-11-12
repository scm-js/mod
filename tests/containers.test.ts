// What a mod comes in, opened without running anything: a made Windows program with FireGraft's `PEGF` overlay around
// a tiny archive (its plugins one after the other, the archive's tables before its header), a program with an archive
// after it in neither form, a zip with stored and deflated members, and where a folder's game paths start. Every byte
// here is made by the test.
import { deflateRawSync } from "node:zlib";
import { Archive, Creator } from "mopaq";
import { describe, expect, it } from "vitest";
import { exeArchive, filesOf, isExe, isZip, libraryName, modRoot, PatcherError, programEnd, readMod, readZip, ModReadError, ZipError } from "../src/index.ts";
import { concat as join, library, modArchive, patcherExe, program as programAt, weaponsOf, words } from "./support/patcherExe.ts";
import { madeZip } from "./support/madeZip.ts";

/** A Windows program of one section, 0x400 bytes: a stub that is never run. */
const program = () => programAt(0);
function tinyArchive(): Uint8Array {
  const c = new Creator({ sectorSize: 4096 });
  c.addFile("arr\\weapons.dat", new Uint8Array([1, 2, 3, 4, 5]));
  c.addFile("Firegraft\\Test.fgp", new Uint8Array([9, 9]));
  return c.write();
}

describe("a mod's exe, opened and not run", () => {
  it("finds the archive after FireGraft's PEGF overlay, and records its plugin", () => {
    const plugin = new Uint8Array(123).fill(0xcc), archive = tinyArchive();
    plugin[0] = 0x4d; plugin[1] = 0x5a;
    const exe = join(program(), new Uint8Array([0x50, 0x45, 0x47, 0x46]), words(1, 1, 0xfee1600d, plugin.length, 0), plugin, archive);
    expect(programEnd(exe)).toBe(0x400);
    expect(isExe(exe)).toBe(true);
    const found = exeArchive(exe)!;
    expect(found.form).toBe("firegraft-patcher");
    expect(found.at).toBe(0x400 + 24 + plugin.length);
    expect(found.plugins.map(({ id, at, size, name }) => ({ id, at, size, name }))).toEqual([{ id: 0xfee1600d, at: 0x400 + 24, size: 123, name: null }]);
    expect(found.plugins[0].bytes).toEqual(plugin);
    const a = Archive.open(found.bytes, { offset: found.at });
    expect(Array.from(a.readFile("arr\\weapons.dat")!)).toEqual([1, 2, 3, 4, 5]);
  });

  it("reads the patcher's overlay: the count first, each plugin's header beside its bytes", () => {
    const eude = library("qdp.dll"), gptp = library("GPTP.qdp");
    const { exe, at } = patcherExe([{ id: 0x45445545, bytes: eude }, { id: 0x1b4d69b6, bytes: gptp }], modArchive());
    const found = exeArchive(exe)!;
    expect(found).toMatchObject({ form: "firegraft-patcher", at });
    expect(found.plugins.map(({ id, at, size, name }) => ({ id, at, size, name }))).toEqual([
      { id: 0x45445545, at: 0x400 + 12 + 12, size: 0x400, name: "qdp.dll" },
      { id: 0x1b4d69b6, at: 0x400 + 12 + 12 + 0x400 + 12, size: 0x400, name: "GPTP.qdp" },
    ]);
    expect(weaponsOf(exe, at)).toEqual([1, 2, 3, 4, 5]);
    // None: the overlay's three words, and the archive at the next boundary (a patcher with no plugins of its own).
    const none = patcherExe([], modArchive());
    expect(exeArchive(none.exe)).toMatchObject({ form: "firegraft-patcher", at: none.at, plugins: [] });
    expect(none.at).toBe(0x600);
  });

  it("finds an archive whose tables lie before its header, with the header's sizes not believed", () => {
    const { exe, at } = patcherExe([{ id: 0x1b4d69b6, bytes: library("GPTP-v2.41.qdp") }], modArchive(false), { tablesFirst: true });
    const v = new DataView(exe.buffer);
    expect(v.getUint32(at + 4, true)).toBe(0xffffffff);
    expect(v.getUint32(at + 16, true)).toBeGreaterThan(0x80000000);
    const found = exeArchive(exe)!;
    expect(found.at).toBe(at);
    expect(found.plugins[0].name).toBe("GPTP-v2.41.qdp");
    expect(weaponsOf(exe, at)).toEqual([1, 2, 3, 4, 5]);
    // (a slice from the header on cannot reach the tables)
    expect(() => Archive.open(exe.subarray(at))).toThrow(/Hash table/);
  });

  it("refuses an overlay in a form it does not know, with the reason as data", () => {
    const formTwo = () => exeArchive(patcherExe([], modArchive(), { form: 2 }).exe);
    expect(formTwo).toThrow(PatcherError);
    expect(formTwo).toThrow(/form 2; only form 1 is known/);
    try { formTwo(); } catch (e) { expect((e as PatcherError).detail).toMatchObject({ key: "overlay-form", params: { at: 0x400, form: 2, known: 1 } }); }
    expect(() => exeArchive(patcherExe([{ id: 1, bytes: new Uint8Array(16) }], modArchive()).exe)).toThrow(/plugin 1 of its patcher overlay .* is no Windows library/);
    const cut = patcherExe([{ id: 1, bytes: library("a.qdp") }], modArchive()).exe.slice(0, 0x400 + 12 + 12 + 100);
    expect(() => exeArchive(cut)).toThrow(/plugin 1 of its patcher overlay is 1024 bytes, and the file ends 100 bytes after its start/);
    const noArchive = join(programAt(0x400), new Uint8Array([0x50, 0x45, 0x47, 0x46]), words(0, 1));
    expect(() => exeArchive(noArchive)).toThrow(/FireGraft's patcher with 0 plugins, and no archive was found after its overlay/);
  });

  it("says so as a mod: the exe named, why it cannot be read", async () => {
    const tree = filesOf("Made", { "Made.exe": patcherExe([], modArchive(), { form: 2 }).exe }, { named: "Made.exe" });
    const e = await readMod(tree).catch((x: unknown) => x) as ModReadError;
    expect(e).toBeInstanceOf(ModReadError);
    expect(e.detail.key).toBe("exe-unreadable");
    expect(e.message).toBe("Made.exe cannot be read as a mod: its patcher overlay (at byte 1024) is of form 2; only form 1 is known.");
    const plain = await readMod(filesOf("Game", { "StarCraft.exe": program() }, { named: "StarCraft.exe" })).catch((x: unknown) => x) as ModReadError;
    expect(plain.detail.key).toBe("exe-no-archive");
  });

  it("finds an archive at a 512-byte boundary after a program in neither patcher's form", () => {
    const exe = join(program(), new Uint8Array(0x200 - 7), new Uint8Array(7).fill(0x90), tinyArchive());
    const found = exeArchive(exe)!;
    expect(found).toMatchObject({ form: "archive-after-program", at: 0x600, plugins: [] });
    expect(Archive.open(found.bytes, { offset: found.at }).files()).toContain("arr\\weapons.dat");
  });

  it("answers null for a program with nothing after it, and for what is no program", () => {
    expect(exeArchive(program())).toBeNull();
    expect(exeArchive(tinyArchive())).toBeNull();
    expect(isExe(tinyArchive())).toBe(false);
  });

  it("names a library by its export directory", () => {
    expect(libraryName(library("GPTP.qdp"))).toBe("GPTP.qdp");
    expect(libraryName(library(null))).toBeNull();
    expect(libraryName(new Uint8Array(100))).toBeNull();
  });
});

describe("a zip", () => {
  it("reads stored and deflated members", async () => {
    const text = new TextEncoder().encode("mod data ".repeat(50)), deflated = new Uint8Array(deflateRawSync(text));
    const zip = madeZip({ "My Mod/arr/units.dat": new Uint8Array([7, 8, 9]), "My Mod/scripts/iscript.bin": { method: 8, data: deflated, size: text.length } });
    expect(isZip(zip)).toBe(true);
    const members = readZip(zip);
    expect(members.map((m) => m.path)).toEqual(["My Mod/arr/units.dat", "My Mod/scripts/iscript.bin"]);
    expect(Array.from(await members[0].read())).toEqual([7, 8, 9]);
    expect(new TextDecoder().decode(await members[1].read())).toBe("mod data ".repeat(50));
  });

  it("refuses what it does not read, with the reason as data, and readMod says which zip", async () => {
    const odd = madeZip({ "arr/units.dat": { method: 12, data: new Uint8Array(4), size: 4 } });
    expect(() => readZip(odd)).toThrow(ZipError);
    expect(() => readZip(odd)).toThrow("arr/units.dat is packed in a way this reader does not read (method 12): only stored and deflated members are read.");
    let cut: unknown = null;
    try { readZip(new Uint8Array(40)); } catch (x) { cut = x; }
    expect((cut as ZipError).detail.key).toBe("zip-cut");
    const e = await readMod(filesOf("Mod", { "Mod/pack.zip": odd })).catch((x: unknown) => x) as ModReadError;
    expect(e.detail).toMatchObject({ key: "zip-unreadable", params: { path: "Mod/pack.zip", why: { key: "zip-method" } } });
  });

  it("is read when it is the one file named, whatever its name ends in", async () => {
    const zip = madeZip({ "Mod/arr/units.dat": new Uint8Array([1]) });
    const d = await readMod(filesOf("download", { "download": zip }, { named: "download" }));
    expect(d.files.map((f) => [f.name, f.path])).toEqual([["arr\\units.dat", "download/Mod/arr/units.dat"]]);
  });
});

describe("a folder's game paths", () => {
  it("start where arr/ is, at the root or a folder down", () => {
    expect(modRoot(["Cosmo/mpq/arr/units.datex", "Cosmo/mpq/unit/terran/marine.grp", "Cosmo/plugins/gptp.qdp", "Cosmo/README.md"])).toBe("Cosmo/mpq");
    expect(modRoot(["arr/weapons.dat", "scripts/iscript.bin"])).toBe("");
    expect(modRoot(["My Mod/unit/zerg/drone.grp", "My Mod/sound/zerg/drone/zdryes00.wav"])).toBe("My Mod");
  });
});
