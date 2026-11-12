// Where a mod's paths start, and what of a tree is a copy of the game: the rules on their own, on paths alone
// (`gameCopyFiles`, `gameCopyFolders`, `gameCopyText`, `inGamePaths`, `leafOf`, `folderOf`), and a patcher plugin named
// for a person (`patcherPluginWords`).
import { describe, expect, it } from "vitest";
import { folderOf, GAME_ARCHIVES, gameCopyFiles, gameCopyFolders, gameCopyText, inGamePaths, leafOf, patcherPluginWords } from "../src/index.ts";

/** A copy of the game's files as one is handed over beside a mod: its archives, and archives and a program under its Maps. */
const COPY_PATHS = ["StarDat.mpq", "BrooDat.mpq", "patch_rt.mpq", "StarCraft.mpq", "BroodWar.mpq", "Maps/Mod-Root/editor/editor.mpq", "Maps/Mod-Root/editor/grafting/graftc.exe"];
const texts = (paths: readonly string[], given: string) => gameCopyText(paths, given).map((m) => m.text);

describe("gameCopyFiles", () => {
  it("a copy at the root, a copy in a folder, any case, everything under its Maps folder at any depth", () => {
    expect([...gameCopyFiles(["StarDat.mpq", "BrooDat.mpq", "patch_rt.mpq", "StarCraft.mpq", "BroodWar.mpq", "mod.mpq", "StarCraft.exe", "Maps/a.mpq", "Maps/x/y/z.exe", "Maps/(2)a.scm", "Maps/b.zip", "maps2/c.mpq", "arr/units.dat"])].sort())
      .toEqual(["BrooDat.mpq", "BroodWar.mpq", "Maps/(2)a.scm", "Maps/a.mpq", "Maps/b.zip", "Maps/x/y/z.exe", "StarCraft.mpq", "StarDat.mpq", "patch_rt.mpq"].sort());
    // a map, a campaign's music, a table under a copy's Maps: the person's maps folder, not a mod's; without a StarDat.mpq beside it, nothing
    const maps = ["S/Maps/(4)b.scx", "S/Maps/mod-maps/campaign/Day/music/a.ogg", "S/Maps/campaign/x/arr/units.dat"];
    expect([...gameCopyFiles(["S/StarDat.mpq", "S/arr/units.dat", ...maps])].sort()).toEqual(["S/StarDat.mpq", ...maps].sort());
    expect(gameCopyFiles(["S/patch_rt.mpq", ...maps]).size).toBe(0);
    expect([...gameCopyFiles(["C/Starcraft/STARDAT.MPQ", "C/Starcraft/broodat.MPQ", "C/Starcraft/Patch_RT.mpq", "C/StarCraft/maps/Down/Load/x.MPQ", "C/STARCRAFT/MAPS/y.Exe", "C/Release/patch_rt.mpq", "C/Release/Maps/z.mpq", "C/Starcraft/sub/BrooDat.mpq", "C/Starcraft/mod.exe"])].sort())
      .toEqual(["C/STARCRAFT/MAPS/y.Exe", "C/StarCraft/maps/Down/Load/x.MPQ", "C/Starcraft/Patch_RT.mpq", "C/Starcraft/STARDAT.MPQ", "C/Starcraft/broodat.MPQ"].sort());
    // two copies, one inside the other's folder
    expect([...gameCopyFiles(["A/StarDat.mpq", "A/B/StarDat.mpq", "A/B/patch_rt.mpq", "A/B/Maps/m.mpq", "A/patch_rt.mpq"])].sort()).toEqual(["A/B/Maps/m.mpq", "A/B/StarDat.mpq", "A/B/patch_rt.mpq", "A/StarDat.mpq", "A/patch_rt.mpq"]);
    // no StarDat.mpq: no copy, whatever else is there
    expect(gameCopyFiles(["Old/patch_rt.mpq", "Old/BrooDat.mpq", "Old/Maps/a.mpq"]).size).toBe(0);
    expect(gameCopyFiles(["StarDat.mpq.bak", "xStarDat.mpq", "Maps/a.mpq"]).size).toBe(0);
    expect(GAME_ARCHIVES).toEqual(["stardat.mpq", "broodat.mpq", "patch_rt.mpq", "starcraft.mpq", "broodwar.mpq"]);
  });

  it("is said a copy at a time: its folder as handed over, its archives first, six names and how many more", () => {
    const paths = COPY_PATHS.map((p) => `Mod/Starcraft/${p}`).reverse();
    expect(gameCopyFolders(paths)).toEqual([{ folder: "Mod/Starcraft", paths: COPY_PATHS.map((p) => `Mod/Starcraft/${p}`) }]);
    expect(texts(paths, "Mod")).toEqual(["Mod/Starcraft is a copy of the game. Its own archives (StarDat.mpq, BrooDat.mpq, patch_rt.mpq, StarCraft.mpq, BroodWar.mpq, editor.mpq and 1 more) are not part of the mod and were left out."]);
    expect(gameCopyText(paths, "Mod")[0].params).toEqual({ folder: "Mod/Starcraft", list: "StarDat.mpq, BrooDat.mpq, patch_rt.mpq, StarCraft.mpq, BroodWar.mpq, editor.mpq", more: 1 });
    expect(texts(["StarDat.mpq", "patch_rt.mpq"], "Made")).toEqual(["Made is a copy of the game. Its own archives (StarDat.mpq, patch_rt.mpq) are not part of the mod and were left out."]);
    expect(texts(["A/B/Maps/m.mpq", "A/patch_rt.mpq", "A/B/StarDat.mpq", "A/StarDat.mpq"], "x")).toEqual([
      "A is a copy of the game. Its own archives (StarDat.mpq, patch_rt.mpq) are not part of the mod and were left out.",
      "A/B is a copy of the game. Its own archives (StarDat.mpq, m.mpq) are not part of the mod and were left out.",
    ]);
  });
});

