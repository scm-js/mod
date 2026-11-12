# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
