// Code written against @scm-js/mod 1.0.0, as its four callers write it (scm-sim's play page and runners, the scmJS
// editor, its command line and core, the Aftermath and Mod Editor plugins), which every later 1.x must compile with
// no cast and no change. It is type-checked (`npm run typecheck`, so `npm run verify` and CI), never run.
//
// 1.1.0 broke it: a `ReadOptions` value passed on (scm-sim's `src/exact/modRunner.ts#readMods`) gave
// `ModDescription | UnhashedDescription`, and `say("archive-unopenable", { path, why })` lacked a parameter. Each
// block names the caller code it stands for. The names at the end are every name 1.0.0 exported.
import {
  DAT_SHAPES, datTableOf, descriptionText, exeArchive, fileReaders, filesOf, FIREGRAFT_MOMENT, firegraftBytes, firegraftFilesOf, firegraftLine,
  firegraftPick, GAME_ARCHIVE_PRIORITY, GAME_FOLDERS, gameCopyFiles, gameCopyFolders, gameCopyText, gameName, hashLines, hashLinesAsWere,
  hasCodeLine, inDotFolder, inGamePaths, isModJsonPath, isPlayedRace, isPluginFile, isSystemFile, kindOf, kindTotals, leafOf, MOD_KINDS,
  MOD_MESSAGES, ModError, modRoot, moduleBytes, moduleFacts, ModReadError, normalizeRaces, openLayer, PatcherError, patcherPluginWords,
  planPlugins, pluginLine, PRIORITY, RACE_FILES, readMod, readModJson, readPath, readsStartupData, readZip, renderMessage, runningHash,
  saidRaces, say, sha256Hex, STARTUP_NAMES, tableShape, templateParams,
  type DataSetRace, type ExeArchive, type Identity, type Layer, type LayerFile, type ModDescription, type ModEntry, type ModFiles, type ModKind,
  type ModMessage, type ModMessageKey, type Module, type ModuleEntry, type OlderHashes, type RaceCandidates, type RaceFile, type ReadOptions,
} from "../../src/index.ts";
import { diskFiles, readModAt, type DiskFiles } from "../../src/node.ts";
import * as V1 from "../../src/index.ts";
import * as V1Node from "../../src/node.ts";

/* ── scm-sim src/exact/modRunner.ts: options passed on through a `ReadOptions` value ─────────────── */

export interface ReadMod { description: ModDescription; files: DiskFiles }

export async function readMods(paths: readonly string[], o: ReadOptions = {}): Promise<ReadMod[]> {
  const out: ReadMod[] = [];
  for (const p of paths) { const files = diskFiles(p); out.push({ description: await readMod(files, o), files }); }
  return out;
}
export async function memberOf(m: ReadMod, path: string): Promise<Uint8Array> { return readPath(m.files, path); }
export async function readModsAt(paths: readonly string[], o: ReadOptions = {}): Promise<ReadMod[]> {
  const out: ReadMod[] = [];
  for (const p of paths) out.push(await readModAt(p, o));
  return out;
}
export const optionsOf = (o: Partial<ReadOptions>): ReadOptions => ({ ...o });
export async function passedOn(tree: ModFiles, o?: ReadOptions): Promise<ModDescription> { return readMod(tree, o); }

/* ── scm-sim scripts/mod-describe.ts, lift-common.ts: `readModAt`, then the description ─────────── */

export async function describe(path: string): Promise<string[]> {
  const { description } = await readModAt(path);
  const { description: again, files } = await readModAt(path, {});
  const got = await firegraftFilesOf(files, again);
  return [...descriptionText(description), got ? got.name : "", String(got?.fgp.length ?? 0)];
}

/* ── scm-sim web/modDrop.ts: options written out, the description kept in a `ModDescription` variable ── */

