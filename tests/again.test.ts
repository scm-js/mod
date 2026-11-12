// What a caller does with a description after `readMod`: reads the mod's files again (the tree listed once, each archive
// opened once, let go when asked), names the mod later (read without hashing, then `modIdentity`), names it after an
// edit (`identityWith`), and matches what earlier rules named it (`identity.earlier`). Made data only.
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Archive, Creator } from "mopaq";
import {
  fileReaders, filesOf, gameFileLine, gameName, hashLines, hashLinesAsWere, identityWith, leafOf, modIdentity, openLayer, pluginLine, readMod, readPath,
  sha256Hex, zipFiles, type ModDescription, type ModFiles,
} from "../src/index.ts";
import { diskFiles } from "../src/node.ts";
import { library, modArchive, patcherExe } from "./support/patcherExe.ts";
import { MADE, madeLoader, pieces, treeOf } from "./support/madeMods.ts";
import { madeZip } from "./support/madeZip.ts";

const text = (s: string) => new TextEncoder().encode(s);
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

/** A tree that counts what is asked of it: its `list` calls and each path's reads. */
function counted(tree: ModFiles): ModFiles & { lists: number; reads: Map<string, number> } {
  const out = { ...tree, lists: 0, reads: new Map<string, number>() };
  out.list = () => { out.lists++; return tree.list(); };
  out.read = (path) => { out.reads.set(path, (out.reads.get(path) ?? 0) + 1); return tree.read(path); };
  return out;
}

/** The made mods, and the shapes the made ones lack: an operating system's files loose and packed, a plugin loader's packing. */
const SHAPES: Record<string, () => Promise<ModFiles>> = {
  ...Object.fromEntries((Object.keys(MADE) as (keyof typeof MADE)[]).map((k) => [k, () => treeOf(k === "folder" ? "Made Mod" : k, MADE[k](), k === "patcher" ? { named: "Made.exe" } : k === "unlisted" ? { named: "Unlisted.exe" } : {})])),
  "system files, loose and packed": async () => {
    const mpq = new Creator({ listfile: true });
    mpq.addFile("rez\\stat_txt.tbl", text("strings"));
    mpq.addFile("sound\\cm\\Thumbs.db", text("thumbnails"));
    return filesOf("Mod", { "Mod/arr/units.dat": text("u"), "Mod/sound/desktop.ini": text("[loose]"), "Mod/plugins/x.qdp": text("plugin"), "Mod/made.mpq": mpq.write() });
  },
  "a packing laid by its folder, holding a file of its own": async () => {
    const packed = new Creator({ sectorSize: 4096, listfile: true });
    packed.addFile("arr\\units.dat", text("u"));
    packed.addFile("unit\\Thumbs.db", text("only in the packing"));
    return filesOf("Release", { "Release/temp.mpq": packed.write(), "Release/mpq/arr/units.dat": text("u"), "Release/plugins/_loader.qdp": madeLoader("temp.mpq"), "Release/plugins/gptp.qdp": text("p") });
  },
  "a zip in a folder": async () => filesOf("Mod", { "Mod/pack.zip": madeZip({ "arr/units.dat": text("u"), "unit/x.grp": text("g"), "plugins/a.qdp": text("a") }) }),
};

