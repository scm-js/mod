/**
 * `@scm-js/mod`: one reader of a StarCraft: Brood War mod. Given a mod's files as a tree (`ModFiles`: a folder, an
 * `.mpq`, MPQDraft's or FireGraft's self-executing exe, a zip, plugins, DLLs), `readMod` says what the mod is: its
 * loaders, its layers with storm's priorities, its code modules in the loader's order, its FireGraft project, what it
 * carries, and what it goes by between people (its hash). Nothing is run.
 *
 * It imports nothing but `mopaq` and the platform's standard web APIs (`crypto.subtle`, `DecompressionStream`,
 * `TextDecoder`), so the same build runs in Node and in a browser. A mod on a disk is `@scm-js/mod/node`.
 */

// The reader and its description.
export {
  readMod, plugInOrder, planPlugins, readPath, fileReaders, moduleBytes, openLayer, firegraftBytes, firegraftFilesOf,
  isPluginFile, isCodeFile, patcherPluginWords, PRIORITY, modIdentity,
  type ModDescription, type ReadOptions, type Loader, type LoaderKind, type Layer, type LayerFile, type Module, type ModuleRole,
  type ModuleSource, type FiregraftFile, type FiregraftPatch, type CarriedFile, type Identity, type LeftReason,
  type UnhashedDescription, type UnhashedIdentity, type SystemFile, type FileReaders, type OpenArchives,
} from "./mod.ts";
export { filesOf, isSystemFile, inDotFolder, leafOf, folderOf, SYSTEM_FILES, type ModEntry, type ModFiles } from "./files.ts";
export { descriptionLines, descriptionText } from "./words.ts";

// Words: every sentence the reader can produce, by key.
export {
  MOD_MESSAGES, MOD_MESSAGE_GROUPS, say, renderMessage, formatMessage, templateParams, ModError, ModReadError,
  type ModMessage, type ModMessageOf, type ModMessageKey, type ModMessageParams, type ModParam, type Translate,
  type ModMessageGroup, type ModMessageKeyIn, type ModMessageInGroup,
} from "./messages.ts";

// The identity: the mod's hash and its rules.
export {
  sha256Hex, hashLines, hashLinesAsWere, isSystemLine, pluginLine, firegraftLine, gameFileLine, hasCodeLine, runningHash, identityWith,
  type OlderHashes, type EarlierHash, type EarlierRule, type IdentityChanges,
} from "./hash.ts";

// The containers, each readable alone: Windows images, self-executing exes, zips, archives without a list.
export { programEnd, libraryName, exportsOf, importsOf, holdsString, type PeExports } from "./pe.ts";
export { exeArchive, archiveInFile, isExe, isMpq, PatcherError, MPQDRAFT_COMPONENT, MPQDRAFT_DLL_MODULE, type ExeArchive, type ExeForm, type CarriedModule } from "./exe.ts";
export { isZip, readZip, zipFiles, ZipError, type ZipMember } from "./zip.ts";
export { tblStrings, namesToProbe, probeNames, type TablesOf } from "./names.ts";

// What a module is, and FireGraft's files.
export { moduleFacts, ENTRY_WORDS, type ModuleEntry, type ModuleFacts } from "./modules.ts";
export { firegraftPick, listedNames, FIREGRAFT_LISTS, FIREGRAFT_MOMENT } from "./firegraft.ts";

// Where a mod's files are, and what they are.
export { modRoot, inGamePaths, gameCopyFiles, gameCopyFolders, gameCopyText } from "./layout.ts";
export { kindOf, kindTotals, tableShape, datTableOf, gameOf, MOD_KINDS, DAT_SHAPES, type ModKind, type DatTableName, type TableShape } from "./kinds.ts";
export { readModJson, isModJsonPath, MOD_JSON, MAX_MOD_NAME, type ModJson } from "./manifest.ts";
export {
  normalizeRace, normalizeRaces, saidRaces, isDeclarableRace, isPlayedRace, raceCandidates, MAX_DECLARED_RACES, MAX_RACE_NAME, GAME_NETWORK_TBL_ENTRIES,
  type DataSetRace, type RaceCandidates,
} from "./races.ts";

// The game's own names.
export {
  gameName, gameFileNames, readsStartupData, GAME_FOLDERS, GAME_ARCHIVES, GAME_ARCHIVE_PRIORITY, TILESET_NAMES, RACE_NAMES, RACE_FILES,
  INTERFACE_NAMES, STARTUP_NAMES, DAT_TABLES, type RaceFile,
} from "./gameNames.ts";
