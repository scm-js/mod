# @scm-js/mod

Read a StarCraft: Brood War mod in JavaScript and TypeScript, the way its loader would
have read it on Windows, without running anything. Given a mod's files (a folder, an
`.mpq`, MPQDraft's or FireGraft's self-executing `.exe`, a `.zip`, its plugins and DLLs),
`readMod` says what the mod is: the archives and folders it lays over the game and at what
priority, its plugins in the order their loader loads them, its FireGraft project, the
files it carries for its code, and the hash two people can compare to know they hold the
same mod.

[![npm](https://img.shields.io/npm/v/@scm-js/mod.svg)](https://www.npmjs.com/package/@scm-js/mod)
[![CI](https://github.com/scm-js/mod/actions/workflows/ci.yml/badge.svg)](https://github.com/scm-js/mod/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@scm-js/mod.svg)](./LICENSE)

The same build runs in Node 20 or later and in the browser, as ESM or CommonJS, with
TypeScript declarations. It is [scmJS](https://scmjs.dev/)'s reader of mods.

## Install

```sh
npm install @scm-js/mod
```

## Use

In Node, `@scm-js/mod/node` reads a mod from the disk: a folder, or one file (an exe is read
with the DLLs beside it, which Windows would load with it).

```ts
import { readModAt } from "@scm-js/mod/node";

const { description: mod } = await readModAt("Mods/My Mod");

console.log(mod.name, mod.identity.hash);
for (const layer of mod.layers) console.log(layer.kind, layer.path, layer.priority, `${layer.files.length} files`);
for (const m of mod.modules.filter((m) => m.load)) console.log(m.order, m.name);
```

In a browser, give `readMod` the files as a `ModFiles`: a name, a list of paths and sizes,
and a way to read one. For files picked with `<input type="file" webkitdirectory>`:

```ts
import { readMod, type ModFiles } from "@scm-js/mod";

function pickedFiles(files: File[]): ModFiles {
  const byPath = new Map(files.map((f) => [f.webkitRelativePath || f.name, f]));
  return {
    name: (files[0]?.webkitRelativePath || "mod").split("/")[0],
    list: async () => [...byPath].map(([path, f]) => ({ path, size: f.size })),
    read: async (path) => new Uint8Array(await byPath.get(path)!.arrayBuffer()),
  };
}

const input = document.querySelector<HTMLInputElement>("input[webkitdirectory]")!;
const mod = await readMod(pickedFiles([...input.files!]));
```

Paths use forward slashes, and a folder's files start with the folder's own name. When the
person gave one file rather than a folder, set `named` to its path. `filesOf(name, files)`
makes a `ModFiles` of bytes held in memory, and `zipFiles(name, bytes)` of a zip.

The description's `name`, where no `mod.json` names the mod, is the `ModFiles`'s `name` as the
adapter gives it. `diskFiles` and `zipFiles` take a container's extension off (`Made.exe` is
`Made`); `filesOf` and an adapter of your own keep what they are given, so one file given by
its file name keeps its extension (`Made.exe`). Callers that show names side by side should
make them the same way.

A mod that cannot be read at all (a damaged archive, a patcher exe in a form not known, a
program with no archive in it, a plugin, project or `mod.json` that cannot be read) makes
`readMod` reject with a `ModReadError`, and only with one: an error underneath it (the archive
library's, a zip's, the tree's own) is its `cause`. Anything less is said in the description
and the rest is read. An error your own `progress` or `onFile` throws passes through as it is.

## What a mod can be

- **A folder** in the game's paths (`arr/units.dat`, `unit/…`), at its top or a folder or
  two down, with `plugins/` and FireGraft's files beside it, and any archives in it.
- **An `.mpq`**, as MPQDraft's patcher lays one; an archive named as one of the game's own
  (`patch_rt.mpq`) stands in for it, at that archive's priority.
- **FireGraft's patcher exe**: the program, the plugins in its overlay, its archive (whose
  tables may lie before its header).
- **MPQDraft's self-executing MPQ**: the stub, its embedded file system (MPQDraft's patcher
  DLL, the plugins, their data files), the archive.
- **Any other exe** with an archive where storm would find one.
- **A plugin that loads plugins** (a release with `plugins/` and a folder it packs into an
  archive of its own), told from the plugin's bytes, not its name.
- **A zip** of any of these (stored and deflated members; not zip64, not encrypted).

A copy of the game in what was given (a folder holding `StarDat.mpq`) is not the mod: its
archives and its `Maps` folder are left out and said.

## The description

| | |
| --- | --- |
| `name`, `link`, `races` | From the mod's `mod.json`, else the one program at its top that holds it, else what was given |
| `game` | `"1.16.1"`, or `"remastered"` when its files are Remastered's own (`anim\`, `hd2\`, `sd\`, `.dds`) |
| `loaders` | What the mod's shape implies, outermost first: `firegraft-patcher`, `mpqdraft-sempq`, `self-executing`, `mpqdraft`, `replacement`, `plugin-loader`, `folder` |
| `layers` | Each archive and folder with storm's priority (FireGraft 0xFFFF00 + i, a plugin loader's folder 500000, MPQDraft 10000 + i, the game's own archives 7000 to 1000), lowest first: lay them in order and the later wins |
| `files` | The game files after laying, each from the layer that wins it |
| `modules` | Every plugin and DLL with its role (`plugin`, `plugin-loader`, `patcher`, `library`, `provider`), the interface its loader enters it by (from its exports), its source (a file, or carried in an exe), its SHA-256, and its place in the loader's order or why it is not loaded |
| `patches` | The FireGraft project and its database (the one for 1.16.1 where there are several), and the moment FireGraft writes it: the game's first open of `font\font8.fnt` |
| `carried` | Files the mod ships for its code: a plugin's data files, a plugin inside an archive (which no loader loads) |
| `identity` | The hash and its lines (below) |
| `left` | Every other file given, with why it is not the mod's: a tool's folder, an operating system's file, a read-me beside the game's folders, a program with no archive, … |
| `said`, `unreadable`, `gameCopy`, `duplicates` | What a person should be told, as messages; names an archive lists and does not hold; a copy of the game left out; two files for one game path |
| `systemFiles` | An operating system's files (`desktop.ini`, `Thumbs.db`, …) where a file of the mod's would be, loose or in its archives: not the mod's, and counted only by the hash's older rule |

`descriptionText(mod)` prints all of it in plain lines. `fileReaders`, `moduleBytes`,
`openLayer` and `firegraftFilesOf` read a file, a module or the FireGraft project back out of
the same `ModFiles`.

An archive's list may name a member twice (in another case, or with the other slash): storm
finds one file for both, so the layer lists it once, by the last spelling, the one `files`
takes.

### Reading the files again

`fileReaders(tree, mod)` gives a reader of each game file. It lists the tree once (not at all
when `readMod` read the same tree object), opens each archive once and reads each zip once,
and keeps them until you call its `close()`. To keep the
archives `readMod` opened instead of opening them a second time, give both the same map:

```ts
const archives = new Map();
const mod = await readMod(tree, { archives });
const read = fileReaders(tree, mod, { archives });
const units = await read(mod.files.find((f) => f.name === "arr\\units.dat")!)();
read.close(); // or archives.clear(): lets go of every archive
```

`openLayer`, `firegraftBytes` and `firegraftFilesOf` take the same `{ archives }`. An archive
`readMod` does not lay (a plugin loader's packing, laid by its folder) is not put in the map,
and `readMod` lets go of it before it hashes the files.

`readPath` lists the tree once too, and lists it again only for a path it does not hold, in
case the tree has grown since.

## The mod's identity

The hash is the first sixteen hex digits of SHA-256 over lines `name<TAB>sha256 of the
bytes`, sorted by name: a line for each game file the mod lays (by the game's name, lower
case with backslashes), one for its FireGraft project, and one for each module of its code
(`plugins\<file name>`). Nothing of anyone's copy of the game is in it, so two people with
different copies name the same mod alike. `hashLines` is the rule on its own.

- **`withoutPlugins`** is the hash of the same lines without the modules': what a game that
  runs none of the mod's code presents. `runningHash` gives the hash for a game that runs
  only some of it. Two games running different code never present the same hash.
- **`beforeCode`** is the hash by the rule before 2026-11-11, wherever it is neither `hash`
  nor `withoutPlugins`, whatever the reason it differs. Then only plugins given as files had
  a line (a plugin a patcher exe carries in itself and a DLL its plugins load did not), and a
  FireGraft project found only through FireGraft's own list, in an archive without a list of
  its files, had none. It names the same mod with all of its code. A mod whose only change
  under the new rule was a patcher's own plugins went by its `withoutPlugins` then, which is
  why `beforeCode` is absent for it.
- **`older`**: until 2026-11-09 the files an operating system leaves in folders
  (`desktop.ini`, `Thumbs.db`, `.DS_Store`, a zip's `__MACOSX/`) had lines. Where the mod
  holds such files, `older` is its hash and its hash without plugins by that rule, and
  `older.files` names them (loose, or packed in the mod's archive). They have no line now,
  because not every way of handing a folder over hands them over.
- **`declared`**: the hash a `mod.json` says, written by a tool that laid the mod out.

A replay tagged, or a mod kept, before those dates answers to `beforeCode` or `older`; match
against them, never present them.

- **`earlier`** lists every hash an earlier rule of this reader, or of the readers before it,
  gave the same files, each as `{ rule, hash, withoutPlugins? }`: `before-code` (the rule
  before 2026-11-11, with the form without plugins), `before-unlisted-project` (every module
  had a line, a FireGraft project found only through FireGraft's list had none; only where
  there is such a project), `older` (with an operating system's files), `game-files` (the game
  files alone, before code and projects had lines), `game-files-older` (the same with an
  operating system's files) and `without-stock-names` (an archive without a list read
  without the names 1.16.1's own tables give, as every reader but the play page read it
  before 1.2.0; only where those names find a file). Each earlier rule's form over those
  fewer files is there too, marked `withoutStockNames`, where it is a hash not already listed.
  A caller that recognises a replay tagged by an earlier rule compares the tag with `hash`,
  `withoutPlugins` and every hash of `earlier`, and works out nothing itself. One may equal
  the current hash.
- **`older.lines`** are the lines of the operating system's files the older rule counted, for
  a caller that makes a form of its own by that rule (a hash of the files that differ from the
  person's game, with those lines).

The line of each kind is exported: `gameFileLine(name, sha256)` for a game file (and an
operating system's file by the older rule), `pluginLine` for every module of the code (a
plugin, a plugin that loads plugins, a library), `firegraftLine` for the project.

### After an edit

`identityWith(identity, changes)` gives the hashes of the mod with some members changed,
from the new SHA-256 of each and nothing else read: `changes.files` maps game files (by game
name or path) and FireGraft projects (by file name) to their new digest, or `null` for one
removed; `changes.plugins` does the same for modules by file name. It gives `lines`, `plugins`,
`hash` and `withoutPlugins`, equal to what `readMod` gives the edited files; the earlier rules'
hashes are not worked out again.

### Naming a mod later

`readMod(tree, { hashFiles: false })` describes a mod without reading its files for the hash,
so a large mod can be shown at once. Those options are `UnhashedReadOptions`, and the result an
`UnhashedDescription`. A `ReadOptions` value never turns hashing off, so code that passes its
`ReadOptions` on gets a `ModDescription`, as it did with 1.0.0. A caller that decides at run
time passes `HashChoiceReadOptions` (`hashFiles` a boolean) and gets either description,
telling them apart by `"hash" in d.identity`. Its `identity` then holds only `plugins`, `code`,
`readsStartupData` and `declared`. `modIdentity(tree, description)` works out the rest later
from the same files, and gives what a plain `readMod` gives. Two things are still read and
hashed when hashing is off: each module (its role and interface are told from its bytes, and a
plugin carried twice is told by its digest, so `Module.sha256` is there) and `mod.json`. Two
fields are less complete: `unreadable` and the `unheld` message name only what an archive lists
and does not hold, since a file whose bytes cannot be read is found only when it is read.
`modIdentity` leaves such a file out of the lines, as `readMod` does, but does not add it to
the description.

### An archive without a list of its files

Storm finds a member by its name's hash, so an archive with no list can only be asked for
names the reader already has. The reader looks for the names the game reads by name, the names
the archive's own image, sound and portrait tables give, and the names 1.16.1's own three
tables give. The package carries those last ones as names only (2,238 of them, made from the
unmodified game's tables by a script in its repository), so every reader finds the same files
in the same archive, whoever reads it and whatever game they have. A caller needs to do
nothing for this.

`ReadOptions.tables` is deprecated and no longer asked: until 1.1, a caller could pass the
person's own copy of the game's tables, and then found more files in such an archive than a
caller that passed none. The form a reader that passed none gave is in `identity.earlier`
(`without-stock-names`), for matching only.

## Words

Every sentence the package can produce is in `MOD_MESSAGES`, with its key, its English text
and its parameters named. Errors, progress, the reasons a module is not loaded and the lines
of `descriptionText` are all `ModMessage`s: `key`, `params`, the English `template` and
`text`. A parameter may itself be a message (the reason inside an error). To show them in
another language, look the template or key up in your own catalogue:

```ts
import { renderMessage } from "@scm-js/mod";

const text = renderMessage(message, (template, params) => myTranslate(template, params));
```

The templates use `{name}`, `{n, plural, one {…} other {…}}` and `{x, select, …}`. A caller
that needs a fact reads `params`, never the sentence.

The keys and their parameters' names are stable: changing or removing one is a major
version. The English text may change in a minor version, so a catalogue keyed by `key`
keeps working; one keyed by the English template shows a changed sentence in English until
it is translated again.

`MOD_MESSAGE_GROUPS` lists the keys by where they are shown, for a caller that translates only
some of them: `error` (the `detail` of a `ModReadError`), `reason` (a reason inside one, and
the `detail` of a `PatcherError` or `ZipError`), `progress` (what `ReadOptions.progress`
hears), `said` (`ModDescription.said`), `loader`, `named`, `entry`, `why` and `description`.
Each message says its own groups in `MOD_MESSAGES` (`in`), and `ModMessageKeyIn<"progress">`
is the type of a group's keys. To show every error with its reason, translate `error` and
`reason`.

When the archive library cannot open an archive, `archive-unopenable` and
`exe-archive-unopenable` give its English text as `why`, as 1.0.0 did, and the same reason as a
message beside it, `reason`, keyed by the library's kind of error (`mpq-damaged`,
`mpq-no-header`, `mpq-version`, `mpq-compression`, `mpq-io`, `mpq-file-missing`, else
`mpq-other`) with that text as its `detail`. The English sentence shows `why` and reads as it
always has. A caller that translates renders `reason` where it is present (its catalogue's
template may use `{reason}` in place of `{why}`: the reason arrives translated by the same
function) and falls back to `why`. The library's error is the `ModReadError`'s `cause`. A
message's parameters that its English text does not show are its `hidden` in `MOD_MESSAGES`.

## The parts on their own

The main surface is `readMod`, the description and its identity. The rest is the pieces
`readMod` is made of, exported so that no program that reads mods keeps a copy of them.

### Readers and rules

- `exeArchive`, `archiveInFile`: the archive and the carried plugins in a self-executing exe.
- `programEnd`, `libraryName`, `exportsOf`, `importsOf`, `moduleFacts`: a Windows image read
  from its bytes, and the interface a loader would enter it by.
- `readZip`, `zipFiles`: a zip's members.
- `probeNames`: the names an archive with no list of its files is found to hold, from the
  names the game reads, the archive's own tables and 1.16.1's own tables.
- `gameName`: a path as the game names it (lower case, backslashes). A leading backslash is
  kept: storm finds a member by its name as stored, so `\arr\units.dat` and `arr\units.dat`
  are two members.
- `leafOf`, `folderOf`: the last part of a path (either slash) and the folder it is in
  (forward slashes), as the reader takes them apart.
- `kindOf`, `tableShape`, `gameOf`: a file's kind, a table's layout (the game's own,
  DatExtend's expanded, GPTP's `.datex`) and its entries, the game a mod is for.
- `readModJson`, `isModJsonPath`: which `mod.json` is the mod's, and what of it is read.
- `normalizeRaces`, `raceCandidates`: races a mod declares, and the hints its files give.
- `GAME_FOLDERS`, `GAME_ARCHIVES`, `GAME_ARCHIVE_PRIORITY`, `gameFileNames`, `STARTUP_NAMES`,
  `DAT_TABLES`, `RACE_FILES`: the game's own names.

### For a program that plays a mod

- `planPlugins`, `plugInOrder`: plugins held by name and bytes put in their loader's order,
  with some turned off.
- `runningHash`: the hash of a game that runs only some of the mod's code.
- `inGamePaths`: whether files handed over are already in the game's paths (read them with
  `layout: "game"`). In that layout a module's role and order are told from its path alone:
  a `.qdp` or `.bwl` anywhere is a plugin, loaded by name, and a `.dll` under `plugins/` is a
  library. A plugin a patcher exe carried, handed over as `plugins/qdp.dll`, is then a library
  (its line in the hash is the same), and the patcher's own order of its plugins is not
  kept.
- `namesToProbe`: the names `probeNames` looks for, before asking an archive.
- `ENTRY_WORDS`: the interface a module is entered by, as a message.
- `patcherPluginWords`: one of `named.patcherPlugins` as a message, for a short list of the
  plugins a mod carries.
- `holdsString`: whether a module holds a name as a string of its own (how a plugin that
  loads plugins, and the archive it packs, are told).

## What it does not do

It runs nothing: no exe, plugin or DLL is executed, only read. It holds no game data: no
file of StarCraft is in the package, and it never compares a mod with anyone's copy of the
game (`ReadOptions.onFile` hands each file's bytes to a caller that wants to). It does not
decode the game's tables, pictures or sounds, and it does not write mods. Laying the files
and loading the plugins in the order described is the program that plays the mod.

It needs Node 20 or later, or a current browser: it uses the platform's Web Crypto
(`crypto.subtle`) and `DecompressionStream`. A browser gives Web Crypto only to a page in a secure
context (served over https, or from `localhost`): elsewhere `readMod` cannot hash.

## Licence

MIT
