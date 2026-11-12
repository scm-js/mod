/**
 * A mod's description in plain lines, for a person reading it (a log, a command that prints what a mod is): its
 * loaders, its layers with storm's priority, its modules in the loader's order with their role and interface, its
 * patches with their moment, what it carries, and what it goes by between people. Each line is a message of
 * `MOD_MESSAGES` (`descriptionLines`); `descriptionText` renders them, in English or through a caller's `translate`.
 */
import type { ModDescription } from "./mod.ts";
import { ENTRY_WORDS } from "./modules.ts";
import { renderMessage, say, type ModMessage, type Translate } from "./messages.ts";

const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;
const prio = (n: number) => (n >= 0x10000 ? `${hex(n)} (${n})` : String(n));
const yes = (b: boolean) => (b ? "yes" : "no");

/** The description as messages, one a line. */
export function descriptionLines(d: ModDescription): ModMessage[] {
  const out: ModMessage[] = [];
  out.push(say("describe-name", { name: d.name, link: d.link ?? "none", races: d.races?.length ? d.races.map((r) => `${r.id} ${r.name}`).join(", ") : "none" }));
  out.push(say("describe-loaders", {}));
  for (const l of d.loaders) out.push(say("describe-loader", { kind: l.kind, top: yes(!l.path), path: l.path, words: l.words }));
  out.push(say("describe-layers", {}));
  d.layers.forEach((l, k) => out.push(say("describe-layer", {
    n: k + 1, kind: l.kind, top: yes(!l.path), path: l.path, at: l.at ? l.at : "none", priority: prio(l.priority), by: l.by,
    replaces: l.replaces ?? "none", files: l.files.length, probed: yes(!!l.probed),
  })));
  out.push(say("describe-files", { files: d.files.length }));
  out.push(say("describe-modules", {}));
  for (const m of d.modules) {
    const from = m.source.kind === "file" ? m.source.path : m.source.kind === "carried" ? `${m.source.exe} ${m.source.form} #${m.source.index + 1}` : `${m.source.archive}: ${m.source.member}`;
    out.push(say("describe-module", {
      order: m.load ? `${String(m.order! + 1).padStart(2)}.` : " - ", name: m.name, role: m.role, entry: ENTRY_WORDS[m.entry], samase: yes(m.samase),
      id: m.id !== null ? hex(m.id) : "none", from, size: m.size.toLocaleString("en-US"), loaded: yes(m.load), why: m.why ?? "",
    }));
  }
  out.push(say("describe-patches", {}));
  if (!d.patches.length) out.push(say("describe-none", {}));
  for (const p of d.patches) {
    const f = p.files[p.project], db = p.database === null ? null : p.files[p.database];
    out.push(say("describe-patch", { project: f.name, top: yes(!f.place), place: f.place, database: db ? db.name : "none", moment: p.moment.name }));
  }
  out.push(say("describe-carried", {}));
  if (!d.carried.length) out.push(say("describe-none", {}));
  for (const c of d.carried) out.push(say("describe-carried-file", { name: c.name, why: c.why }));
  const id = d.identity;
  out.push(say("describe-identity", {
    hash: id.hash, withoutPlugins: id.withoutPlugins, lines: id.lines.length, plugins: Object.keys(id.plugins).length,
    older: id.older?.hash ?? "none", beforeCode: id.beforeCode ?? "none", declared: id.declared?.hash ?? "none", code: yes(id.code), startup: yes(id.readsStartupData),
  }));
  for (const s of d.said) out.push(say("describe-said", { said: s }));
  return out;
}

/** The description in plain lines: English, or each line through `translate`. */
export function descriptionText(d: ModDescription, translate?: Translate): string[] {
  return descriptionLines(d).map((m) => renderMessage(m, translate));
}
