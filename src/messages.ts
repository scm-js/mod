/**
 * Every sentence the reader can produce, in one list (`MOD_MESSAGES`): its key, its English text and the names of its
 * parameters. Nothing else in the package writes words for a person: an error, a line of progress, a reason a module is
 * not loaded, what was left out, each line of `descriptionText`, all are a `ModMessage` made from this list by `say`,
 * so a caller can translate by key and a new sentence cannot be added without being listed here.
 *
 * The texts use a small subset of ICU MessageFormat: `{name}`, `{n, plural, =0 {…} one {# file} other {# files}}`
 * (`#` is the number) and `{x, select, yes {…} other {…}}`. A parameter may itself be a message (the reason inside an
 * error), which `renderMessage` renders first. A message's facts are its parameters: a caller that needs one reads
 * `params`, never the sentence.
 *
 * Each message also says where it is shown (`in`: an error, a reason inside one, progress, what is said, …), and
 * `MOD_MESSAGE_GROUPS` is made from that. A message may carry a parameter its English text does not show (`hidden`):
 * `archive-unopenable` and `exe-archive-unopenable` show the archive library's English text as `why`, as they always
 * have, and carry the same reason as a message, `reason`, which a translating caller renders where it is present.
 *
 * What is stable: the keys and their parameters' names. Changing or removing either is a major version; adding a
 * message is a minor one. The English text may change in a minor version, so a catalogue keyed by `key` keeps working
 * and one keyed by the English `template` finds a changed sentence untranslated until it is translated again.
 */

/** A parameter's value: a name or a number, or another message (rendered first). */
export type ModParam = string | number | ModMessage;

/**
 * Where a message is shown, for a caller that lists the keys it translates (`MOD_MESSAGE_GROUPS`):
 * - `error`: the `detail` of a `ModReadError` (what `readMod`, `readPath`, `moduleBytes`, `firegraftBytes`,
 *   `tblStrings` and the trees' `read` reject with);
 * - `reason`: a reason inside an error (its `why`, or its `reason`), and the `detail` of a `PatcherError` or `ZipError`
 *   (what `exeArchive`, `readZip` and a zip's member's `read` throw);
 * - `progress`: what `ReadOptions.progress` hears;
 * - `said`: `ModDescription.said`;
 * - `loader`: `Loader.words`; `named`: `patcherPluginWords`; `entry`: `ENTRY_WORDS`;
 * - `why`: `Module.why`, `CarriedFile.why` and the reasons `plugInOrder` and `planPlugins` give;
 * - `description`: the lines of `descriptionLines`.
 */
export type ModMessageGroup = "error" | "reason" | "progress" | "said" | "loader" | "named" | "entry" | "why" | "description";

/**
 * `hidden`: parameters a message carries for a caller that its English text does not show (a reason as a message,
 * beside the text the sentence has always shown): a catalogue's own template may use them.
 */
interface Entry { readonly text: string; readonly params: readonly string[]; readonly in: readonly ModMessageGroup[]; readonly hidden?: readonly string[] }

const ERROR = ["error"] as const, REASON = ["reason"] as const, PROGRESS = ["progress"] as const, SAID = ["said"] as const;
const SAID_PROGRESS = ["said", "progress"] as const, LOADER = ["loader"] as const, NAMED = ["named"] as const;
const ENTRY = ["entry"] as const, WHY = ["why"] as const, DESCRIPTION = ["description"] as const;