describe("which handed sets are in the game's paths", () => {
  it("the game's folders at the root: yes; a folder's name first: no", () => {
    expect(inGamePaths(["arr/units.dat", "plugins/apply", "readme.txt"])).toBe(true);
    expect(inGamePaths(["members.mpq", "arr/units.dat", "plugins/aise.qdp"])).toBe(true);
    expect(inGamePaths(["Release/mpq/arr/units.dat", "Release/plugins/aise.qdp", "Release/Made.exe"])).toBe(false);
    expect(inGamePaths(["a mod/arr/units.dat", "a mod/plugins/apply"])).toBe(false);
    // (no game folder at all, or maps alone: read as a folder)
    expect(inGamePaths(["plugins/aise.qdp", "readme.txt"])).toBe(false);
    expect(inGamePaths(["maps/a.scx"])).toBe(false);
  });
});

describe("a path's parts", () => {
  it("the last part, either slash; the folder, forward slashes", () => {
    expect([leafOf("a/b/c.qdp"), leafOf("a\\b\\c.qdp"), leafOf("c.qdp"), leafOf("a/b\\c.qdp")]).toEqual(["c.qdp", "c.qdp", "c.qdp", "c.qdp"]);
    expect([folderOf("a/b/c.qdp"), folderOf("c.qdp"), folderOf("a/c")]).toEqual(["a/b", "", "a"]);
  });
});

describe("a patcher plugin, named for a person", () => {
  it("the exe, the form, the plugin's own name where it gives one, its id", () => {
    expect(patcherPluginWords({ exe: "Mod/Made.exe", form: "firegraft-patcher", name: "GPTP.qdp", id: 0x1b4d69b6 }))
      .toMatchObject({ key: "patcher-plugin", params: { exe: "Made.exe", form: "firegraft-patcher", named: "yes", name: "GPTP.qdp", id: "1b4d69b6" }, text: "Made.exe (FireGraft patcher plugin GPTP.qdp, id 1b4d69b6)" });
    expect(patcherPluginWords({ exe: "Made.exe", form: "mpqdraft-sempq", name: null, id: 0x45445545 }).text).toBe("Made.exe (MPQDraft SEMPQ plugin id 45445545)");
  });
});