describe("reading a described mod's files again", () => {
  it("lists the tree once, however many files are read (a folder of many files)", async () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 300; i++) files[`Mod/unit/x${i}.grp`] = text(`g${i}`);
    const tree = counted(filesOf("Mod", files));
    const d = await readMod(tree);
    const listedByRead = tree.lists;
    const read = fileReaders(tree, d);
    for (const f of d.files) expect(await read(f)()).toEqual(files[f.path!]);
    expect(listedByRead).toBe(1);
    // (the list readMod made serves the readers: none after it)
    expect(tree.lists).toBe(1);
    for (const f of d.files.slice(0, 20)) await readPath(tree, f.path!);
    expect(tree.lists).toBe(1);
    // (a tree no reader has listed: once, however many files are read)
    const fresh = counted(filesOf("Mod", files));
    for (const f of d.files) await readPath(fresh, f.path!);
    expect(fresh.lists).toBe(1);
  });

  it("finds a file added to the tree after it was listed, and still says a path that is not there", async () => {
    const map = new Map([["Mod/arr/units.dat", text("u")]]);
    const tree = filesOf("Mod", map);
    expect(await readPath(tree, "Mod/arr/units.dat")).toEqual(text("u"));
    map.set("Mod/arr/later.dat", text("later"));
    expect(await readPath(tree, "Mod/arr/later.dat")).toEqual(text("later"));
    await expect(readPath(tree, "Mod/nothing")).rejects.toMatchObject({ detail: { key: "not-in-tree" } });
  });

  it("reads a zip in the tree once for all its members, until it is let go", async () => {
    const tree = counted(await SHAPES["a zip in a folder"]());
    const d = await readMod(tree);
    const before = tree.reads.get("Mod/pack.zip") ?? 0;
    const read = fileReaders(tree, d);
    for (const f of d.files) await read(f)();
    expect(d.files.length).toBe(2);
    expect((tree.reads.get("Mod/pack.zip") ?? 0) - before).toBe(1);
    read.close();
    await read(d.files[0])();
    expect((tree.reads.get("Mod/pack.zip") ?? 0) - before).toBe(2);
  });

  it("opens each archive once, takes those readMod opened, and lets go of them on close", async () => {
    const tree = counted(await treeOf("Made", MADE.patcher(), { named: "Made.exe" }));
    const archives = new Map<string, Archive>();
    const d = await readMod(tree, { archives });
    expect([...archives.keys()]).toEqual(["Made.exe"]);
    expect(tree.reads.get("Made.exe")).toBe(1);
    const read = fileReaders(tree, d, { archives });
    for (const f of d.files) await read(f)();
    expect(await openLayer(tree, d.layers[0], { archives })).toBe(archives.get("Made.exe"));
    expect(tree.reads.get("Made.exe")).toBe(1);
    read.close();
    expect(archives.size).toBe(0);
    await read(d.files[0])();
    expect(tree.reads.get("Made.exe")).toBe(2);
    // (a reader of its own: opened once for all its files)
    const own = fileReaders(tree, d);
    for (const f of d.files) await own(f)();
    expect(tree.reads.get("Made.exe")).toBe(3);
  });

  it("does not keep a plugin loader's packing that its folder is laid in place of", async () => {
    const archives = new Map<string, Archive>();
    const d = await readMod(await SHAPES["a packing laid by its folder, holding a file of its own"](), { archives });
    expect(d.layers.map((l) => l.path)).toEqual(["Release/mpq"]);
    expect(archives.size).toBe(0);
    // (what the hash reads of it is read before it is let go: its operating system's file, for `older`)
    expect(d.identity.older?.files).toEqual(["unit\\thumbs.db"]);
    expect(d.systemFiles).toEqual([{ name: "unit\\thumbs.db", archive: "Release/temp.mpq", member: "unit\\Thumbs.db" }]);
  });

  it("reads a file on a disk as the bytes Node read, a buffer of its own, small or large", () => {
    const dir = mkdtempSync(join(tmpdir(), "mod-disk-"));
    const small = text("small"), large = new Uint8Array(200_000).map((_, i) => i & 0xff);
    writeFileSync(join(dir, "small.bin"), small); writeFileSync(join(dir, "large.bin"), large);
    const tree = diskFiles(dir);
    for (const [name, bytes] of [["small.bin", small], ["large.bin", large]] as const) {
      const b = tree.readSync(`${leafOf(dir)}/${name}`);
      expect(b).toEqual(bytes);
      expect(b.constructor).toBe(Uint8Array);
      expect([b.byteOffset, b.buffer.byteLength]).toEqual([0, bytes.length]);
    }
  });
});

