# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-12

### Added
- `identity.earlier`: every hash an earlier rule gave the same files, each with its rule
  (`before-code`, `before-unlisted-project`, `older`, `game-files`, `game-files-older`) and
  its form without plugins where the rule had one, so a caller matching a replay tagged by an
  earlier rule works out none of them itself. `identity.older.lines`: the lines of the
  operating system's files the older rule counted.
- `identityWith`: the hashes of a mod after some members changed, from their new digests
  alone. `gameFileLine`: a game file's line, beside `pluginLine` and `firegraftLine`.
- `ReadOptions.hashFiles: false`: a mod described without reading its files for the hash
  (`UnhashedDescription`), and `modIdentity` to name it later from the same files.
- `fileReaders(…).close()`, and `ReadOptions.archives`: a map of the archives `readMod`
  opened, which `fileReaders`, `modIdentity`, `openLayer`, `firegraftBytes` and
  `firegraftFilesOf` take so that none is opened twice.
- `MOD_MESSAGE_GROUPS`, `ModMessageGroup`, `ModMessageKeyIn`, `ModMessageInGroup`: the keys by
  where they are shown (errors, their reasons, progress, what is said, …), from each message's
  own `in`.
- A `reason` parameter beside `why` in `archive-unopenable` and `exe-archive-unopenable`: the
  archive library's kind of error as a message (`mpq-damaged`, `mpq-no-header`,
  `mpq-version`, `mpq-compression`, `mpq-io`, `mpq-file-missing`, `mpq-other`), its text as
  `detail`. `why` is the library's text as before, and the English sentence is unchanged. The
  library's error is the `ModReadError`'s `cause` (`ModError` takes `{ cause }`). A message's
  parameters its English text does not show are its `hidden` in `MOD_MESSAGES`.
- `readMod` rejects only with a `ModReadError`, the error underneath as its `cause`: an
  archive whose list the library cannot read (`archive-unopenable`), a zip member that cannot
  be inflated (`zip-unreadable`, with the new reason `zip-member-inflate`), a FireGraft
  project its archive cannot give (`firegraft-unreadable`), and a file the tree cannot read
  (the new `file-unreadable`). A zip's member that cannot be inflated throws `ZipError`
  (`zip-member-inflate`) from `readZip` and `zipFiles` too, where the platform's own error came
  through.
- New message keys: `mpq-no-header`, `mpq-version`, `mpq-damaged`, `mpq-compression`,
  `mpq-io`, `mpq-file-missing`, `mpq-other`, `zip-member-inflate` (reasons) and
  `file-unreadable` (an error).
- `ModDescription.systemFiles`: the operating system's files seen where a file of the mod's
  would be, loose or in its archives.

### Changed
- `readPath` and `fileReaders` list the tree once rather than at every file (not at all
  after `readMod` has read the same tree), and `fileReaders` reads a zip in the tree once for
  all its members. Reading every file of Cosmonarchy's release through `fileReaders` took
  3.2 s and 7,761 listings; it takes 0.3 s and none.
- A plugin loader's packing laid by its folder is let go before the files are hashed, and
  `diskFiles` reads a file without copying it: reading Cosmonarchy's release in Node peaked at
  2.1 GB and peaks at 1.2 GB.
- An archive whose list names a member twice gives it once in `Layer.files`, where it gave it
  twice: by its last spelling, the one `files` has always taken. Nothing else of the
  description changes.

No hash moves: every identity value is the one 1.0.0 gives.

## [1.0.0] - 2026-11-12

### Added
- The reader of mods from scmJS's game engine, as a package of its own: `readMod` and the
  description it gives (loaders, layers with storm's priorities, modules in the loader's
  order, the FireGraft project and its moment, carried files, the identity), for folders,
  `.mpq` archives, FireGraft's patcher exe, MPQDraft's self-executing MPQ, other exes with
  an archive, plugins that load plugins, and zips of any of these.
- The mod's identity: `hashLines`, `runningHash`, and the hashes a mod went by before
  (`beforeCode`, `older`).
- The readers on their own: `exeArchive`, `readZip`, `programEnd`, `libraryName`,
  `exportsOf`, `importsOf`, `moduleFacts`, `probeNames`, and the game's own names.
- What the command line and the editor worked out for themselves: each file's kind
  (`kindOf`), a table's layout and entries (`tableShape`), the game a mod is for (`gameOf`),
  one rule for `mod.json` (`readModJson`, `isModJsonPath`), what was left out and why
  (`left`), two files for one game path (`duplicates`), and the hints a mod's files give
  about its races (`raceCandidates`).
- `MOD_MESSAGES`: every sentence the package can produce, with its parameters named, for
  apps that translate them. Errors, progress and reasons are `ModMessage`s.
- `@scm-js/mod/node`: a mod on a disk as `ModFiles` (`diskFiles`, `readModAt`).