export const MOD_MESSAGES = {
  /* ── Reading files ─────────────────────────────────────────── */
  "not-in-tree": { text: "{path} is not among {name}'s files", params: ["path", "name"], in: ERROR },
  "tbl-too-short": { text: "a string table of fewer than two bytes", params: [], in: ERROR },
  "tbl-offsets-past-end": { text: "a string table whose offsets run past its end", params: [], in: ERROR },
  "tbl-string-past-end": { text: "string {index} starts past the table's end", params: ["index"], in: ERROR },

  /* ── A self-executing exe (PatcherError: why, inside "cannot be read as a mod") ── */
  "overlay-form": { text: "its patcher overlay (at byte {at}) is of form {form}; only form {known} is known", params: ["at", "form", "known"], in: REASON },
  "overlay-count": { text: "its patcher overlay (at byte {at}) says it holds {count} plugins, which is no number a patcher writes", params: ["at", "count"], in: REASON },
  "overlay-cut": { text: "its patcher overlay says it holds {count} plugins, and the file ends after {read}", params: ["count", "read"], in: REASON },
  "overlay-word": { text: "plugin {n} of its patcher overlay (at byte {at}) has {value} where every patcher seen has 0: a form this reader does not know", params: ["n", "at", "value"], in: REASON },
  "overlay-plugin-cut": { text: "plugin {n} of its patcher overlay is {size} bytes, and the file ends {left} bytes after its start", params: ["n", "size", "left"], in: REASON },
  "overlay-plugin-not-library": { text: "plugin {n} of its patcher overlay (at byte {at}) is no Windows library", params: ["n", "at"], in: REASON },
  "efs-entry-cut": { text: "entry {n} of its MPQDraft file system (at byte {at}) runs past the file's end", params: ["n", "at"], in: REASON },
  "patcher-no-archive": { text: "it is FireGraft's patcher with {plugins, plural, one {# plugin} other {# plugins}}, and no archive was found after {plugins, plural, =0 {its overlay} other {them}}", params: ["plugins"], in: REASON },
  "sempq-no-archive": { text: "it is MPQDraft's self-executing form with {files, plural, one {# embedded file} other {# embedded files}}, and no archive was found after them", params: ["files"], in: REASON },

  /* ── A zip (ZipError) ──────────────────────────────────────── */
  "zip-cut": { text: "This zip's directory is not at its end: it may be cut short.", params: [], in: REASON },
  "zip64": { text: "This zip is in the large-zip form (zip64), which this reader does not read: unzip it and give the folder instead.", params: [], in: REASON },
  "zip-damaged": { text: "This zip's directory is damaged.", params: [], in: REASON },
  "zip-encrypted": { text: "{path} is encrypted in this zip, and encrypted zips are not read.", params: ["path"], in: REASON },
  "zip-method": { text: "{path} is packed in a way this reader does not read (method {method}): only stored and deflated members are read.", params: ["path", "method"], in: REASON },
  "zip-member-damaged": { text: "{path}: its place in the zip is damaged.", params: ["path"], in: REASON },
  "zip-member-size": { text: "{path}: inflated to {got} bytes, where the zip says {size}.", params: ["path", "got", "size"], in: REASON },
  "zip-member-inflate": { text: "{path}: its packed bytes could not be inflated ({detail}).", params: ["path", "detail"], in: REASON },

  /* ── An archive the archive library (mopaq) could not open or list: the `reason` of "archive-unopenable" and
     "exe-archive-unopenable", by the library's own kind of error; `detail` is the library's English text ── */
  "mpq-no-header": { text: "no archive header is where it should be ({detail})", params: ["detail"], in: REASON },
  "mpq-version": { text: "its format version is one this reader does not read ({detail})", params: ["detail"], in: REASON },
  "mpq-damaged": { text: "it is damaged ({detail})", params: ["detail"], in: REASON },
  "mpq-compression": { text: "a file in it is packed in a way this reader does not read ({detail})", params: ["detail"], in: REASON },
  "mpq-io": { text: "it could not be read ({detail})", params: ["detail"], in: REASON },
  "mpq-file-missing": { text: "a file it needs is not in it ({detail})", params: ["detail"], in: REASON },
  "mpq-other": { text: "{detail}", params: ["detail"], in: REASON },

  /* ── Reading a mod (ModReadError) ──────────────────────────── */
  "archive-unopenable": { text: "{path} could not be opened as an archive: {why}", params: ["path", "why", "reason"], in: ERROR, hidden: ["reason"] },
  "exe-unreadable": { text: "{path} cannot be read as a mod: {why}.", params: ["path", "why"], in: ERROR },
  "exe-no-archive": { text: "{path} holds no archive: it is a program only, not a mod's patcher or self-executing archive", params: ["path"], in: ERROR },
  "exe-archive-unopenable": { text: "the archive inside {path} (at byte {at}) could not be opened: {why}", params: ["path", "at", "why", "reason"], in: ERROR, hidden: ["reason"] },
  "zip-unreadable": { text: "{path} cannot be read as a zip: {why}", params: ["path", "why"], in: ERROR },
  "file-unreadable": { text: "{path} could not be read: {why}", params: ["path", "why"], in: ERROR },
  "module-no-source": { text: "{name} has no source to read it from", params: ["name"], in: ERROR },
  "module-in-archive": { text: "{name} is inside an archive ({archive}): no loader loads it from there", params: ["name", "archive"], in: ERROR },
  "firegraft-archive-missing": { text: "{name}: its archive {archive} is not among the mod's", params: ["name", "archive"], in: ERROR },
  "firegraft-unreadable": { text: "{name} could not be read from {path}", params: ["name", "path"], in: ERROR },

  /* ── Progress (`ReadOptions.progress`) ─────────────────────── */
  "opening": { text: "Opening {path}…", params: ["path"], in: PROGRESS },
  "probing": { text: "{path} has no list of its files; looking for the game's own names in it…", params: ["path"], in: PROGRESS },
  "reading-files": { text: "Reading the mod's files: {done} of {total}…", params: ["done", "total"], in: PROGRESS },

  /* ── What was said of the mod (`ModDescription.said`; `game-copy` is also progress) ── */
  "game-copy": { text: "{folder} is a copy of the game. Its own archives ({list}{more, plural, =0 {} other { and # more}}) are not part of the mod and were left out.", params: ["folder", "list", "more"], in: SAID_PROGRESS },
  "copy-only": { text: "{folder} is a copy of the game, and there is no mod in it.", params: ["folder"], in: SAID },
  "packing-laid-instead": { text: "{path} is {loader}'s own packing of its folder of files (it names it): the folder is laid in its place, at {priority}.", params: ["path", "loader", "priority"], in: SAID },
  "json-unreadable": { text: "{path} is not JSON that can be read: left out.", params: ["path"], in: SAID },
  "text-folder": { text: "{path} says this is a mod folder in text form (format {format}): its texts and pictures are packed into the game's files before it can be read as a mod.", params: ["path", "format"], in: SAID },
  "unheld": { text: "Left out, listed but not held by its archive or not readable: {list}{more, plural, =0 {} other { and # more}}.", params: ["list", "more"], in: SAID },
  "duplicate": { text: "{name} is given more than once, in another case ({paths}): the last is used.", params: ["name", "paths"], in: SAID },
  "no-game-files": { text: "There are no game files in {name}.", params: ["name"], in: SAID },

  /* ── The loaders (`Loader.words`) ──────────────────────────── */
  "loader-firegraft": { text: "FireGraft's patcher, with {plugins, plural, one {# plugin} other {# plugins}} in its overlay and its archive", params: ["plugins"], in: LOADER },
  "loader-sempq": { text: "MPQDraft's self-executing MPQ, with {files, plural, one {# embedded file} other {# embedded files}} and its archive", params: ["files"], in: LOADER },
  "loader-self-executing": { text: "a program with an archive after it, in neither patcher's form: read as that archive", params: [], in: LOADER },
  "loader-replacement": { text: "an archive in place of the game's own {name}: the game opens it itself", params: ["name"], in: LOADER },
  "loader-mpqdraft": { text: "an archive, as MPQDraft's patcher lays one", params: [], in: LOADER },
  "loader-packing": { text: "{loader}'s own packing of its folder of files, which it opens at {priority}{laid, select, yes {: the folder is laid in its place} other {}}", params: ["loader", "priority", "laid"], in: LOADER },
  "loader-plugin-loader": { text: "a plugin that loads plugins: its folder's plugins by name (not those starting with _), its folder of files laid at {priority}", params: ["priority"], in: LOADER },
  "loader-folder": { text: "files in the game's paths and plugins beside them, which no loader on Windows takes: the mod needs its files laid over the game's and its plugins loaded by name", params: [], in: LOADER },

  /* ── A plugin a patcher exe carries, named for a person (`patcherPluginWords`) ── */
  "patcher-plugin": { text: "{exe} ({form, select, mpqdraft-sempq {MPQDraft SEMPQ} other {FireGraft patcher}} plugin {named, select, yes {{name}, } other {}}id {id})", params: ["exe", "form", "named", "name", "id"], in: NAMED },

  /* ── How a loader enters a module (`ENTRY_WORDS`) ──────────── */
  "entry-mpqdraft": { text: "MPQDraft's interface (GetMPQDraftPlugin, InitializePlugin)", params: [], in: ENTRY },
  "entry-bwl": { text: "Chaoslauncher's (GetPluginAPI, ApplyPatchSuspended)", params: [], in: ENTRY },
  "entry-snp": { text: "a storm network provider's (SnpBind)", params: [], in: ENTRY },
  "entry-dllmain": { text: "DllMain alone", params: [], in: ENTRY },
  "entry-none": { text: "none: not a Windows image", params: [], in: ENTRY },

  /* ── Why a module is not loaded, why a file is carried (`Module.why`, `CarriedFile.why`) ── */
  "why-plugin-loader": { text: "it loads the mod's other plugins: the mod needs those plugins loaded in its order, not this plugin itself", params: [], in: WHY },
  "why-underscore": { text: "its loader leaves out a name that starts with _", params: [], in: WHY },
  "why-qdp-only": { text: "its loader loads .qdp files only", params: [], in: WHY },
  "why-no-entry": { text: "it has no GetMPQDraftPlugin, which its loader asks for", params: [], in: WHY },
  "why-off": { text: "turned off", params: [], in: WHY },
  "why-mpqdraft-patcher": { text: "MPQDraft's own patcher, which its stub loads to lay the archive and load the plugins: the mod needs what it does, not the DLL itself", params: [], in: WHY },
  "why-same-plugin": { text: "the same plugin as {name}, which is that file", params: ["name"], in: WHY },
  "why-library": { text: "a library: mapped when a module imports it or asks for it", params: [], in: WHY },
  "why-provider": { text: "a storm network provider: storm loads it only when a game between people chooses its mode, not when the mod starts", params: [], in: WHY },
  "why-plugin-data": { text: "a file of plugin {id}'s, handed to it by MPQDraft's server (GetPluginModule)", params: ["id"], in: WHY },
  "why-plugin-in-archive": { text: "a plugin inside an archive: no loader loads one from there", params: [], in: WHY },

  /* ── The description in lines (`descriptionText`) ──────────── */
  "describe-name": { text: "{name}{link, select, none {} other { <{link}>}}{races, select, none {} other {; races {races}}}", params: ["name", "link", "races"], in: DESCRIPTION },
  "describe-loaders": { text: "loaders (outermost first):", params: [], in: DESCRIPTION },
  "describe-loader": { text: "  {kind}  {top, select, yes {(the top)} other {{path}}}: {words}", params: ["kind", "top", "path", "words"], in: DESCRIPTION },
  "describe-layers": { text: "layers (by storm's priority, lowest first: laid in this order, the later winning):", params: [], in: DESCRIPTION },
  "describe-layer": { text: "  {n}. {kind} {top, select, yes {(the top)} other {{path}}}{at, select, none {} other { at byte {at}}}  priority {priority} by {by}{replaces, select, none {} other {, in place of the game's {replaces}}}: {files, plural, one {# file} other {# files}}{probed, select, yes { (no list: found by name)} other {}}", params: ["n", "kind", "top", "path", "at", "priority", "by", "replaces", "files", "probed"], in: DESCRIPTION },
  "describe-files": { text: "  the game files after laying: {files}", params: ["files"], in: DESCRIPTION },
  "describe-modules": { text: "modules (the loader's order):", params: [], in: DESCRIPTION },
  "describe-module": { text: "  {order} {name}  {role}, entered by {entry}{samase, select, yes {; samase too} other {}}{id, select, none {} other {, id {id}}}; from {from}; {size} bytes{loaded, select, yes {} other {; not loaded: {why}}}", params: ["order", "name", "role", "entry", "samase", "id", "from", "size", "loaded", "why"], in: DESCRIPTION },
  "describe-patches": { text: "patches:", params: [], in: DESCRIPTION },
  "describe-patch": { text: "  FireGraft project {project} (from {top, select, yes {the top} other {{place}}}){database, select, none {, no database} other { with database {database}}}; lands at the game's first open of {moment} (a game's start, after the plugins' inits)", params: ["project", "top", "place", "database", "moment"], in: DESCRIPTION },
  "describe-carried": { text: "carried:", params: [], in: DESCRIPTION },
  "describe-carried-file": { text: "  {name}: {why}", params: ["name", "why"], in: DESCRIPTION },
  "describe-none": { text: "  none", params: [], in: DESCRIPTION },
  "describe-identity": { text: "identity: hash {hash}, without plugins {withoutPlugins}; {lines} lines and {plugins} plugin lines{older, select, none {} other {; older {older}}}{beforeCode, select, none {} other {; before its code had lines {beforeCode}}}{declared, select, none {} other {; mod.json says {declared}}}; code {code, select, yes {yes} other {no}}; startup data read again {startup, select, yes {yes} other {no}}", params: ["hash", "withoutPlugins", "lines", "plugins", "older", "beforeCode", "declared", "code", "startup"], in: DESCRIPTION },
  "describe-said": { text: "said: {said}", params: ["said"], in: DESCRIPTION },
} as const satisfies Record<string, Entry>;

