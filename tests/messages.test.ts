// Every sentence the package can produce is in `MOD_MESSAGES`, with its parameters named: a caller translates by key,
// and nothing in the sources writes a sentence of its own.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { descriptionLines, descriptionText, filesOf, formatMessage, MOD_MESSAGE_GROUPS, MOD_MESSAGES, ModError, readMod, renderMessage, say, templateParams, type ModMessage, type ModMessageGroup } from "../src/index.ts";
import { MADE, treeOf } from "./support/madeMods.ts";
import { program } from "./support/patcherExe.ts";
import { madeZip } from "./support/madeZip.ts";

const SRC = join(import.meta.dirname, "../src");

/** The source with its comments taken out (line and block comments; not inside strings, which here hold no `//`). */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

describe("the list of messages", () => {
  it("names each message's parameters exactly as its text uses them, and those it carries unshown (`hidden`)", () => {
    for (const [key, m] of Object.entries(MOD_MESSAGES) as [string, { text: string; params: readonly string[]; hidden?: readonly string[] }][]) {
      expect([...templateParams(m.text), ...(m.hidden ?? [])].sort(), key).toEqual([...m.params].sort());
      for (const h of m.hidden ?? []) expect(templateParams(m.text), key).not.toContain(h);
    }
  });

  it("renders the two archive errors as 1.0.0 did, word for word: the library's text as `why`, the reason as a message beside it", () => {
    // (1.0.0's templates and sentences, pinned)
    expect(MOD_MESSAGES["archive-unopenable"].text).toBe("{path} could not be opened as an archive: {why}");
    expect(MOD_MESSAGES["exe-archive-unopenable"].text).toBe("the archive inside {path} (at byte {at}) could not be opened: {why}");
    const reason = say("mpq-damaged", { detail: "Hash table extends beyond archive" });
    const a = say("archive-unopenable", { path: "Mod/broken.mpq", why: "Corrupted: Hash table extends beyond archive", reason });
    const b = say("exe-archive-unopenable", { path: "Made.exe", at: 6656, why: "Corrupted: Hash table extends beyond archive", reason });
    expect(a.text).toBe("Mod/broken.mpq could not be opened as an archive: Corrupted: Hash table extends beyond archive");
    expect(b.text).toBe("the archive inside Made.exe (at byte 6656) could not be opened: Corrupted: Hash table extends beyond archive");
    expect(formatMessage("{path} could not be opened as an archive: {why}", { path: "Mod/broken.mpq", why: "Corrupted: Hash table extends beyond archive" })).toBe(a.text);
    // (a catalogue that knows the reasons renders `reason`, translated as a message of its own; one that does not, `why`)
    const ko = (template: string, params: Readonly<Record<string, string | number>>) => formatMessage(({ "{path} could not be opened as an archive: {why}": "{path}을 아카이브로 열지 못했습니다: {reason}", "it is damaged ({detail})": "손상됨 ({detail})" } as Record<string, string>)[template] ?? template, params);
    expect(renderMessage(a, ko)).toBe("Mod/broken.mpq을 아카이브로 열지 못했습니다: 손상됨 (Hash table extends beyond archive)");
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

describe("the groups of messages", () => {
  const groupsOf = (key: string): readonly string[] => (MOD_MESSAGES as Record<string, { in: readonly string[] }>)[key]?.in ?? [];

  it("are made from each message's own `in`: every key in one at least, each group's keys those that name it", () => {
    for (const [key, m] of Object.entries(MOD_MESSAGES)) expect(m.in.length, key).toBeGreaterThan(0);
    for (const [group, keys] of Object.entries(MOD_MESSAGE_GROUPS)) {
      expect(keys, group).toEqual(Object.keys(MOD_MESSAGES).filter((k) => groupsOf(k).includes(group)));
      expect(keys.length, group).toBeGreaterThan(0);
    }
    expect(MOD_MESSAGE_GROUPS.progress).toEqual(["opening", "probing", "reading-files", "game-copy"]);
  });

  it("hold every key the sources make where they show it", () => {
    const where: [RegExp, ModMessageGroup][] = [
      [/new (?:ModReadError|ModError)\(say\("([\w-]+)"/g, "error"],
      [/new (?:PatcherError|ZipError)\(say\("([\w-]+)"/g, "reason"],
      [/"(mpq-[\w-]+)"/g, "reason"],
      [/progress\(say\("([\w-]+)"/g, "progress"],
      [/said\.push\(say\("([\w-]+)"/g, "said"],
      [/say\("(why-[\w-]+)"/g, "why"],
      [/say\("(loader-[\w-]+)"/g, "loader"],
      [/say\("(describe-[\w-]+)"/g, "description"],
      [/"(entry-[\w-]+)"/g, "entry"],
    ];
    let seen = 0;
    for (const f of readdirSync(SRC).filter((n) => n.endsWith(".ts") && n !== "messages.ts")) {
      const body = code(readFileSync(join(SRC, f), "utf8"));
      for (const [pattern, group] of where) for (const m of body.matchAll(pattern)) { seen++; expect(groupsOf(m[1]), `${f}: ${m[1]} is shown as ${group}`).toContain(group); }
      // (any other message made: a key of the list)
      for (const m of body.matchAll(/say\("([\w-]+)"/g)) expect(m[1] in MOD_MESSAGES, `${f}: ${m[1]}`).toBe(true);
    }
    expect(seen).toBeGreaterThan(60);
  });

  it("hold every key a reading shows, at run time: what is heard, said, and thrown with its reasons", async () => {
    const heard = new Set<string>(), said = new Set<string>(), thrown = new Set<string>(), reasons = new Set<string>();
    const reasonsOf = (m: ModMessage) => { for (const v of Object.values(m.params as Record<string, unknown>)) if (v && typeof v === "object") { reasons.add((v as ModMessage).key); reasonsOf(v as ModMessage); } };
    const text = (s: string) => new TextEncoder().encode(s);
    const trees = [
      ...(Object.keys(MADE) as (keyof typeof MADE)[]).map((k) => () => treeOf(k, MADE[k](), k === "patcher" ? { named: "Made.exe" } : k === "unlisted" ? { named: "Unlisted.exe" } : {})),
      async () => filesOf("Game", { "Game/StarDat.mpq": text("x"), "Game/BrooDat.mpq": text("x") }),
      async () => filesOf("Mod", { "Mod/mod.json": text("{"), "Mod/arr/units.dat": text("u"), "Mod/arr/Units.dat": text("v") }),
      async () => filesOf("Prog", { "Prog.exe": program() }, { named: "Prog.exe" }),
      async () => { const bad = new Uint8Array(64), v = new DataView(bad.buffer); v.setUint32(0, 0x1a51504d, true); v.setUint32(4, 32, true); v.setUint32(16, 0x7fffff00, true); v.setUint32(20, 0x7fffff00, true); v.setUint32(24, 16, true); v.setUint32(28, 16, true); return filesOf("Bad", { "Bad/broken.mpq": bad }); },
      async () => filesOf("Zip", { "Zip/pack.zip": madeZip({ "a.txt": text("a") }).subarray(0, 40) }),
    ];
    for (const make of trees) {
      try { const d = await readMod(await make(), { progress: (m) => heard.add(m.key) }); for (const m of d.said) { said.add(m.key); reasonsOf(m); } }
      catch (e) { if (!(e instanceof ModError)) throw e; thrown.add(e.key); reasonsOf(e.detail); }
    }
    for (const k of heard) expect(MOD_MESSAGE_GROUPS.progress as readonly string[], k).toContain(k);
    for (const k of said) expect(MOD_MESSAGE_GROUPS.said as readonly string[], k).toContain(k);
    for (const k of thrown) expect(MOD_MESSAGE_GROUPS.error as readonly string[], k).toContain(k);
    for (const k of reasons) expect(MOD_MESSAGE_GROUPS.reason as readonly string[], k).toContain(k);
    expect([heard.size, said.size, thrown.size, reasons.size].every((n) => n > 0), JSON.stringify({ heard: [...heard], said: [...said], thrown: [...thrown], reasons: [...reasons] })).toBe(true);
  });
});
