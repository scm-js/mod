# Adopting @scm-js/mod in scmJS

The editor's repository ([scm-js/scm-js](https://github.com/scm-js/scm-js)) reads mods with
copies of its own:

- **core**: `src/formats/mod/` (`sources.ts`, `hash.ts`, `races.ts`, `folder.ts`, `data.ts`,
  `diff.ts`, `check.ts`), published in `@scm-js/core`;
- **the command line**: `cli/src/mod/` (`scmjs mod`: `source.ts` opens a mod, `info.ts`,
  `hash.ts`, `overlay.ts`, `pack.ts`, `unpack.ts`, `diff.ts`, `check.ts`, `header.ts`, `play.ts`,
  `new.ts`, `target.ts`, `open.ts`);
- **the editor's installer**: `src/gamedata/install.ts`, `archives.ts`, `overCopy.ts` (a data set
  made of the game and a mod).

This file lists what those copies compute, whether `readMod` gives it, and for what it does
not give, whether it belongs here (a fact about a mod's files) or stays with the caller
(presentation, the command line's verbs, translation, decoding the game's data). Where the
copies and this package disagreed, it says which rule was kept and why. The aim is that the
copies are deleted, not kept beside the package.

## What each copy computes

"Gives" means the description or an export holds it as it is; "another name" means it holds
it in another shape (the shape is given); "added" means the package did not have it and has
it now; "caller" means it stays where it is.

| What | Where today | In the package | Notes |
| --- | --- | --- | --- |
| Opening what was given: a folder, an `.mpq`, an exe, a zip, nested zips | `source.ts#openModSource`, `fromPieces`; installer `splitPickedFiles` | gives: `readMod(files)` with a `ModFiles`; `@scm-js/mod/node`'s `diskFiles` / `readModAt` for a disk | A named file without a container's extension is now told by its first bytes (zip, MPQ, program), as `openModSource` did. The CLI's refusals of other kinds (a replay, a map, a bot) stay in the CLI. |
| The exe and zip readers | `sources.ts` (`exeArchive`, `programEnd`, `libraryName`, `isMpq`, `isZip`, `isExe`, `readZip`, `ModSourceError`, `PatcherError`) | gives, same names | `ExeArchive.kind` (`"sempq" \| "firegraft"`) is `form` here: `"firegraft-patcher"`, `"mpqdraft-sempq"` (MPQDraft's embedded file system, read from its source's layout) or `"archive-after-program"`. Core called every exe without FireGraft's overlay "sempq". `PatcherError.what` is `PatcherError.detail` (a message: key and parameters). |
| Files and sizes by kind | `info.ts#kindOf`, `MOD_KINDS`, `ModInfo.kinds` | added: `kindOf`, `MOD_KINDS`, `kindTotals(d.files)` | The CLI's rule (see the disagreements). The words for each kind ("3 tables") stay in the CLI. |
| Tables, and which are wider than the game's | `info.ts` (`datShape`, `ModTableInfo`, `extended`) | added: `tableShape(name, size)`, `DAT_SHAPES`, `datTableOf` | Layout (`dat`, `expanded`, `datex`), entries, the game's count, `legacy`, `extended`: the same answers as core's `datShape`, from a table of the game's sizes (no decoding). The `how` sentence stays in the CLI. |
| Scripts | `info.ts#ModInfo.scripts`; `check.ts#iscriptMembers` | another name: `d.files` where `kindOf` is `"scripts"` or `"AI"` | Which iscript to decode is the caller's. |
| Plugins, with their paths | `ModSource.plugins`, `ModInfo.plugins` | another name: `d.modules` (`source: { kind: "file", path }`), and `d.carried` for a plugin inside an archive (`source: { kind: "member", archive, member }`) | Each module has its role, interface, SHA-256 and place in the loader's order, which no copy had. A second plugin of the same file name is in `d.left` (`same-name`); the CLI listed both. |
| FireGraft files, with their paths | `ModSource.firegraft`, `ModInfo.firegraft` | gives: `d.patches[0].files` (`path`, or `archive` and `member`), with the project and database picked | `firegraftFilesOf` reads them back. |
| Exes and their patcher plugins | `ModSource.exes` (`file`, `kind`, `at`, plugins' `id`, `at`, `size`, `name`) | another name: `d.loaders`, the archive layer's `at`, `d.modules` with `source.kind === "carried"` (`exe`, `form`, `index`, `at`, `size`), `d.named.patcherPlugins` | The CLI's line for a plugin's id as four letters stays in the CLI. |
| Libraries beside an exe | `ModSource.beside` | gives: `d.modules` with role `library` | The same rule: DLLs in the folder of a program that holds the mod (for a named exe, its folder's). They now have lines in the hash (below). |
| Maps | `ModInfo.maps` | another name: `d.files` where `kindOf` is `"maps"` | |
| The game a mod is for | `info.ts` (`manifest.base`, else Remastered's folders) | added: `d.game` from the files, `d.manifest.base` from `mod.json` | The phrase "StarCraft: Remastered (its own pictures; samase)" stays in the CLI. |
| Races | `ModSource.races`; installer `pickedFolderRaces`; core `races.ts` | gives: `d.races` (`mod.json`), `normalizeRaces`, `saidRaces`; added: `raceCandidates` | `raceLabel`, `raceChoices`, `GAME_RACE_NAMES` (translated labels) and `racePlaysAs` (decodes units.dat) stay in the editor. |
| Duplicates | `ModSource.duplicates`; `check.ts` `duplicate-file` | added: `d.duplicates` (`name`, `paths`), and a `duplicate` message in `d.said` | Same rule: loose files of the mod's folder for one game name; the last is laid. |
| What was left out | `ModSource.left` | added: `d.left`, each with its reason (`dot-folder`, `system`, `game-copy`, `too-deep`, `program`, `library`, `same-name`, `outside`, `beside`) | `left` held paths only; the CLI's sentence ("Not the game's, left out: …") stays in the CLI. |
| A copy of the game in what was given | `ModSource.gameCopy`, `gameCopyFolders`, `gameCopyWords` | gives: `d.gameCopy`, `gameCopyFolders`, and the `game-copy` message (`folder`, `list`, `more`) in `d.said` | `gameCopyWords` is the message; translate it by key. "A copy of the game and nothing else" is the `copy-only` message, not an error. |
| Archives read without a list, and names listed but not held | `ModSource.probed`, `ModSource.unheld` | another name: `layer.probed`; `d.unreadable` (names an archive lists and does not hold, and names that could not be read) | |
| The hash, without plugins, older | `hash.ts` (`modHashOfDigests`, `ModHash`); `cli/src/mod/hash.ts#sourceHash`; installer `dataSetHashOf` | gives: `d.identity` (`hash`, `withoutPlugins`, `lines`, `plugins`, `older`, `beforeCode`, `declared`; since 1.1.0 `earlier` and `older.lines`) | By the rule of 2026-11-11 (below). `older.left` (the system files' names) is `d.identity.older.files`: the game names of the files whose lines the older hash had, loose ones and members of the mod's archives alike (Burning Ground's exe: `glue\battle.net\backgrounds\thumbs.db`). `d.left` lists paths of the tree only, so an archive's member is never in it. |
| The hash of game files alone; the hash of the files that differ from the person's game | `sourceHash#gameFilesOnly`; `replaymod.ts#sourceHashes` (`changed`) | added (1.1.0): the game files alone are `d.identity.earlier` (`game-files`, and `game-files-older` with an operating system's files); caller: the files that differ | The second needs the person's game: made from `d.identity.lines` (and `d.identity.older.lines` for its older form), with `ReadOptions.onFile` handing each file's bytes to compare with a copy of the game. Matching a replay's tag is the CLI's. |
| `mod.json` beside a mod | `source.ts` (`name`, `races`), `header.ts#linkOf`, `overlay.ts` (`link`, `url`), installer `pickedFolderRaces` | added: `readModJson`, `isModJsonPath`, `d.manifest` (`path`, `base`, `format`), with `d.name`, `d.link`, `d.races`, `d.identity.declared` | One rule for which file and what of it (below). |
| The mod folder's manifest (the text form `mod unpack` writes) | `folder.ts` (`ModManifest`, `readManifest`, `tidyManifest`, `MOD_FORMAT`) | caller | It is the pack and unpack format, not a fact about a mod's files. The package recognises one (`format`, and the `text-folder` message) so a reader knows to pack it first. |
| Pack and unpack | `pack.ts`, `unpack.ts`, `folder.ts` (`renderMember`, `packFile`, …) | caller | Verbs, and they need the editor's codecs for tables, strings, scripts, pictures. |
| Diff and check | `diff.ts`, `check.ts`, `data.ts` | caller | They decode the game's data. `duplicate-file` comes from `d.duplicates`. |
| The startup data read again | `overlay.ts#readsStartupData`, `STARTUP_NAMES` | gives: `readsStartupData`, `STARTUP_NAMES`, `d.identity.readsStartupData` | The rule differs (below). |
| A replay's tag, the runner's folder | `overlay.ts#modTag`, `writeCode` | caller | They should take the code from `d.modules` and `d.identity.plugins` (every module with a line), not from plugin files alone, or a tag will name another hash than the mod's. |
| The game's own archives in a pick | installer `isGameArchive`, `sortArchives`, `pickArchives`, `isStarEditDownload` | caller | Facts about the game, not a mod. `GAME_ARCHIVES` and `GAME_ARCHIVE_PRIORITY` give the game's order. |
| Which loose files the extraction reads | installer `isMemberPath`, `MEMBER_PREFIXES` | caller | The extraction's need, not a mod's shape. `isGamePath` is replaced by the description's `files`. |
| Names, paths, system files | `sources.ts` (`GAME_FOLDERS`, `gameName`, `SYSTEM_FILES`, `isSystemFile`, `modRoot`, `gameCopyFiles`, `GAME_ARCHIVES`), `hash.ts#probeNames` | gives, same names | Rules below where they differ. |
| Errors and their words | `ModSourceError`, `PatcherError`, `CliError` texts, `t(...)` | gives: `ModError` and its subclasses, each with `detail` (a `ModMessage`); `MOD_MESSAGES` | Translate by `detail.key` or `detail.template`; the templates use the editor's own `{n, plural, …}` and `{x, select, …}` syntax. |

## Where the copies disagreed, and the rule kept

1. **Which folders are the game's** (`GAME_FOLDERS`). scm-sim had the game's 24; core had 28
   (the same and `datreq`, `samase`, `lua`, `config`); the installer reads loose files under any
   of six prefixes, skipping up to three leading folders. **Kept: the 24.** The four extra are
   folders that particular plugins read, not the game; a rule that decides by what one mod's
   plugins ask for is a rule for that mod. Nothing is lost: a folder under the root the game's
   paths start in is laid whatever its name (`lua/…` under a root holding `arr/` is laid), and a
   folder of a plugin's own files beside `plugins/` is laid under the given folder's own root.
   No pinned hash moves.
2. **Dot folders.** The CLI never walked into one; the play page and the runners hashed
   `.git/…`; the installer has no rule. **Kept: the CLI's**: a folder whose name starts with a
   dot is a tool's, at any depth, and its files are in `d.left` (`dot-folder`). A file whose own
   name starts with a dot (`lua/.gitignore`) is still the mod's.
3. **Archives inside a folder.** The runners' folder layer skipped `.mpq` and `.exe` at the top
   and knew no zip; the page and the CLI opened every `.mpq`, exe with an archive and zip. The
   installer takes every `.mpq` and `.exe` as an archive, and always takes `patch_rt.mpq` for the
   game's own. **Kept: open them all**, at storm's priority for their loader. An archive named as
   one of the game's own is a replacement of it (at that archive's priority) unless it lies in a
   copy of the game (a folder holding `StarDat.mpq`), so a mod shipped as `patch_rt.mpq` is the
   mod's. The installer's data set hash left such a mod's files out.
4. **`mod.json`: where and what.** The runners read one at the top only, the page the shallowest
   anywhere, the CLI one in the named folder or one folder down, the installer one in the picked
   folder only; `homepage` was read by `header.ts` alone, `races: []` was dropped by core.
   **Kept: the CLI's depth** (in the folder given or one folder down, never in one of the game's
   folders, the shallowest winning): deeper ones are a library's or a tool's own. A zip named
   alone counts as the folder given. **The fields are the union**: `name` (trimmed, at most 80
   characters, the page's limit), `link` from `link`, `url` or `homepage` (http and https
   only), `races` (an empty table declares none; absent says nothing, as the page keeps it),
   `hash` and `withoutPlugins` (`declared`), `base` (the CLI's), and `scmjs` (the text form's
   format). A `mod.json` under a game folder is a file of the mod, hashed, and not read as this.
5. **The mod's name.** The page did not name a release after its exe; the CLI named a folder
   after the one exe with an archive anywhere in it. **Kept: `mod.json`'s name, else the one
   program at the top of the folder given that holds the mod, else the name of what was given.**
   An exe deeper in the folder is a tool's, not the release's launcher.
6. **Names looked for in an archive without a list.** The page's prober also read the
   person's own copy of the game's tables; core's did not; the runners looked for none. **Kept:
   one prober** (`probeNames(archive, tables?)`): the game's names and those the archive's own
   tables name, and the person's tables only where the caller passes them. Without them it is
   core's list exactly.
7. **The startup data.** The engine's rule: one of `STARTUP_NAMES`, a picture or overlay under
   `unit\`, or an archive in which nothing could be found by name. The CLI said yes for any file
   under `unit\` and for a mod with no game files at all. **Kept: the engine's**, since it is the
   engine that reads the data again; a mod that is only plugins changes no startup data.
8. **A file's kind.** The page's `kindOf` called every non-string file under `arr\` a table and
   knew no `portrait\` folder; the CLI's did. **Kept: the CLI's** (`arr\weapons.txt` is "other",
   `portrait\…` is "pictures", any `.lo?` overlay a picture).
9. **Races.** The page took a `letter` only in lower case; the editor lower-cased one in either
   case. The page kept `races: []` as "declares none"; core dropped it. **Kept: the editor's
   letter rule and the page's `[]`** (a person writing `"A"` means the letter a; and a mod that
   says it declares none must reach a page that kept an older table). At most 248 rows, the
   page's limit.
10. **The hash.** Core, the CLI and the installer gave a line to plugins carried as files only,
    and none to a FireGraft project found only through FireGraft's own `datalist.txt` in an
    archive without a list of its files. **Kept: the rule of 2026-11-11**: every module of the
    mod's code has a line (a patcher exe's own plugins, and DLLs its plugins load), and so has
    every FireGraft project however it is found (it changes the game either way), so two people
    whose code differs never hold the "same" mod. `beforeCode` is the hash by the earlier rule,
    whatever the reason it differs. The hash moves for mods with such code; the hash it had is
    `beforeCode`, or `withoutPlugins` where its only code was a patcher's own plugins (which no
    copy hashed). For the mods in hand: Burning Ground's exe c76bfa18e9fc4fb5 (was
    0ed055cf80a95bd0, now its `withoutPlugins`; its folder now the same, see 13); Cosmonarchy's
    release c94acdf31982fa4b (was 20e1c6d89ae2af75, now its `beforeCode`); TriFresh
    ea488d3ac3575bda unchanged; SC Revolution's exe, whose archive has no list and whose project
    is found through FireGraft's, d9e4e6ff76c7e71d, without plugins bb3f273690cf8d8d, and
    90b8c22d9cb4ba31 (the value the readers on unreleased branches gave it; no released tool
    could open its archive) is its `beforeCode`.
11. **A game name with a leading backslash.** Core's `gameName` stripped it; the reader keeps
    it. **Kept: the reader's**: storm finds a member by its name as stored, and stripping would
    take two different members for one.
12. **A zip named alone.** The CLI laid its members at the root; the reader lays them under the
    zip's name (`Pack/…`). The game names are the same (the root is found the same way); only
    the paths in the description differ.
13. **Where a folder's game paths start.** All three copies chose the root among the loose
    files by the game's folders (`modRoot`); with none found, the page and the reader fell back
    on the folder all paths shared, counting among the paths the plugin and project members of
    the mod's archives. Those have no folder, so a folder holding a patcher exe and a read-me
    had no shared folder, its root became the top of the tree, and the read-me was laid as a
    game file (`unpacked\bg_readme.txt` in Burning Ground's folder). **Kept: the game's folders
    decide**: the root is where the loose files' game folders are, and with none, the folder
    everything given is in. A read-me, a licence or a DLL beside a mod's exe is never a game
    file, so a patcher mod given as a folder has its exe's own hash. This moves only hashes of
    patcher mods given as a folder: Burning Ground's folder was 14fbf76b99ba5015 (without plugins
    f9dc2cc001d39685, older 2c44748b00f8128d) and is now its exe's c76bfa18e9fc4fb5
    (0ed055cf80a95bd0, older 45f548e49bd6a097); TriFresh's folder was ebc12de417f24900 and is now
    its exe's ea488d3ac3575bda. A folder of no files is a layer only where a plugin that loads
    plugins lays it.

## Known and kept

- An archive without a list is probed for the game's names; FireGraft's own lists
  (`firegraft\datalist.txt` and the rest) are read to find the project but are not looked for
  as game files, so the same mod packed with a list has one more file line (the datalist) than
  without.
- A plugin loader's own packing of its folder (an archive the loader names in its bytes) is told
  by that, not by its name; without the folder it is laid where the loader opens it.
- **A plugin loader's packing laid by its folder is read whole** (Cosmonarchy's `temp.mpq`,
  977 MB). Whether its layer is dropped is decided from what is known without its contents (the
  loader's bytes name it, it replaces none of the game's archives, the folder has files), so
  the decision could be made before it is read. Leaving it unread could still move a hash:
  everything else an archive gives is read from its contents, and so from this one too. That
  means a FireGraft project in it whose file name the folder has not (its line, and the
  database picked), an operating system's file in it that the folder has not (`older`), a
  plugin inside it (`named`, `carried`), names it lists and does not hold (`unreadable`), and
  the error a damaged one raises. A packing made before the folder last changed can hold any
  of these. Since 1.1.0 the reader lets go of it before it hashes the files, having read what
  the hash takes from it, and `diskFiles` no longer copies a file it reads. Reading the
  Cosmonarchy release in Node peaked at 2,162,592 KB resident and now peaks at 1,185,508 KB;
  after a full collection while the files are hashed, 1,084 MB stayed resident then and 164 MB
  now.
- **`ReadOptions.tables`.** The play page passes the person's tables; the editor, the command
  line and Aftermath pass none. An archive without a list can be found to hold more files with
  them, and then has another hash. SC Revolution, the one such mod in hand, has the same hash
  either way. To agree with the others, pass none.
- **One file given by name** is named `ModFiles.name`: `diskFiles` takes `.exe`, `.mpq` or
  `.zip` off it, `filesOf` and a page's own adapter keep what they are given (`Made.exe`).
- **`gameName` keeps a leading backslash** (11 above).
- **`layout: "game"`** tells a module's role and order from its path alone (the README says
  how): a plugin a patcher carried, handed over as `plugins/qdp.dll`, is a library there, and
  the patcher's own order of its plugins is not kept.
- **The reason an archive could not be opened.** The archive library's errors carry a stable
  kind (`MpqError.kind`), so since 1.1.0 `archive-unopenable` and `exe-archive-unopenable`
  carry a new parameter, `reason`: a message keyed by that kind (`mpq-damaged`, …) with the
  library's English text as `detail`. `why` stays that text, as in 1.0.0, and the English
  sentence shows it and reads word for word as before. A caller that translates renders
  `reason` where it is present and falls back to `why`.
- **`readMod` rejects only with a `ModReadError`** since 1.1.0. 1.0.0 also let through the
  archive library's `TypeError` for an archive whose hash table has no entries (now
  `archive-unopenable`), a zip member (a plugin, a project, `mod.json`) that could not be
  inflated (now `zip-unreadable`, with the new reason `zip-member-inflate`), the library's
  error for a project its archive could not give (now `firegraft-unreadable`), and an error of
  the tree's own `read` (now the new `file-unreadable`). The error underneath is the `cause`.

## What the last two adopters found (1.1.0)

Aftermath (a replay matched to a picked folder) and the Mod Editor (a mod edited and named
as it is edited) adopted 1.0.0 after the editor, the command line and scm-sim. What they
lacked, and the code of theirs, and of the first adopters, that each addition replaces:

| What | Replaces | In the package |
| --- | --- | --- |
| Every earlier hash, for matching | Aftermath `modreplay.ts`: `systemLines`, and in `folderHashes` the `older` list (`beforeCode`, the form without the unlisted project's line, `older`, the game files with the system lines) and `all`; the CLI's `cli/src/mod/hash.ts`: `systemLines`, `gameFilesOnly`, `gameFilesOnlyWere` | `d.identity.earlier` (`{ rule, hash, withoutPlugins? }`), `d.identity.older.lines`. The form of the files that differ from the person's game (`changed`, and its older form) stays with the caller, made from `lines` and `older.lines`. scm-sim's page can keep `earlier` in its manifest beside `older` and `beforeCode` and match it in `isMod`. |
| The hash after an edit | the Mod Editor's `session.ts#hash` (a game file's line written by hand, then `runningHash` over every plugin) | `identityWith(identity, { files, plugins })`, `gameFileLine` |
| Showing a large mod at once, naming it later | | `readMod(tree, { hashFiles: false })` (`UnhashedReadOptions`; `HashChoiceReadOptions` for a choice made at run time), `modIdentity`. A `ReadOptions` value always gives a `ModDescription` (1.1.1; in 1.1.0 it did not, and scm-sim's `readMods` stopped type-checking) |
| Reading the files again | the Mod Editor's `source.ts` (its comment: each plugin inside an archive opens the archive again, beside the files' reader's own copy), Aftermath's `modFolder` | `fileReaders` lists the tree once (Cosmonarchy's release: 7,761 listings and 3.2 s before, none and 0.3 s now) and keeps archives until `close()`; `ReadOptions.archives` shares the archives `readMod` opened with `fileReaders`, `modIdentity`, `openLayer`, `firegraftBytes` |
| Which message keys can be shown where | Aftermath's `MOD_WORDS` (hand-listed: it lacks `game-copy`, which progress also hears) | `MOD_MESSAGE_GROUPS` (`error`, `reason`, `progress`, `said`, …), `ModMessageKeyIn<G>` |
| A member an archive's list names twice | | listed once in `Layer.files`, by its last spelling, the one `files` takes: nothing else of the description changes |

`earlier` does not hold the forms of readers before 1.0.0 that laid a read-me beside a patcher
exe as a game file (13 above: Burning Ground's folder 14fbf76b99ba5015). No caller works them
out, and they need files the reader does not hash.

## Open

Not in 1.1.0, and what each would take:

- **Ranged reads.** `ModFiles.read` and the archive library read a file whole, so an archive is
  in memory whole while it is read (a plugin loader's packing of 977 MB, above). It would take
  an optional `ModFiles.readRange(path, from, to)` (a browser's `Blob.slice`, a disk's
  positioned read) and an archive opened from its header, its tables and its members' sectors
  read when asked, which `mopaq` does not do today. With both, a packing laid by its folder
  could be described from its tables alone, and the packing question above settled without
  reading its contents.
- **Role and order for `layout: "game"`.** Files handed over in the game's paths say nothing
  of how they were carried, so the role and the order come from the path alone. It would take
  the handing side to say it: a manifest beside the files (for each module its role, its
  carrier, its place in its loader's order) that the reader takes over the path's rule, and a
  rule for when the two disagree.
- **Files a mod's code reads from its folder at run time** (settings such as a `.yml` beside
  the game, a plugin's `.ini`) are no game files, and have no line unless they sit under a
  folder the game's paths are read from. Making them part of the identity would take knowing
  which files a plugin opens, which the reader cannot tell without running the plugin (a list
  in `mod.json`, or one learned from a run), and a new rule. That would move hashes, so it
  would come with an earlier rule's entry in `earlier`.

## Order of work

1. Core: re-export the package's readers from `src/formats/mod/sources.ts` and `hash.ts` for
   one release, then delete them; `races.ts` keeps the labels and choices and imports
   `normalizeRaces`.
2. The CLI: `openModSource` becomes `readModAt` (or `readMod` over `diskFiles`), `ModSource`
   becomes the description; `info`, `hash`, `overlay`, `header`, `play` read from it; the
   messages go through the CLI's `t` by `template`.
3. The installer: a picked folder becomes a `ModFiles`, `splitPickedFiles` and `dataSetHashOf`
   go; the extraction lays `d.layers` in order (archives at their priority, then the folder).

## For scm-sim

scm-sim's `src/mods/read/` is where this package came from; scm-sim deletes it and imports
`@scm-js/mod` (and `@scm-js/mod/node` for `src/mods/disk.ts`, which is `diskFiles` /
`readModAt` here). What its callers must follow:

- **Words are messages.** `ModDescription.said`, `Module.why`, `CarriedFile.why`, `Loader.words`,
  the reasons `plugInOrder` and `planPlugins` give, `ENTRY_WORDS` and the `progress` callback are
  `ModMessage`s (`key`, `params`, `template`, `text`), not strings: print `.text`, decide by
  `.key`, never search the sentence. `gameCopyText` gives messages. `descriptionText` takes an
  optional `translate`; `descriptionLines` gives the messages. Errors are `ModError`s with
  `detail` (`ModReadError`, `PatcherError`, `ZipError`); a bad zip inside a mod is a
  `ModReadError` (`zip-unreadable`), where it was a bare `ZipError`.
- **Sentences reworded** so they hold for any caller: `why-loads-plugins` is now
  `why-plugin-loader`; the texts of `why-mpqdraft-patcher`, `why-provider`, `loader-folder`,
  `overlay-word`, `zip64` and `zip-method` changed (no "host", "here" or "page"). A test that
  compared one of these sentences compares the key now.
- **`named.plugins`** is plugin file names only. A patcher exe's own plugins, which were joined
  into it as `"<exe> (FireGraft patcher plugin <name>, id <hex>)"`, are
  `named.patcherPlugins` (`{ exe, form, name, id }`). `patcherPluginWords(entry)` gives each as
  the message `patcher-plugin` (the exe's file name as given, where the page lower-cased it), so
  the page's own `patcherPluginWords` goes.
- **New in the description**: `game`, `manifest`, `left`, `duplicates` (and a `duplicate`
  message in `said`, and `text-folder` for a folder in the text form `scmjs mod unpack` writes).
- **`mod.json`**: only the one in the folder given or one folder down (never in a game folder)
  is the mod's, where the shallowest anywhere was; it also reads `base` and `scmjs`. A `races`
  letter in upper case is lower-cased, where it was dropped.
- **The folder's root** (13 above). scm-sim's pins move: Burning Ground's unpacked folder
  14fbf76b99ba5015 becomes c76bfa18e9fc4fb5 (`withoutPlugins` f9dc2cc001d39685 becomes
  0ed055cf80a95bd0, `older` 2c44748b00f8128d becomes 45f548e49bd6a097), the same as its exe;
  TriFresh's unzipped folder becomes its exe's. Burning Ground's exe, SC Revolution, TriFresh's
  exe, EUD Enabler, Cosmonarchy and the made mods of `mods-read-pins` do not move by this fix. An empty
  folder layer (a release folder holding only an exe and notes) is no longer listed.
- **A file named alone without a container's extension** is read as a zip, an MPQ or an exe by
  its first bytes.
- **The unlisted project's line** (10 above): a FireGraft project found only through
  FireGraft's own list has its line. scm-sim's pins move: SC Revolution's exe 693bf4a83f3a69a1
  becomes d9e4e6ff76c7e71d (`withoutPlugins` 90b8c22d9cb4ba31 becomes bb3f273690cf8d8d;
  90b8c22d9cb4ba31 is now its `beforeCode`), and the made unlisted patcher of `mods-read-pins` c90a5b91b247793a
  becomes 76ab6a4dc8f8f387 (`withoutPlugins` eea56b519dca4872 becomes b9ae0a88907ac8b6, and
  eea56b519dca4872 is its `beforeCode`). `beforeCode` is now computed without that line too, and
  so is `older`. `FiregraftFile.byList` stays, saying how the project was found.
- **Removed**: `sharedFolder` (the root rule above no longer needs it), the type alias
  `PatcherPlugin` (use `CarriedModule`). `leafOf` and `folderOf` are exported, so a copy of
  either goes.
- **`identity.older` has `files`**: the game names its lines counted that the hash does not
  (`OlderHashes & { files }`). A page that keeps `older` in its manifest keeps them too, or
  takes `{ hash, withoutPlugins }` of it; a test comparing `older` with `toEqual` sees the field.
- **A DLL under `plugins/` handed over in the game's paths** (`layout: "game"`) is a library
  only, where it was also a game-file line; such a set now hashes as its folder does. No pin of
  scm-sim's moves: its game-layout sets hold no DLL under `plugins/`.
- **Node 20** at least.