export async function buildMod(tree: ModFiles, base: (name: string) => Promise<Uint8Array | null>, progress: (line: string) => void): Promise<void> {
  const differ: (ModDescription["files"][number] & { bytes: number; added: boolean })[] = [];
  let d: ModDescription, bytesAll = 0;
  try {
    d = await readMod(tree, {
      tables: (name) => base(name.replace(/\\/g, "/")),
      progress: (m) => progress(m.text),
      onFile: async (f, bytes) => { bytesAll += bytes.length; if (!(await base(f.name))) differ.push({ ...f, bytes: bytes.length, added: true }); },
    });
  } catch (e) { if (e instanceof ModReadError) throw new Error(e.message); throw e; }
  const copyOnly = d.said.find((x) => x.key === "copy-only");
  if (copyOnly) progress(copyOnly.text);
  const readerOf = fileReaders(tree, d);
  const kept: { name: string; read: () => Promise<Uint8Array> }[] = d.files.map((f) => ({ name: f.name, read: readerOf(f) }));
  const modules = (pick: (m: ModDescription["modules"][number]) => boolean) => d.modules.filter(pick);
  const pluginFiles = modules((m) => m.role !== "library" && ((m.source.kind === "file" && m.name in d.identity.plugins) || (m.source.kind === "carried" && !m.sameAs)));
  const carriedFiles = d.carried.filter((c) => c.source && c.plugin !== undefined).map((c) => ({ name: c.name, size: c.source!.kind === "carried" ? c.source!.size : 0, read: () => moduleBytes(tree, c) }));
  const firegraftFiles = (d.patches[0]?.files ?? []).map((f) => ({ name: f.name, size: f.size, read: () => firegraftBytes(tree, d, f) }));
  for (const m of d.said) if (m.key === "duplicate" || m.key === "text-folder") progress(m.text);
  const older: OlderHashes | undefined = d.identity.older ? { hash: d.identity.older.hash, ...(d.identity.older.withoutPlugins ? { withoutPlugins: d.identity.older.withoutPlugins } : {}) } : undefined;
  progress([kept.length, pluginFiles.length, carriedFiles.length, firegraftFiles.length, differ.length, bytesAll, older?.hash, d.identity.beforeCode].join(" "));
  progress(d.named.patcherPlugins.map((p) => patcherPluginWords(p).text).join(", "));
}

/* ── scm-sim src/bwapi/modCode.ts, src/exact/plugins.ts, web.ts, launch.ts: modules, priorities, the moment ── */

export async function pluginFile(m: ReadMod, x: Module, library: boolean): Promise<{ name: string; bytes: Uint8Array; library: boolean; entry?: ModuleEntry }> {
  const d = m.description;
  const exeOrder = (y: Module) => (y.source.kind === "carried" ? d.layers.findIndex((l) => l.path === (y.source as { exe: string }).exe) * 4096 + y.source.index : 0);
  const fg = await firegraftFilesOf(m.files, d);
  return { name: `${x.name}${exeOrder(x)}${fg?.from ?? ""}`, bytes: new Uint8Array(await moduleBytes(m.files, x)), library, entry: x.entry ?? moduleFacts(new Uint8Array(0)).entry };
}
export const layersOf = (files: unknown) => [
  { priority: GAME_ARCHIVE_PRIORITY["patch_rt.mpq"], files, name: "patch_rt.mpq" },
  { priority: PRIORITY.folder, files, name: "the mod" },
  { priority: PRIORITY.pluginLoader, files, name: FIREGRAFT_MOMENT.name },
];
export const plan = (given: { name: string; bytes: Uint8Array }[]) => { const p = planPlugins(given); return [...p.load, ...p.skipped.map((s) => `${s.name}: ${s.why.text}`)]; };
export const found = (bytes: Uint8Array) => { const f = exeArchive(bytes); return f ? [f.form, f.at, f.bytes.length, f.plugins.map((p) => p.name ?? p.id.toString(16))] : null; };
export const picked = firegraftPick([{ name: "a.fgp", place: "" }]).project;

/* ── scm-sim src/mods/inspect.ts, web/mods.ts, src/mods/races.ts: kinds, tables, the hash's rules, races ── */

