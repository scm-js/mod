// Every name a published version exported is still exported: the names of each entry's built declarations (`dist/*.d.mts`
// and `dist/*.d.cts`) compared with the lists kept in `tests/compat/exports-<version>.json`. Run after the build
// (`npm run check:exports`). `--write <version> <dist>` makes such a list from a published package's `dist`.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ENTRIES = { ".": "index", "./node": "node" };

/** The names a declaration file exports: its `export declare …`, `export interface/type …` and `export { … }`. */
export function exportedNames(dts) {
  const names = new Set();
  const code = dts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/^export \* /m.test(code)) throw new Error("a declaration file re-exports everything of another (export *): list it by hand");
  for (const m of code.matchAll(/^export (?:declare )?(?:abstract )?(?:function|const|let|var|class|enum|interface|type|namespace) ([\w$]+)/gm)) names.add(m[1]);
  for (const m of code.matchAll(/^export (?:type )?\{([^}]*)\}/gm)) {
    for (const item of m[1].split(",")) {
      const words = item.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      const name = (words[1] ?? words[0]).trim();
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

const exportsOf = (dist) => Object.fromEntries(Object.entries(ENTRIES).map(([entry, file]) => [entry, {
  mts: exportedNames(readFileSync(join(dist, `${file}.d.mts`), "utf8")),
  cts: exportedNames(readFileSync(join(dist, `${file}.d.cts`), "utf8")),
}]));

const here = new URL("..", import.meta.url).pathname;
// (only when run as a script: a test imports `exportedNames` before anything is built)
function main() {
  if (process.argv[2] === "--write") {
    const [, , , version, dist] = process.argv;
    const found = exportsOf(dist);
    const list = Object.fromEntries(Object.entries(found).map(([entry, { mts, cts }]) => {
      if (mts.join() !== cts.join()) throw new Error(`${entry}: its ESM and CommonJS declarations export different names`);
      return [entry, mts];
    }));
    writeFileSync(join(here, "tests/compat", `exports-${version}.json`), `${JSON.stringify(list, null, 2)}\n`);
    console.log(`exports-${version}.json: ${Object.entries(list).map(([e, n]) => `${e} ${n.length}`).join(", ")}`);
  } else {
    const now = exportsOf(join(here, "dist"));
    let missing = 0;
    for (const file of readdirSync(join(here, "tests/compat")).filter((f) => /^exports-.+\.json$/.test(f)).sort()) {
      const was = JSON.parse(readFileSync(join(here, "tests/compat", file), "utf8"));
      const before = missing;
      for (const [entry, names] of Object.entries(was)) for (const form of ["mts", "cts"]) {
        for (const name of names) if (!now[entry]?.[form].includes(name)) { missing++; console.error(`${file}: ${entry} (.d.${form}) no longer exports ${name}`); }
      }
      if (missing === before) console.log(`${file}: every name still exported (${Object.entries(was).map(([e, n]) => `${e} ${n.length}`).join(", ")}; now ${Object.entries(now).map(([e, n]) => `${e} ${n.mts.length}`).join(", ")})`);
    }
    if (missing) process.exit(1);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
