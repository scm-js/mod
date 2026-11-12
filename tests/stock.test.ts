// An archive without a list is looked into for the names 1.16.1's own image, sound and portrait tables give
// (`src/stockNames.ts`, made by `scripts/stock-names.mjs` from the game: names only), whoever reads it; a reader's own
// copy of the game (`ReadOptions.tables`) is not asked; and what a reader that passed none found before 1.2.0 stays in
// `identity.earlier` (`without-stock-names`). Made data only, but the check that the list is the game's, which runs
// where the game is given:
//
//   MOD_GAME_116=<folder>     an unmodified StarCraft 1.16.1 (StarCraft.exe, StarDat.mpq, BrooDat.mpq, patch_rt.mpq)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Creator } from "mopaq";
import { filesOf, gameName, hashLines, modIdentity, namesToProbe, readMod } from "../src/index.ts";
import { NAMING_TABLES, stockFolders } from "../src/names.ts";

const text = (s: string) => new TextEncoder().encode(s);
const GAME = process.env.MOD_GAME_116;

describe("the names 1.16.1's own tables give", () => {
  const FOLDERS = stockFolders();
  const names = FOLDERS.flatMap(([folder, ...leaves]) => leaves.map((leaf) => folder + leaf));

  it("are game names under the three tables' folders, each once, the folders sorted and each folder's names sorted", () => {
    expect(names.length).toBe(2238);
    expect(new Set(names).size).toBe(names.length);
    const folders = FOLDERS.map(([folder]) => folder);
    expect(folders).toEqual([...folders].sort());
    for (const [folder, ...leaves] of FOLDERS) expect(leaves, folder).toEqual([...leaves].sort());
    // (as the prober makes a table's names: lower case, backslashes, under the folder the table names files in)
    for (const n of names) expect(n, n).toBe(gameName(n));
    const unders = NAMING_TABLES.map(([, under]) => under);
    for (const n of names) expect(unders.some((f) => n.startsWith(f)), n).toBe(true);
    const groups = FOLDERS.map(([folder]) => folder);
    expect(new Set(groups).size).toBe(groups.length);
    for (const [folder, ...leaves] of FOLDERS) {
      expect(folder.endsWith("\\"), folder).toBe(true);
      expect(leaves.length, folder).toBeGreaterThan(0);
      for (const leaf of leaves) expect(leaf.includes("\\") || leaf === "", `${folder}${leaf}`).toBe(false);
    }
  });

  it.skipIf(!GAME || !existsSync(join(GAME ?? "", "StarCraft.exe")))("are what the game's own tables give: the script makes the same file", () => {
    const out = execFileSync(process.execPath, [join(import.meta.dirname, "../scripts/stock-names.mjs"), GAME!, "--check"], { encoding: "utf8" });
    expect(out).toContain("as the game's tables give it (2238 names)");
  });
});

/** An archive with no list of its files: `files` by name. */
function unlisted(files: Record<string, string>): Uint8Array {
  const c = new Creator({ listfile: false });
  for (const [name, data] of Object.entries(files)) c.addFile(name, text(data));
  return c.write();
}
function listed(files: Record<string, string>): Uint8Array {
  const c = new Creator({ listfile: true });
  for (const [name, data] of Object.entries(files)) c.addFile(name, text(data));
  return c.write();
}