export async function kept(m: { hash: string; files: { name: string; size: number }[]; lines?: string; sha?: Record<string, string>; description: ModDescription }) {
  const wider = (f: { name: string; size: number }) => { if (/\.datex$/.test(f.name)) return true; const t = datTableOf(f.name); return t !== null && f.size !== DAT_SHAPES[t].size; };
  const kinds: Partial<Record<ModKind, number>> = {};
  for (const f of m.files) kinds[kindOf(f.name)] = (kinds[kindOf(f.name)] ?? 0) + 1;
  const shown = MOD_KINDS.filter((k) => k !== "other" && kinds[k]).map((k) => `${k} ${kinds[k]!.toLocaleString("en")}`);
  const lines = m.lines ? m.lines.split("\n") : [];
  const sha: Record<string, string> = { ...m.sha };
  for (const x of m.description.modules) if (hasCodeLine(x) && x.sha256 && !(x.name in sha)) sha[x.name] = x.sha256;
  const pluginLines = Object.entries(sha).map(([n, s]) => pluginLine(n, s));
  const older: OlderHashes = { hash: await hashLinesAsWere([...lines, ...pluginLines]), withoutPlugins: await hashLines(lines) };
  const projectLine = firegraftLine("Made.fgp", await sha256Hex(new Uint8Array(0)));
  const running = await runningHash(lines, sha, Object.keys(sha));
  const reload = readsStartupData(m.files.map((f) => f.name));
  const copy = gameCopyText(m.files.map((f) => f.name), "x").map((x) => x.text);
  return [m.files.some(wider), shown, older, projectLine, running, reload, copy, m.files.some((f) => isSystemFile(f.name)), inGamePaths(m.files.map((f) => f.name))];
}
export const racesField = (value: unknown): { races?: DataSetRace[] } => { const races = normalizeRaces(value); return races.length ? { races } : {}; };
export const saidRacesField = (value: unknown): { races?: DataSetRace[] } => { const races = saidRaces(value); return races === undefined ? {} : { races }; };
export function raceFiles(letter: string): Record<RaceFile, string> {
  const files = {} as Record<RaceFile, string>;
  for (const kind of Object.keys(RACE_FILES) as RaceFile[]) files[kind] = RACE_FILES[kind](letter);
  return files;
}
export const playsAs = (race: number) => (isPlayedRace(race) ? race : null);

/* ── scmJS command line cli/src/mod/source.ts, hash.ts, overlay.ts: the description, read again; messages ── */

export async function describedSource(tree: ModFiles, hint: string | null): Promise<ModMessage[]> {
  let d: ModDescription;
  try { d = await readMod(tree); } catch (e) { if (e instanceof ModError) throw new Error(`${e.detail.key === "exe-no-archive" ? hint : ""}${e.detail.text}`); throw e; }
  const copyOnly = d.said.find((m) => m.key === "copy-only");
  if (copyOnly) throw new Error(String(copyOnly.params.folder));
  const layerName = (l: Layer) => (l.kind === "archive" ? l.path : l.path ? `${l.path}/` : "./");
  const readOf = fileReaders(tree, d);
  const files: { name: string; read: () => Promise<Uint8Array>; layer: string }[] = d.files.map((f) => ({ name: f.name, read: readOf(f), layer: layerName(d.layers[f.layer]) }));
  for (const m of d.modules) if (m.source.kind === "file" && isPluginFile(m.name)) files.push({ name: m.name, read: () => moduleBytes(tree, m), layer: m.source.path });
  for (const c of d.carried) {
    const s = c.source;
    if (s?.kind !== "member") continue;
    const layer = d.layers.find((l) => l.kind === "archive" && l.path === s.archive);
    const archive = layer ? await openLayer(tree, layer) : null;
    files.push({ name: c.name, read: async () => archive?.readFile(s.member) ?? new Uint8Array(0), layer: s.archive });
  }
  for (const f of d.patches[0]?.files ?? []) files.push({ name: f.name, read: () => firegraftBytes(tree, d, f), layer: f.archive ?? f.path ?? "" });
  return d.said.map((m) => ("path" in m.params && typeof m.params.path === "string" ? { ...m, params: { ...m.params, path: leafOf(m.params.path) } } as ModMessage : m));
}
export async function sourceHash(tree: ModFiles, d: ModDescription): Promise<{ hash: string; older: { hash: string; withoutPlugins: string | null; left: string[] } | null; gameFilesOnly: string; system: string[] }> {
  const id = d.identity;
  const gameLines = id.lines.filter((l) => !/\.fgp\t/.test(l));
  const system: string[] = [];
  for (const l of [...d.layers].reverse()) if (l.kind === "archive") { const a = await openLayer(tree, l); for (const n of id.older?.files ?? []) { const b = a.fileInfo(n) ? a.readFile(n) : null; if (b) system.push(`${gameName(n)}\t${await sha256Hex(b)}`); } }
  const ran = Object.keys(id.plugins).slice(1);
  const hash = ran.length ? await runningHash(id.lines, id.plugins, ran) : id.hash;
  return { hash, older: id.older ? { hash: id.older.hash, withoutPlugins: id.older.withoutPlugins ?? null, left: id.older.files } : null, gameFilesOnly: await hashLines(gameLines), system };
}
export const startup = (has: Set<string>) => STARTUP_NAMES.filter((n) => !has.has(n));

