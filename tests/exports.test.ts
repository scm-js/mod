// Every name a published version exported is still exported. The lists in `tests/compat/exports-<version>.json` were
// made from the published packages' declarations (`scripts/check-exports.mjs --write`); `npm run check:exports` compares
// them with the built declarations, and this compares them with the sources before anything is built.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error a plain script of the repository, without declarations
import { exportedNames } from "../scripts/check-exports.mjs";

const ROOT = join(import.meta.dirname, "..");
const ENTRIES: Record<string, string> = { ".": "src/index.ts", "./node": "src/node.ts" };

/** The names a source entry exports: its `export { … } from`, and its own `export function/const/interface/type`. */
function sourceExports(path: string): string[] {
  const source = readFileSync(join(ROOT, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const names = new Set<string>();
  for (const m of source.matchAll(/export (?:type )?\{([^}]*)\}/g)) for (const item of m[1].split(",")) { const w = item.trim().replace(/^type\s+/, "").split(/\s+as\s+/); if (w[0]) names.add((w[1] ?? w[0]).trim()); }
  for (const m of source.matchAll(/^export (?:async )?(?:function|const|interface|type|class) ([\w$]+)/gm)) names.add(m[1]);
  return [...names];
}

describe("the names a published version exported", () => {
  for (const file of readdirSync(join(ROOT, "tests/compat")).filter((f) => /^exports-.+\.json$/.test(f))) {
    it(`are all still exported by the sources: ${file}`, () => {
      const was = JSON.parse(readFileSync(join(ROOT, "tests/compat", file), "utf8")) as Record<string, string[]>;
      for (const [entry, names] of Object.entries(was)) {
        const now = sourceExports(ENTRIES[entry]);
        expect(names.filter((n) => !now.includes(n)), `${file} ${entry}`).toEqual([]);
      }
    });
  }

  it("are read from a declaration file as the check reads them", () => {
    const dts = [
      "export declare function readMod(tree: ModFiles): Promise<ModDescription>;",
      "export interface DiskFiles extends ModFiles {}",
      "export type ModKind = string;",
      "export { type CarriedFile, ENTRY_WORDS, a as readPath, type b as Layer };",
      "/** export declare const notThis: 1 */",
    ].join("\n");
    expect(exportedNames(dts)).toEqual(["CarriedFile", "DiskFiles", "ENTRY_WORDS", "Layer", "ModKind", "readMod", "readPath"]);
  });
});