export type ModMessageKey = keyof typeof MOD_MESSAGES;

/** The keys of one group (`ModMessageGroup`): `ModMessageKeyIn<"progress">` is every key `ReadOptions.progress` can hear. */
export type ModMessageKeyIn<G extends ModMessageGroup> = { [K in ModMessageKey]: G extends (typeof MOD_MESSAGES)[K]["in"][number] ? K : never }[ModMessageKey];
/** Any message of one group (`ModMessageInGroup<"said">`: any of `ModDescription.said`). */
export type ModMessageInGroup<G extends ModMessageGroup> = { [K in ModMessageKeyIn<G>]: ModMessageOf<K> }[ModMessageKeyIn<G>];

const GROUP_NAMES: readonly ModMessageGroup[] = ["error", "reason", "progress", "said", "loader", "named", "entry", "why", "description"];

/**
 * The keys of each group, in `MOD_MESSAGES`' order, made from each message's own `in`: what a caller that shows only
 * some of the package's sentences (errors and their reasons, progress) translates. A key may be in two groups
 * (`game-copy` is said and heard as progress). The code is held to them: a message passed where its group is not
 * listed does not compile, and the tests read the sources for the rest.
 */
export const MOD_MESSAGE_GROUPS: { readonly [G in ModMessageGroup]: readonly ModMessageKeyIn<G>[] } = /* @__PURE__ */ (() => {
  const out = Object.fromEntries(GROUP_NAMES.map((g) => [g, [] as string[]])) as Record<ModMessageGroup, string[]>;
  for (const [key, m] of Object.entries(MOD_MESSAGES) as [string, Entry][]) for (const g of m.in) out[g].push(key);
  return out as unknown as { readonly [G in ModMessageGroup]: readonly ModMessageKeyIn<G>[] };
})();