/* ── scmJS core src/formats/mod/legacy.ts: the package's exe reader with two fields of its own ─────── */

export interface LegacyExeArchive extends ExeArchive { kind: "sempq" | "firegraft"; archive: Uint8Array }
export function legacyExeArchive(b: Uint8Array): LegacyExeArchive | null {
  const f = exeArchive(b);
  return f && { ...f, kind: f.form === "firegraft-patcher" ? "firegraft" : "sempq", archive: f.bytes.subarray(f.at) };
}
export const legacyGameName = (path: string): string => gameName(path).replace(/^\\+/, "");

/* ── scmJS editor src/gamedata/*: an installer's tree, the worker's read, races from mod.json ─────── */

export function modTree(mod: { name: string; files: readonly { path: string; data: ArrayBuffer }[]; layout?: "game" }): ModFiles {
  const byPath = new Map(mod.files.map((f) => [f.path, f.data]));
  return {
    name: mod.name, ...(mod.layout ? { layout: mod.layout } : {}),
    list: async () => mod.files.map((f): ModEntry => ({ path: f.path, size: f.data.byteLength })),
    read: async (path) => { const b = byPath.get(path); if (!b) throw new ModReadError(say("not-in-tree", { path, name: mod.name })); return new Uint8Array(b); },
  };
}
export async function extract(tree: ModFiles, post: (m: { label: string; mod?: ModMessage }) => void): Promise<void> {
  try {
    const d = await readMod(tree, { progress: (m) => post({ label: m.text, mod: m }) });
    const readOf: (f: LayerFile & { layer: number }) => () => Promise<Uint8Array> = fileReaders(tree, d);
    for (const f of d.files) await readOf(f)();
  } catch (err) { post({ label: err instanceof Error ? err.message : String(err), ...(err instanceof ModError ? { mod: err.detail } : {}) }); }
}
export async function racesOf(paths: string[], text: (path: string) => Promise<string>): Promise<DataSetRace[]> {
  const top = paths[0]?.split("/")[0] ?? "";
  const json = paths.filter((p) => isModJsonPath(p, top)).sort((a, b) => a.split("/").length - b.split("/").length)[0];
  return json ? readModJson(await text(json))?.races ?? [] : [];
}
export const rooted = (kept: string[]) => [modRoot(kept), kept.some((p) => p.toLowerCase().split("/").slice(0, -1).some((f) => f !== "maps" && GAME_FOLDERS.includes(f))), kept.filter((p) => !inDotFolder(p))];
export const hasRaceCandidates = (c: RaceCandidates) => c.names.length > 0 || c.letters.length > 0;
export const totals = (files: { name: string; size: number }[]) => kindTotals(files);

/* ── Aftermath modreplay.ts: a picked folder as a tree, its hashes, the package's words by key ──── */