describe("a mod named later", () => {
  for (const [what, make] of Object.entries(SHAPES)) {
    it(`${what}: read without hashing, then named, gives what readMod gives`, async () => {
      const full = await readMod(await make());
      const tree = counted(await make());
      let heard = 0;
      const d = await readMod(tree, { hashFiles: false, onFile: () => { heard++; } });
      expect(heard).toBe(0);
      // (no game file read: only what is read to describe the mod, its archives, modules and mod.json)
      for (const f of d.files) if (f.path) expect(tree.reads.has(f.path), f.path).toBe(false);
      expect({ ...d, identity: null, unreadable: null, said: null }).toEqual({ ...full, identity: null, unreadable: null, said: null });
      expect(Object.keys(d.identity).sort()).toEqual(["code", "plugins", "readsStartupData", ...(full.identity.declared ? ["declared"] : [])].sort());
      const files: Uint8Array[] = [];
      const later = await modIdentity(tree, d, { onFile: (_f, b) => { files.push(b); } });
      expect(JSON.stringify(later)).toBe(JSON.stringify(full.identity));
      expect(files.length).toBe(full.identity.lines.filter((l) => !/\.fgp\t/.test(l)).length);
      // (from a description passed through JSON, as a page hands it to another)
      expect(JSON.stringify(await modIdentity(await make(), JSON.parse(JSON.stringify(d)) as typeof d))).toBe(JSON.stringify(full.identity));
    });
  }

  it("takes the archives the reading opened, and opens none again", async () => {
    const tree = counted(await treeOf("Made", MADE.patcher(), { named: "Made.exe" }));
    const archives = new Map<string, Archive>();
    const d = await readMod(tree, { hashFiles: false, archives });
    const id = await modIdentity(tree, d, { archives });
    expect(tree.reads.get("Made.exe")).toBe(1);
    expect(id.hash).toBe((await readMod(await treeOf("Made", MADE.patcher(), { named: "Made.exe" }))).identity.hash);
    expect(archives.size).toBe(1);
  });
});

describe("a mod named after an edit", () => {
  it("gives the hashes readMod gives the edited files, from the changed members' digests alone", async () => {
    const before = await readMod(await treeOf("Made Mod", MADE.folder()));
    const edited = {
      "arr/units.dat": "units, edited", "unit/new/thing.grp": "added", "firegraft/Made.fgp": "project, edited",
      "plugins/a.qdp": "plugin a, edited", "plugins/c.qdp": "plugin c", "sound/cm/Thumbs.db": "no line",
    };
    const removed = ["rez/stat_txt.tbl", "plugins/msvcp140.dll"];
    const files = Object.fromEntries(MADE.folder().map((p) => [p.path.slice("Made Mod/".length), p]));
    const after = await readMod(await treeOf("Made Mod", [
      ...Object.entries(files).filter(([path]) => !removed.includes(path) && !(path in edited)).map(([, p]) => p),
      ...pieces("Made Mod", edited),
    ]));
    const changed = await identityWith(before.identity, {
      files: { "arr/units.dat": sha(edited["arr/units.dat"]), "unit\\new\\thing.grp": sha(edited["unit/new/thing.grp"]), "Made.fgp": sha(edited["firegraft/Made.fgp"]), "sound/cm/Thumbs.db": sha("no line"), "rez/stat_txt.tbl": null },
      plugins: { "a.qdp": sha(edited["plugins/a.qdp"]), "c.qdp": sha(edited["plugins/c.qdp"]), "msvcp140.dll": null },
    });
    expect(changed).toEqual({ lines: after.identity.lines, plugins: after.identity.plugins, hash: after.identity.hash, withoutPlugins: after.identity.withoutPlugins });
    expect(changed.hash).not.toBe(before.identity.hash);
    // (no change, the same hashes; a change taken back, the hashes it had)
    expect(await identityWith(before.identity, {})).toMatchObject({ hash: before.identity.hash, withoutPlugins: before.identity.withoutPlugins });
    const back = await identityWith(changed, { files: { "arr/units.dat": sha("units"), "unit/new/thing.grp": null, "Made.fgp": sha("project"), "rez/stat_txt.tbl": sha("strings") }, plugins: { "A.QDP": sha("plugin a"), "c.qdp": null, "msvcp140.dll": sha("runtime") } });
    expect([back.hash, back.withoutPlugins]).toEqual([before.identity.hash, before.identity.withoutPlugins]);
  });

  it("makes each kind of line as the reader does", async () => {
    const d = await readMod(await treeOf("Made Mod", MADE.folder()));
    expect(d.identity.lines).toContain(gameFileLine("arr/units.dat", sha("units")));
    expect(d.identity.lines).toContain(gameFileLine("ARR\\Units.dat", sha("units")));
    expect(gameFileLine("\\arr\\x.dat", "ff")).toBe("\\arr\\x.dat\tff");
    expect(gameName("\\Arr/X.dat")).toBe("\\arr\\x.dat");
    expect(await hashLines([...d.identity.lines, ...Object.entries(d.identity.plugins).map(([n, s]) => pluginLine(n, s))])).toBe(d.identity.hash);
  });
});

