// Every sentence the package can produce is in `MOD_MESSAGES`, with its parameters named: a caller translates by key,
// and nothing in the sources writes a sentence of its own.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { descriptionLines, descriptionText, filesOf, formatMessage, MOD_MESSAGES, readMod, renderMessage, say, templateParams, type ModMessage } from "../src/index.ts";
import { MADE, treeOf } from "./support/madeMods.ts";

const SRC = join(import.meta.dirname, "../src");

/** The source with its comments taken out (line and block comments; not inside strings, which here hold no `//`). */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

describe("the list of messages", () => {
  it("names each message's parameters exactly as its text uses them", () => {
    for (const [key, m] of Object.entries(MOD_MESSAGES)) expect(templateParams(m.text).sort(), key).toEqual([...m.params].sort());
  });

  it("is checked by the type-checker: a key not listed, a parameter missing or not listed, do not compile", () => {
    // @ts-expect-error a key that is not in the list
    expect(() => say("not-a-message", {})).toThrow();
    // @ts-expect-error a parameter the message names is missing
    expect(say("opening", {}).text).toBe("Opening {path}…");
    expect(say("opening", { path: "a.mpq" }).text).toBe("Opening a.mpq…");
  });

  it("is the only place a sentence is written", () => {
    for (const f of readdirSync(SRC).filter((n) => n.endsWith(".ts") && n !== "messages.ts")) {
      const body = code(readFileSync(join(SRC, f), "utf8"));
      // (an error is made of a message, always)
      for (const m of body.matchAll(/new (\w*Error)\(([^)]{0,12})/g)) expect(`${m[1]}(${m[2]}`, f).toMatch(/^(ModReadError|PatcherError|ZipError|ModError)\(say\(/);
      // (no string of three words or more)
      const strings = [...body.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, " "));
      expect(strings.filter((s) => /[A-Za-z]{2,}[ ,;:]+[A-Za-z]{2,}[ ,;:]+[A-Za-z]{2,}/.test(s)), f).toEqual([]);
    }
  });
});

describe("a message", () => {
  it("is its key, its parameters, its template and its English text", () => {
    const m = say("game-copy", { folder: "Starcraft", list: "StarDat.mpq, BrooDat.mpq", more: 0 });
    expect(m).toEqual({ key: "game-copy", params: { folder: "Starcraft", list: "StarDat.mpq, BrooDat.mpq", more: 0 }, template: MOD_MESSAGES["game-copy"].text, text: "Starcraft is a copy of the game. Its own archives (StarDat.mpq, BrooDat.mpq) are not part of the mod and were left out." });
    expect(say("game-copy", { folder: "S", list: "a", more: 3 }).text).toContain("(a and 3 more)");
    expect(say("patcher-no-archive", { plugins: 1 }).text).toBe("it is FireGraft's patcher with 1 plugin, and no archive was found after them");
    expect(say("reading-files", { done: 1200, total: 7768 }).text).toBe("Reading the mod's files: 1200 of 7768…");
  });

  it("is rendered through a caller's translation, a message inside it first", () => {
    const inner = say("overlay-form", { at: 1024, form: 2, known: 1 });
    const outer = say("exe-unreadable", { path: "Made.exe", why: inner });
    const seen: string[] = [];
    const shout = (template: string, params: Readonly<Record<string, string | number>>, m: ModMessage) => { seen.push(m.key); return formatMessage(template.toUpperCase().replace(/\{([A-Z]+)/g, (_, n: string) => `{${n.toLowerCase()}`), params); };
    expect(renderMessage(outer, shout)).toBe("Made.exe CANNOT BE READ AS A MOD: ITS PATCHER OVERLAY (AT BYTE 1024) IS OF FORM 2; ONLY FORM 1 IS KNOWN.");
    expect(seen).toEqual(["overlay-form", "exe-unreadable"]);
  });

  it("fills plurals, exact numbers and selects as the editor's catalogue does", () => {
    expect(formatMessage("{n, plural, =0 {none} one {# file} other {# files}}", { n: 0 })).toBe("none");
    expect(formatMessage("{n, plural, one {# file} other {# files}}", { n: 1 })).toBe("1 file");
    expect(formatMessage("{n, plural, one {# file} other {# files}}", { n: 1234 })).toBe("1,234 files");
    expect(formatMessage("{x, select, yes {on {name}} other {off}}", { x: "yes", name: "it" })).toBe("on it");
    expect(formatMessage("{missing} stays", {})).toBe("{missing} stays");
  });
});

describe("the description in lines", () => {
  it("is a message a line, and the same lines in English as text", async () => {
    const d = await readMod(await treeOf("Release", MADE.release()));
    const lines = descriptionLines(d);
    expect(lines.every((m) => m.key in MOD_MESSAGES)).toBe(true);
    const text = descriptionText(d);
    expect(text).toEqual(lines.map((m) => m.text));
    expect(text[0]).toBe("Release");
    expect(text).toContain("loaders (outermost first):");
    expect(text.find((l) => l.includes("FireGraft project"))).toBe("  FireGraft project Made.fgp (from Release/Release.exe) with database 1161.fgd; lands at the game's first open of font\\font8.fnt (a game's start, after the plugins' inits)");
    expect(text.find((l) => l.startsWith("identity:"))).toMatch(/^identity: hash dd5f0aa9d39f55ab, without plugins 31dfbf31b2b6d395; 5 lines and 4 plugin lines; before its code had lines 26bce9c799273bc1; code yes; startup data read again yes$/);
    const layer = text.find((l) => l.includes("priority 0xFFFF00"));
    expect(layer).toBe("  2. archive Release/Release.exe at byte 6656  priority 0xFFFF00 (16776960) by firegraft-patcher: 2 files");
  });

  it("says a mod of nothing in a sentence", async () => {
    const d = await readMod(filesOf("Empty", { "Empty/readme.txt": new TextEncoder().encode("hi") }));
    expect(d.said.map((s) => s.key)).toEqual(["no-game-files"]);
    expect(d.said[0].text).toBe("There are no game files in Empty.");
  });
});