/** The parameters a message takes, by name. */
export type ModMessageParams<K extends ModMessageKey> = { readonly [P in (typeof MOD_MESSAGES)[K]["params"][number]]: ModParam };

/** One sentence: its key in `MOD_MESSAGES`, its parameters, its English template and the English text made of them. */
export interface ModMessageOf<K extends ModMessageKey> {
  readonly key: K;
  readonly params: ModMessageParams<K>;
  /** `MOD_MESSAGES[key].text`: the English template, what a catalogue keyed by English text looks up. */
  readonly template: (typeof MOD_MESSAGES)[K]["text"];
  /** The sentence in English. */
  readonly text: string;
}

/** Any message of the list; `key` tells which, and narrows `params`. */
export type ModMessage = { [K in ModMessageKey]: ModMessageOf<K> }[ModMessageKey];

/** A message of the list with its parameters, its English text made. */
export function say<K extends ModMessageKey>(key: K, params: ModMessageParams<K>): ModMessageOf<K> {
  const template = MOD_MESSAGES[key].text;
  const message = { key, params, template, text: "" } as { -readonly [P in keyof ModMessageOf<K>]: ModMessageOf<K>[P] };
  message.text = renderMessage(message as unknown as ModMessage);
  return message;
}

/**
 * A caller's own words for a message: the template (or the key) looked up in its catalogue and filled with `params`,
 * in which a parameter that was a message is already rendered by the same function.
 */