export function pickedTree(picked: readonly { path: string; file: Blob }[]): ModFiles {
  const byPath = new Map(picked.map((f) => [f.path, f.file]));
  const name = picked[0]?.path.split("/")[0] || "mod";
  return {
    name,
    list: async () => [...byPath].map(([path, file]) => ({ path, size: file.size })),
    read: async (path) => { const file = byPath.get(path); if (!file) throw new ModReadError(say("not-in-tree", { path, name })); return new Uint8Array(await file.arrayBuffer()); },
  };
}
export async function modFolder(tree: ModFiles, under: (member: string) => Promise<Uint8Array | null>, progress?: (said: ModMessage) => void) {
  const changed = new Set<string>();
  const description = await readMod(tree, { ...(progress ? { progress } : {}), onFile: async (f) => { if (!(await under(f.name))) changed.add(f.name); } });
  const reader = fileReaders(tree, description);
  const byName = new Map(description.files.map((f) => [f.name.replace(/^\\+/, ""), f]));
  const root = description.layers.find((l) => l.kind === "folder")?.path ?? folderOfFirst(description);
  return { description, changed, root, file: async (member: string) => { const f = byName.get(member); return f ? reader(f)() : null; } };
}
const folderOfFirst = (d: ModDescription) => d.layers.find((l) => l.kind === "archive")?.path ?? "";
export const MOD_WORDS = ["not-in-tree", "overlay-form", "zip-cut", "archive-unopenable", "exe-unreadable", "exe-no-archive", "exe-archive-unopenable", "zip-unreadable", "opening", "probing", "reading-files"] as const satisfies readonly ModMessageKey[];
export const MOD_WORD_TEXTS: readonly string[] = MOD_WORDS.map((key) => MOD_MESSAGES[key].text);
export const modText = (said: ModMessage, t: (text: string, params?: Record<string, string | number>) => string): string => renderMessage(said, (template, params) => t(template, params));
export const modErrorText = (err: unknown, t: (text: string) => string): string => (err instanceof ModError ? modText(err.detail, t) : err instanceof Error ? err.message : String(err));
export const testError = new ModReadError(say("exe-unreadable", { path: "Mod.exe", why: new PatcherError(say("overlay-form", { at: 1024, form: 2, known: 1 })).detail }));
export const opening = (path: string) => say("opening", { path });
/** A message made as 1.0.0 made it: `archive-unopenable` with `path` and `why` alone, `why` read as the string it is. */
export const unopenable = say("archive-unopenable", { path: "Mod/broken.mpq", why: "Corrupted: Hash table extends beyond archive" });
export const unopenableExe = say("exe-archive-unopenable", { path: "Made.exe", at: 6656, why: "Corrupted" });
export const whyText = (e: ModError): string => (e.detail.key === "archive-unopenable" && typeof e.detail.params.why === "string" ? e.detail.params.why : e.message);

/* ── Mod Editor source.ts, session.ts, i18n.ts: the identity kept, a handed tree read, words ──────── */

export async function identityOf(files: { path: string; bytes: Uint8Array }[], name: string): Promise<Identity> {
  const byPath = new Map(files.map((f) => [f.path, f.bytes]));
  return (await readMod({ name, layout: "game", list: async () => files.map((f) => ({ path: f.path, size: f.bytes.length })), read: async (p) => byPath.get(p)! })).identity;
}
export async function opened(tree: ModFiles, progress?: (m: ModMessage) => void): Promise<{ identity: Identity | null; races: DataSetRace[] }> {
  let d: ModDescription;
  try { d = await readMod(tree, progress ? { progress } : {}); } catch { return { identity: null, races: [] }; }
  return { identity: d.identity, races: d.races ?? [] };
}
export async function editedHash(id: Identity, touched: Map<string, Uint8Array | null>): Promise<string> {
  const lines = new Map(id.lines.map((l) => [l.slice(0, l.indexOf("\t")), l]));
  for (const [k, bytes] of touched) { const name = gameName(k); if (!bytes) lines.delete(name); else lines.set(name, `${name}\t${await sha256Hex(bytes)}`); }
  return runningHash([...lines.values()], id.plugins, Object.keys(id.plugins));
}
export const modWords = (message: ModMessage): string => renderMessage(message, (template, params) => template + JSON.stringify(params));
export const placeholders = (template: string) => templateParams(template);
export const members = (b: Uint8Array) => readZip(b).map((m) => m.path);
export const copies = (paths: string[]) => [gameCopyFiles(paths).size, gameCopyFolders(paths).map((c) => c.folder), tableShape("arr\\units.dat", 1)?.entries];
export const inMemory = filesOf("Mod", { "Mod/arr/units.dat": new Uint8Array(1) });

/* ── Made by hand to the 1.0.0 types: every field 1.0.0 had, none it had not ──────────────────────── */

export const IDENTITY: Identity = { lines: [], plugins: {}, hash: "0", withoutPlugins: "0", older: { hash: "1", files: ["sound\\desktop.ini"] }, code: false, readsStartupData: false };
export const DESCRIPTION: ModDescription = {
  version: 1, name: "Mod", game: "1.16.1", loaders: [], layers: [], files: [], modules: [], patches: [], carried: [], identity: IDENTITY,
  said: [say("no-game-files", { name: "Mod" })], unreadable: [], gameCopy: [], left: [], duplicates: [], named: { plugins: [], projects: [], patcherPlugins: [] },
};
export const OPTIONS: ReadOptions = { progress: () => {}, onFile: () => {}, tables: async () => null };
export const fromHandBuilt = async (tree: ModFiles): Promise<ModDescription> => readMod(tree, OPTIONS);

