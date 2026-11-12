// Real mods' identities, pinned: what their makers ship, read from a disk. The mods are third-party downloads and are
// never part of this repository; these tests run only where they are given, and skip otherwise:
//
//   MOD_FIXTURES=<folder>                 a folder holding the mods at the paths below (each skipped when absent)
//   MOD_FIXTURE_COSMONARCHY=<folder>      Cosmonarchy's release folder (the one holding `Cosmonarchy BW.exe`)
//
// The values are those the other readers of these mods pin (the play page, the command line, the runners), but for a
// patcher mod given as a folder, whose read-me beside the exe is no game file since 1.0.0 (Burning Ground's folder was
// 14fbf76b99ba5015, without plugins f9dc2cc001d39685, older 2c44748b00f8128d; TriFresh's folder ebc12de417f24900), and
// for a mod whose FireGraft project is found only through FireGraft's own list (SC Revolution was 693bf4a83f3a69a1,
// without plugins 90b8c22d9cb4ba31, now its `beforeCode`).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readModAt } from "../src/node.ts";

interface Pin { hash: string; withoutPlugins: string; lines: number; plugins: number; older?: string; beforeCode?: string }

const FIXTURES = process.env.MOD_FIXTURES;
const MODS: [string, string, Pin][] = [
  // (the folder and its exe alone are one mod: the read-me beside the exe is no game file)
  ["Burning Ground (its unpacked folder)", "burning-ground/unpacked", { hash: "c76bfa18e9fc4fb5", withoutPlugins: "0ed055cf80a95bd0", lines: 2883, plugins: 3, older: "45f548e49bd6a097" }],
  ["Burning Ground (its exe)", "burning-ground/unpacked/BG_v2.00.exe", { hash: "c76bfa18e9fc4fb5", withoutPlugins: "0ed055cf80a95bd0", lines: 2883, plugins: 3, older: "45f548e49bd6a097" }],
  // (its archive has no list: its FireGraft project, found through FireGraft's own, has its line; the earlier rule's hash is `beforeCode`)
  ["SC Revolution (its exe)", "sc-revolution/unpacked/SC Revolution 2.2.exe", { hash: "d9e4e6ff76c7e71d", withoutPlugins: "bb3f273690cf8d8d", lines: 205, plugins: 1, beforeCode: "90b8c22d9cb4ba31" }],
  ["TriFresh (its exe)", "trifresh/unzipped/TriFresh.exe", { hash: "ea488d3ac3575bda", withoutPlugins: "ea488d3ac3575bda", lines: 67, plugins: 0 }],
  ["TriFresh (its unzipped folder)", "trifresh/unzipped", { hash: "ea488d3ac3575bda", withoutPlugins: "ea488d3ac3575bda", lines: 67, plugins: 0 }],
  ["SC Revolution (its unpacked folder)", "sc-revolution/unpacked", { hash: "d9e4e6ff76c7e71d", withoutPlugins: "bb3f273690cf8d8d", lines: 205, plugins: 1, beforeCode: "90b8c22d9cb4ba31" }],
  ["EUD Enabler (a plugin alone)", "eudenabler/mod", { hash: "6ee0359ce4a96176", withoutPlugins: "e3b0c44298fc1c14", lines: 0, plugins: 1 }],
];
const COSMONARCHY = process.env.MOD_FIXTURE_COSMONARCHY;
const COSMONARCHY_PIN: Pin = { hash: "c94acdf31982fa4b", withoutPlugins: "db23a1f9dd8cef66", lines: 7768, plugins: 8, older: "1c41a2d7701fe842", beforeCode: "20e1c6d89ae2af75" };

const identityOf = async (path: string): Promise<Pin> => {
  const { identity: id } = (await readModAt(path)).description;
  return { hash: id.hash, withoutPlugins: id.withoutPlugins, lines: id.lines.length, plugins: Object.keys(id.plugins).length, ...(id.older ? { older: id.older.hash } : {}), ...(id.beforeCode ? { beforeCode: id.beforeCode } : {}) };
};

describe("real mods' identities", () => {
  for (const [what, path, pin] of MODS) {
    const at = FIXTURES ? join(FIXTURES, path) : "";
    it.skipIf(!at || !existsSync(at))(what, async () => expect(await identityOf(at)).toEqual(pin), 120_000);
  }
  it.skipIf(!COSMONARCHY || !existsSync(COSMONARCHY))("Cosmonarchy (its release folder)", async () => expect(await identityOf(COSMONARCHY!)).toEqual(COSMONARCHY_PIN), 600_000);
});