describe("an archive without a list, without tables of its own", () => {
  const files = { "arr\\units.dat": "units", "unit\\terran\\marine.grp": "a marine" };

  it("is found to hold what 1.16.1's tables name, whoever reads it: no reader's copy of the game is asked", async () => {
    let asked = 0;
    const tables = async () => { asked++; return null; };
    const d = await readMod(filesOf("Mod", { "Mod/mod.mpq": unlisted(files) }));
    const withTables = await readMod(filesOf("Mod", { "Mod/mod.mpq": unlisted(files) }), { tables });
    expect(d.layers[0].probed).toBe(true);
    expect(d.files.map((f) => f.name)).toEqual(["arr\\units.dat", "unit\\terran\\marine.grp"]);
    expect(withTables).toEqual(d);
    expect(asked).toBe(0);
    // (the same files listed: the same mod)
    const same = await readMod(filesOf("Mod", { "Mod/mod.mpq": listed(files) }));
    expect(d.identity.hash).toBe(same.identity.hash);
    expect((await namesToProbe((await import("mopaq")).Archive.open(unlisted(files)), tables)).includes("unit\\terran\\marine.grp")).toBe(true);
    expect(asked).toBe(0);
  });

  it("keeps what a reader that passed no tables found before 1.2.0: the files without the stock names, by its own rule", async () => {
    const d = await readMod(filesOf("Mod", { "Mod/mod.mpq": unlisted(files) }));
    const fewer = await readMod(filesOf("Mod", { "Mod/mod.mpq": listed({ "arr\\units.dat": "units" }) }));
    expect(d.identity.earlier).toEqual([
      { rule: "before-code", hash: d.identity.hash, withoutPlugins: d.identity.hash },
      { rule: "game-files", hash: d.identity.hash },
      { rule: "without-stock-names", hash: fewer.identity.hash, withoutPlugins: fewer.identity.hash },
    ]);
  });

  it("over a lower layer: the earlier form takes that name from the layer below", async () => {
    const tree = filesOf("Mod", { "Mod/a.mpq": listed({ "unit\\terran\\marine.grp": "the old marine" }), "Mod/b.mpq": unlisted(files) });
    const d = await readMod(tree);
    expect(d.files.find((f) => f.name === "unit\\terran\\marine.grp")?.layer).toBe(1);
    const then = await readMod(filesOf("Mod", { "Mod/a.mpq": listed({ "unit\\terran\\marine.grp": "the old marine" }), "Mod/b.mpq": listed({ "arr\\units.dat": "units" }) }));
    expect(d.identity.earlier?.find((e) => e.rule === "without-stock-names")?.hash).toBe(then.identity.hash);
    expect(then.identity.hash).not.toBe(d.identity.hash);
  });

  it("with code: each earlier rule's form over the fewer files too, marked, where it is a hash the list has not", async () => {
    const tree = filesOf("Mod", { "Mod/mod.mpq": unlisted(files), "Mod/plugins/x.qdp": text("a plugin"), "Mod/plugins/msvcp140.dll": text("a runtime") });
    const d = await readMod(tree);
    const then = await readMod(filesOf("Mod", { "Mod/mod.mpq": listed({ "arr\\units.dat": "units" }), "Mod/plugins/x.qdp": text("a plugin"), "Mod/plugins/msvcp140.dll": text("a runtime") }));
    const rules = d.identity.earlier!.map((e) => `${e.rule}${e.withoutStockNames ? " (without the stock names)" : ""}`);
    // (the game files' form over the fewer files is the hash without plugins of `without-stock-names`: not listed twice)
    expect(rules).toEqual(["before-code", "game-files", "without-stock-names", "before-code (without the stock names)"]);
    const by = (rule: string, without: boolean) => d.identity.earlier!.find((e) => e.rule === rule && !!e.withoutStockNames === without)!;
    expect(by("without-stock-names", false)).toMatchObject({ hash: then.identity.hash, withoutPlugins: then.identity.withoutPlugins });
    expect(by("before-code", true)).toMatchObject(then.identity.earlier!.find((e) => e.rule === "before-code")!);
    expect(by("without-stock-names", false).withoutPlugins).toBe(await hashLines(then.identity.lines));
    // (and named later, the same)
    const later = await modIdentity(tree, await readMod(tree, { hashFiles: false }));
    expect(JSON.stringify(later)).toBe(JSON.stringify(d.identity));
  });

  it("an archive whose own tables name a file: found as before, no earlier form", async () => {
    const tbl = (s: string) => { const b = new Uint8Array(4 + s.length + 1); new DataView(b.buffer).setUint16(0, 1, true); new DataView(b.buffer).setUint16(2, 4, true); b.set(text(s), 4); return b; };
    const c = new Creator({ listfile: false });
    c.addFile("arr\\images.tbl", tbl("terran\\marine.grp"));
    c.addFile("unit\\terran\\marine.grp", text("a marine"));
    const d = await readMod(filesOf("Mod", { "Mod/mod.mpq": c.write() }));
    expect(d.files.map((f) => f.name)).toEqual(["arr\\images.tbl", "unit\\terran\\marine.grp"]);
    expect(d.identity.earlier!.map((e) => e.rule)).toEqual(["before-code", "game-files"]);
  });
});