describe("what earlier rules named a mod", () => {
  /** The lines of the operating system's files, read where they are, as two callers worked them out before 1.1.0. */
  async function systemLinesAsCallersRead(tree: ModFiles, d: ModDescription): Promise<string[]> {
    const names = d.identity.older?.files ?? [];
    const root = d.layers.find((l) => l.kind === "folder")?.path ?? "";
    const loose = new Map(d.left.filter((l) => l.why === "system" && (!root || l.path.startsWith(`${root}/`))).map((l) => [gameName(root ? l.path.slice(root.length + 1) : l.path), l.path]));
    const found = new Map<string, Uint8Array>();
    for (const name of names) { const path = loose.get(name); if (path) found.set(name, await tree.read(path)); }
    for (const l of [...d.layers].reverse()) {
      if (l.kind !== "archive" || names.every((n) => found.has(n))) continue;
      const archive = await openLayer(tree, l);
      for (const name of names) if (!found.has(name) && archive.fileInfo(name)) found.set(name, archive.readFile(name)!);
    }
    const lines: string[] = [];
    for (const [name, bytes] of found) lines.push(`${name}\t${await sha256Hex(bytes)}`);
    return lines.sort();
  }
  /** Every earlier form, as the two callers derived them before 1.1.0. */
  async function earlierAsCallersDerived(tree: ModFiles, d: ModDescription): Promise<string[]> {
    const id = d.identity, lineName = (l: string) => l.slice(0, l.indexOf("\t"));
    const game = id.lines.filter((l) => !/\.fgp\t/i.test(l));
    const byList = new Set((d.patches[0]?.files ?? []).filter((f) => f.byList).map((f) => leafOf(f.name).toLowerCase()));
    const system = await systemLinesAsCallersRead(tree, d);
    return [
      ...(id.beforeCode ? [id.beforeCode] : []), await hashLines(id.lines.filter((l) => !byList.has(lineName(l)))),
      ...(id.older ? [id.older.hash, ...(id.older.withoutPlugins ? [id.older.withoutPlugins] : [])] : []),
      await hashLines(game), ...(system.length ? [await hashLinesAsWere([...game, ...system])] : []),
    ];
  }

  for (const what of ["folder", "unlisted", "release", "system files, loose and packed"]) {
    it(`${what}: every form the callers derived, by rule; older.lines the lines they read`, async () => {
      const tree = await SHAPES[what]();
      const d = await readMod(tree);
      const id = d.identity;
      const listed = id.earlier!.flatMap((e) => [e.hash, ...(e.withoutPlugins ? [e.withoutPlugins] : [])]);
      for (const h of await earlierAsCallersDerived(tree, d)) if (h !== id.hash && h !== id.withoutPlugins) expect(listed, h).toContain(h);
      if (id.older) expect(id.older.lines).toEqual(await systemLinesAsCallersRead(tree, d));
      // (each rule's own entry: the hash before 2026-11-11 as `beforeCode` has it, the older one as `older` has it)
      const rule = (r: string) => id.earlier!.find((e) => e.rule === r);
      expect(rule("before-code")!.hash).toBe(id.beforeCode ?? (rule("before-code")!.hash === id.hash ? id.hash : id.withoutPlugins));
      expect(rule("older")?.hash).toBe(id.older?.hash);
      expect(rule("game-files")!.hash).toBe(await hashLines(id.lines.filter((l) => !/\.fgp\t/.test(l))));
      expect(!!rule("game-files-older")).toBe(!!id.older);
    });
  }

  it("the unlisted project: the earlier rule's form without plugins lacks its line", async () => {
    const d = await readMod(await SHAPES.unlisted());
    const before = d.identity.earlier!.find((e) => e.rule === "before-code")!;
    expect(before.withoutPlugins).toBe(await hashLines(d.identity.lines.filter((l) => !l.startsWith("gptp-v2.41.qdp") && !/\.fgp\t/.test(l))));
    expect(before.withoutPlugins).not.toBe(d.identity.withoutPlugins);
  });
});

