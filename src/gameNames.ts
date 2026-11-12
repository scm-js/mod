/**
 * The game's own names, as 1.16.1 has them: its folders, its archives and the priority it opens each at, the files it
 * reads by name, and how a path is turned into the name the game asks with. What a reader of a mod needs to tell the
 * game's files from everything else a mod ships. Pure data.
 */

/** `arr/units.dat` or `Arr\Units.dat` as the game's name for it: lower case, backslashes. */
export const gameName = (path: string): string => path.replace(/\//g, "\\").toLowerCase();

/**
 * The game's own top folders: a mod's files sit under these. The one list: what decides where the game's paths start
 * in a folder a person gives (`modRoot`), and so which files are a mod's.
 */
export const GAME_FOLDERS = ["arr", "rez", "scripts", "unit", "tileset", "sound", "game", "font", "dlgs", "glue", "triggers", "portrait", "music", "cursor", "local", "parallax", "smk", "maps", "anim", "hd2", "sd", "templates", "staredit", "campaign"];

/** The game's own archives, by file name (lower case): what a 1.16.1 installation holds beside its program. */
export const GAME_ARCHIVES = ["stardat.mpq", "broodat.mpq", "patch_rt.mpq", "starcraft.mpq", "broodwar.mpq"] as const;

/**
 * The priority storm opens each of the game's own archives at (0x4DABD0: Stardat 2000, patch_rt 7000, Broodat 2500;
 * 0x4DA950: BroodWar.mpq or StarCraft.mpq at 1000), and a map's archive at 0 (0x4CC110). Storm looks through open
 * archives highest first.
 */
export const GAME_ARCHIVE_PRIORITY: Readonly<Record<(typeof GAME_ARCHIVES)[number] | "map", number>> = {
  "patch_rt.mpq": 7000, "broodat.mpq": 2500, "stardat.mpq": 2000, "broodwar.mpq": 1000, "starcraft.mpq": 1000, map: 0,
};

export const TILESET_NAMES = ["badlands", "platform", "install", "ashworld", "jungle", "desert", "ice", "twilight"] as const;
export const RACE_NAMES = ["zerg", "terran", "protoss"] as const;

/**
 * The files the game names by a race's letter (its own z, t, p: `game\tconsole.pcx` …), by what each is, by the
 * path with forward slashes (`gameName` gives the game's name). The console's picture, the cover over the minimap's corner, the
 * progress bar empty and full, the command card's layout, the chat box's layout and the command buttons.
 */
export const RACE_FILES = {
  console: (l: string) => `game/${l}console.pcx`,
  overlay: (l: string) => `game/${l}conover.pcx`,
  barEmpty: (l: string) => `game/${l}pbrempt.pcx`,
  barFull: (l: string) => `game/${l}pbrfull.pcx`,
  buttons: (l: string) => `rez/statbtn${l}.bin`,
  textBox: (l: string) => `rez/${l}textbox.bin`,
  buttonFaces: (l: string) => `unit/cmdbtns/${l}cmdbtns.grp`,
} as const;
export type RaceFile = keyof typeof RACE_FILES;

/**
 * The classic game's own interface, which a Remastered installation has not got: what the interface pack holds. The
 * game loads most of it at every start and stops without it, and the rest when it comes to it (the dialog of a game
 * lost is read when the game is lost). A race's files are named by its letter; a replay is watched from a console of
 * no race (`n`), which has a picture, a cover and a button layout of its own. Two files are here though Remastered
 * has them: the fonts, which are there as stubs the game cannot read, and the star field behind a space platform,
 * which is there in a form of Remastered's own. The list is the executable's own names for what it shows during a
 * game; the menus before and after one (`glue\…`) are left out, the engine never being there.
 */
export const INTERFACE_NAMES: readonly string[] = /* @__PURE__ */ (() => [
  ...["font8", "font10", "font12", "font14", "font16", "font16x"].map((n) => `font\\${n}.fnt`),
  "parallax\\star.spk",
  ...["minimap", "stat_f10", "statdata", "statfluf", "statlb", "statport", "statres"].map((n) => `rez\\${n}.bin`),
  // (by the letter, as `RACE_FILES` names them: a race a data set declares has the same names with its own letter, which
  // are the data set's files and reach the game with them)
  ...RACE_NAMES.flatMap((race) => { const f = (k: RaceFile) => gameName(RACE_FILES[k](race[0])); return [f("console"), f("overlay"), f("barEmpty"), f("barFull"), f("buttons"), f("textBox"), `dlgs\\${race}.grp`, f("buttonFaces")]; }),
  "game\\nconsole.pcx", "game\\nconover.pcx", "rez\\statbtnn.bin",
  "unit\\cmdbtns\\cmdicons.grp", "unit\\cmdbtns\\ticon.pcx",
  // Read when the game comes to them.
  ...["abrtmenu", "allyfltr", "dlgfatal", "gamemenu", "help", "helpmenu", "lmission", "loadgame", "minimappreview", "msgfltr", "netdlg", "objctdlg", "ok", "okcancel", "options",
    "quit", "quit2mnu", "quitrepl", "restart", "savegame", "snd_dlg", "spd_dlg", "teamfltr", "timeout", "tips_dlg", "video", "wait", "wmission"].map((n) => `rez\\${n}.bin`),
  "rez\\help_txt.tbl", "rez\\network.tbl", "rez\\tips.tbl",
])();

/**
 * Every file the game may ask for by name in a game on `tileset` (its name: `jungle`), whatever the races, at the
 * start or later. Beyond these the game reads only a map's own files. From the game's requests over melee and
 * use-map-settings games and a replay on all eight tilesets, and from the names in its executable. A melee game's rules
 * are `melee.trg`; the other game types' (`triggers\ctf.trg` and the rest) are not listed.
 */
export function gameFileNames(tileset: string): string[] {
  return [
    ...["flingy", "orders", "portdata", "sprites", "techdata", "units", "upgrades", "weapons"].map((n) => `arr\\${n}.dat`), "arr\\portdata.tbl",
    ...["blink.grp", "icons.grp", "tblink.pcx", "tfontgam.pcx", "thpbar.pcx", "tminimap.pcx", "tselect.pcx", "tunit.pcx", "twire.pcx"].map((n) => `game\\${n}`),
    "dlgs\\tile.grp", "rez\\stat_txt.tbl", "scripts\\aiscript.bin", "scripts\\bwscript.bin", "triggers\\melee.trg",
    ...["grpwire", "tranwire", "wirefram"].map((n) => `unit\\wirefram\\${n}.grp`),
    ...["cv5", "grp", "vf4", "vr4", "vx4", "wpe"].map((e) => `tileset\\${tileset}.${e}`),
    ...["bexpl", "bfire", "dark", "gfire", "green", "ofire", "red", "shift", "trans50"].map((n) => `tileset\\${tileset}\\${n}.pcx`),
    ...INTERFACE_NAMES,
  ];
}

/**
 * What the game reads once at the program's start: the animation scripts, the image table
 * and its strings, the sound table and its strings, the campaign's map table. A mod that changes one of these, or a
 * picture or overlay images.tbl names, has its startup data read again (`readsStartupData`).
 */
export const STARTUP_NAMES: readonly string[] = ["scripts\\iscript.bin", "arr\\images.dat", "game\\tselect.pcx", "arr\\images.tbl", "arr\\sfxdata.dat", "arr\\sfxdata.tbl", "arr\\mapdata.dat", "arr\\mapdata.tbl"];

/**
 * Whether a mod giving these files (game names) changes what the game read once at the program's start, so that the
 * startup data must be read again: one of `STARTUP_NAMES`, or a picture or overlay under `unit\` (what images.tbl
 * names). A caller passes every name the mod lays.
 */
export function readsStartupData(names: Iterable<string>): boolean {
  for (const n of names) if (STARTUP_NAMES.includes(n) || /^unit\\.*\.(grp|lo[abdlosu])$/.test(n)) return true;
  return false;
}

/** The game's eleven `.dat` tables by name (`units`), as `arr\<name>.dat`. */
export const DAT_TABLES = ["units", "weapons", "flingy", "sprites", "images", "orders", "upgrades", "techdata", "portdata", "sfxdata", "mapdata"] as const;