/* ── Every name 1.0.0 exported (from its own src/index.ts): a name gone does not compile ──────────── */

export const VALUES_1_0_0 = [
  V1.readMod, V1.plugInOrder, V1.planPlugins, V1.readPath, V1.fileReaders, V1.moduleBytes, V1.openLayer,
  V1.firegraftBytes, V1.firegraftFilesOf, V1.isPluginFile, V1.isCodeFile, V1.patcherPluginWords, V1.PRIORITY,
  V1.filesOf, V1.isSystemFile, V1.inDotFolder, V1.leafOf, V1.folderOf, V1.SYSTEM_FILES, V1.descriptionLines,
  V1.descriptionText, V1.MOD_MESSAGES, V1.say, V1.renderMessage, V1.formatMessage, V1.templateParams, V1.ModError,
  V1.ModReadError, V1.sha256Hex, V1.hashLines, V1.hashLinesAsWere, V1.isSystemLine, V1.pluginLine, V1.firegraftLine,
  V1.hasCodeLine, V1.runningHash, V1.programEnd, V1.libraryName, V1.exportsOf, V1.importsOf, V1.holdsString,
  V1.exeArchive, V1.archiveInFile, V1.isExe, V1.isMpq, V1.PatcherError, V1.MPQDRAFT_COMPONENT,
  V1.MPQDRAFT_DLL_MODULE, V1.isZip, V1.readZip, V1.zipFiles, V1.ZipError, V1.tblStrings, V1.namesToProbe,
  V1.probeNames, V1.moduleFacts, V1.ENTRY_WORDS, V1.firegraftPick, V1.listedNames, V1.FIREGRAFT_LISTS,
  V1.FIREGRAFT_MOMENT, V1.modRoot, V1.inGamePaths, V1.gameCopyFiles, V1.gameCopyFolders, V1.gameCopyText, V1.kindOf,
  V1.kindTotals, V1.tableShape, V1.datTableOf, V1.gameOf, V1.MOD_KINDS, V1.DAT_SHAPES, V1.readModJson,
  V1.isModJsonPath, V1.MOD_JSON, V1.MAX_MOD_NAME, V1.normalizeRace, V1.normalizeRaces, V1.saidRaces,
  V1.isDeclarableRace, V1.isPlayedRace, V1.raceCandidates, V1.MAX_DECLARED_RACES, V1.MAX_RACE_NAME,
  V1.GAME_NETWORK_TBL_ENTRIES, V1.gameName, V1.gameFileNames, V1.readsStartupData, V1.GAME_FOLDERS, V1.GAME_ARCHIVES,
  V1.GAME_ARCHIVE_PRIORITY, V1.TILESET_NAMES, V1.RACE_NAMES, V1.RACE_FILES, V1.INTERFACE_NAMES, V1.STARTUP_NAMES,
  V1.DAT_TABLES,
  V1Node.diskFiles, V1Node.readModAt,
] as const;
export type TYPES_1_0_0 = [
  V1.ModDescription, V1.ReadOptions, V1.Loader, V1.LoaderKind, V1.Layer, V1.LayerFile, V1.Module, V1.ModuleRole,
  V1.ModuleSource, V1.FiregraftFile, V1.FiregraftPatch, V1.CarriedFile, V1.Identity, V1.LeftReason, V1.ModEntry,
  V1.ModFiles, V1.ModMessage, V1.ModMessageOf<"opening">, V1.ModMessageKey, V1.ModMessageParams<"opening">,
  V1.ModParam, V1.Translate, V1.OlderHashes, V1.PeExports, V1.ExeArchive, V1.ExeForm, V1.CarriedModule, V1.ZipMember,
  V1.TablesOf, V1.ModuleEntry, V1.ModuleFacts, V1.ModKind, V1.DatTableName, V1.TableShape, V1.ModJson,
  V1.DataSetRace, V1.RaceCandidates, V1.RaceFile,
  V1Node.DiskFiles,
];