describe("an archive's list", () => {
  it("names a member twice: one file of the layer, by the spelling the game files take (the last)", async () => {
    const mpq = new Creator({ listfile: false });
    mpq.addFile("arr\\units.dat", text("u"));
    mpq.addFile("unit\\x.grp", text("g"));
    mpq.addFile("(listfile)", text("Arr\\Units.dat\r\nunit\\x.grp\r\nARR\\UNITS.DAT\r\narr\\units.dat\r\n"));
    const d = await readMod(filesOf("Mod", { "Mod/mod.mpq": mpq.write() }));
    expect(d.layers[0].files.map((f) => [f.name, f.member])).toEqual([["unit\\x.grp", "unit\\x.grp"], ["arr\\units.dat", "arr\\units.dat"]]);
    expect(d.files.map((f) => f.member)).toEqual(["arr\\units.dat", "unit\\x.grp"]);
    expect(d.identity.lines).toEqual([`arr\\units.dat\t${sha("u")}`, `unit\\x.grp\t${sha("g")}`]);
  });
});

type Rejection = { name: string; detail: { key: string; params: Record<string, unknown> }; cause: unknown; message: string };
const rejection = async (p: Promise<unknown>): Promise<Rejection> => p.then(() => { throw new Error("it was read"); }, (x: unknown) => x as Rejection);

describe("an archive that cannot be opened", () => {
  it("says the library's text as `why`, as 1.0.0 did, its kind of error as `reason`, the error underneath as the cause", async () => {
    const bad = new Uint8Array(64), v = new DataView(bad.buffer);
    v.setUint32(0, 0x1a51504d, true); v.setUint32(4, 32, true); v.setUint32(8, 64, true); v.setUint32(16, 0x7fffff00, true); v.setUint32(20, 0x7fffff00, true); v.setUint32(24, 16, true); v.setUint32(28, 16, true);
    const e = await rejection(readMod(filesOf("Mod", { "Mod/broken.mpq": bad })));
    expect(e.name).toBe("ModReadError");
    expect(e.detail.key).toBe("archive-unopenable");
    expect(e.detail.params.why).toBe("Corrupted: Hash table extends beyond archive");
    expect(e.detail.params.reason).toMatchObject({ key: "mpq-damaged", params: { detail: "Hash table extends beyond archive" } });
    expect((e.cause as { kind: string }).kind).toBe("Corrupted");
    expect(e.message).toBe("Mod/broken.mpq could not be opened as an archive: Corrupted: Hash table extends beyond archive");
  });

  it("a patcher exe's archive the same way", async () => {
    const archive = modArchive();
    const { exe, at } = patcherExe([{ id: 0x1b4d69b6, bytes: library("GPTP.qdp") }], archive);
    const broken = exe.slice();
    // (its hash table said to hold more entries than any archive: the header is where storm looks, its table is not)
    new DataView(broken.buffer).setUint32(at + 24, 0x10000000, true);
    const e = await rejection(readMod(filesOf("Made", { "Made.exe": broken }, { named: "Made.exe" })));
    expect(e.detail.key).toBe("exe-archive-unopenable");
    expect(e.detail.params).toMatchObject({ path: "Made.exe", at, why: "Corrupted: Hash table extends beyond archive", reason: { key: "mpq-damaged" } });
  });
});