export type Translate = (template: string, params: Readonly<Record<string, string | number>>, message: ModMessage) => string;

/** A message as text: in English, or through `translate`; parameters that are messages are rendered first, the same way. */
export function renderMessage(message: ModMessage, translate?: Translate): string {
  const flat: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(message.params as Record<string, ModParam>)) flat[name] = typeof value === "object" ? renderMessage(value, translate) : value;
  return translate ? translate(message.template, flat, message) : formatMessage(message.template, flat);
}

/* ── The template language, in English ───────────────────────── */

/** `{name}`, `{n, plural, …}` and `{x, select, …}` filled from `params`, in English. A placeholder with no value stays as written. */
export function formatMessage(template: string, params: Readonly<Record<string, string | number>>): string {
  let out = "", i = 0;
  while (i < template.length) {
    const open = template.indexOf("{", i);
    if (open < 0) { out += template.slice(i); break; }
    const close = matchBrace(template, open);
    if (close < 0) { out += template.slice(i); break; }
    out += template.slice(i, open) + placeholder(template.slice(open + 1, close), params);
    i = close + 1;
  }
  return out;
}

function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

function placeholder(inner: string, params: Readonly<Record<string, string | number>>): string {
  const comma = inner.indexOf(",");
  if (comma < 0) { const v = params[inner.trim()]; return v === undefined ? `{${inner}}` : String(v); }
  const name = inner.slice(0, comma).trim(), rest = inner.slice(comma + 1), comma2 = rest.indexOf(",");
  const value = params[name];
  if (comma2 < 0 || value === undefined) return `{${inner}}`;
  const kind = rest.slice(0, comma2).trim(), branches = branchesOf(rest.slice(comma2 + 1));
  if (kind === "plural" && typeof value === "number") {
    const branch = branches.get(`=${value}`) ?? branches.get(value === 1 ? "one" : "other") ?? branches.get("other");
    return branch === undefined ? `{${inner}}` : formatMessage(branch.replace(/#/g, value.toLocaleString("en-US")), params);
  }
  if (kind === "select") {
    const branch = branches.get(String(value)) ?? branches.get("other");
    return branch === undefined ? `{${inner}}` : formatMessage(branch, params);
  }
  return `{${inner}}`;
}

/** `one {# file} other {# files}` as key → branch. */
function branchesOf(options: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < options.length) {
    const open = options.indexOf("{", i);
    if (open < 0) break;
    const close = matchBrace(options, open);
    if (close < 0) break;
    const key = options.slice(i, open).trim();
    if (key) out.set(key, options.slice(open + 1, close));
    i = close + 1;
  }
  return out;
}

/** The parameter names a template uses (its own and those inside its branches), in order of first appearance. */
export function templateParams(template: string): string[] {
  const names: string[] = [];
  const add = (n: string) => { if (n && !names.includes(n)) names.push(n); };
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf("{", i);
    if (open < 0) break;
    const close = matchBrace(template, open);
    if (close < 0) break;
    const inner = template.slice(open + 1, close), comma = inner.indexOf(",");
    if (comma < 0) add(inner.trim());
    else {
      add(inner.slice(0, comma).trim());
      const comma2 = inner.indexOf(",", comma + 1);
      if (comma2 >= 0) for (const branch of branchesOf(inner.slice(comma2 + 1)).values()) for (const n of templateParams(branch)) add(n);
    }
    i = close + 1;
  }
  return names;
}

/* ── Errors ──────────────────────────────────────────────────── */

/** Why something could not be read: its `message` is the English text of `detail`, one of `MOD_MESSAGES`. */
export class ModError extends Error {
  /** The message as data: its key and parameters, for a caller that translates or decides by it. */
  readonly detail: ModMessage;
  /** `options.cause`: the error underneath, where there is one (the archive library's, whose `kind` the reason's key says). */
  constructor(detail: ModMessage, options?: { cause?: unknown }) {
    super(detail.text, options);
    this.name = new.target.name;
    this.detail = detail;
  }
  get key(): ModMessageKey { return this.detail.key; }
}

/** Why a mod cannot be read at all. */
export class ModReadError extends ModError {}