describe("readMod rejects only with a ModReadError", () => {
  it("an archive whose hash table has no entries: its list cannot be read (the library's TypeError underneath)", async () => {
    const empty = new Uint8Array(64);
    empty.set([0x4d, 0x50, 0x51, 0x1a]);
    const e = await rejection(readMod(filesOf("Mod", { "Mod/empty.mpq": empty })));
    expect(e.name).toBe("ModReadError");
    expect(e.detail.key).toBe("archive-unopenable");
    expect(e.detail.params).toMatchObject({ path: "Mod/empty.mpq", reason: { key: "mpq-other" } });
    expect(e.cause).toBeInstanceOf(TypeError);
  });

  /** A zip of a mod whose member `name` is deflated bytes that are no deflate stream. */
  const brokenMember = (name: string) => madeZip({ "arr/units.dat": text("u"), [name]: { method: 8, data: new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x00, 0x13]), size: 40 } });
  for (const [what, name] of [["a plugin", "plugins/x.qdp"], ["mod.json", "mod.json"], ["a FireGraft project", "firegraft/Made.fgp"]] as const) {
    it(`${what} in a zip that cannot be inflated: zip-unreadable, the zip's reason inside`, async () => {
      const e = await rejection(readMod(filesOf("Mod", { "Mod/pack.zip": brokenMember(name) })));
      expect(e.name).toBe("ModReadError");
      expect(e.detail.key).toBe("zip-unreadable");
      expect(e.detail.params).toMatchObject({ path: "Mod/pack.zip", why: { key: "zip-member-inflate", params: { path: name } } });
      expect((e.cause as { name: string }).name).toBe("ZipError");
    });
  }

  it("a FireGraft project its archive cannot give: firegraft-unreadable, the library's error underneath", async () => {
    const mpq = new Creator({ listfile: false });
    mpq.addFile("Firegraft\\Made.fgp", new Uint8Array(8192).fill(97), { compress: "zlib" });
    mpq.addFile("arr\\units.dat", text("u"));
    mpq.addFile("(listfile)", text("Firegraft\\Made.fgp\r\narr\\units.dat\r\n"));
    const bytes = mpq.write();
    // (the project is the archive's first member: bytes of its packed sector changed)
    for (let i = 44; i < 60; i++) bytes[i] ^= 0x5a;
    const tree = filesOf("Mod", { "Mod/mod.mpq": bytes });
    const e = await rejection(readMod(tree));
    expect(e.name).toBe("ModReadError");
    expect(e.detail).toMatchObject({ key: "firegraft-unreadable", params: { name: "Made.fgp", path: "Mod/mod.mpq" } });
    expect((e.cause as { name: string }).name).toBe("MpqError");
    // (and when it is named later)
    const later = await rejection(modIdentity(tree, await readMod(tree, { hashFiles: false })));
    expect(later.detail.key).toBe("firegraft-unreadable");
  });

  it("a file the tree cannot give: file-unreadable, the tree's own error underneath", async () => {
    const tree: ModFiles = { name: "Mod", list: async () => [{ path: "Mod/plugins/x.qdp", size: 4 }, { path: "Mod/arr/units.dat", size: 1 }], read: async () => { throw new DOMException("gone", "NotReadableError"); } };
    const e = await rejection(readMod(tree));
    expect(e.name).toBe("ModReadError");
    expect(e.detail).toMatchObject({ key: "file-unreadable", params: { path: "Mod/plugins/x.qdp", why: "gone" } });
  });

  it("a zip read whole by the tree is read once for a layer in it", async () => {
    const mpq = new Creator({ listfile: true }); mpq.addFile("arr\\units.dat", text("u"));
    const tree = counted(zipFiles("Pack.zip", madeZip({ "mod.mpq": mpq.write() })));
    const d = await readMod(tree);
    expect(d.layers.map((l) => l.path)).toEqual(["Pack/mod.mpq"]);
    expect((await fileReaders(tree, d)(d.files[0])()).length).toBe(1);
  });
});
