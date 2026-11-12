/**
 * What a module (a PE image a mod ships: a plugin, a library, a network provider) is, told from its bytes: the
 * interface a loader enters it by, from what it exports, and whether it is itself a loader of plugins, from what it asks
 * for. Never from its file name: a patcher's overlay calls one plugin `qdp.dll`, and a mod may name its files anything.
 */
import { exportsOf, holdsString, importsOf } from "./pe.ts";
import { say, type ModMessage } from "./messages.ts";

/**
 * How a loader enters a module:
 * - `mpqdraft`: MPQDraft's plugin interface, `GetMPQDraftPlugin` → `InitializePlugin(server)` (MPQDraft, FireGraft's
 *   patcher, a plugin that loads plugins all call it);
 * - `bwl`: Chaoslauncher's (`GetPluginAPI`, `ApplyPatchSuspended`), which patches the game from another process;
 * - `snp`: a storm network provider (`SnpBind`, `SnpQuery`), loaded by storm when its mode is chosen;
 * - `dllmain`: a Windows image with none of these: its `DllMain` alone, run when something loads it;
 * - `none`: bytes that are no Windows image, so nothing can enter them.
 */
export type ModuleEntry = "mpqdraft" | "bwl" | "snp" | "dllmain" | "none";

export interface ModuleFacts {
  entry: ModuleEntry;
  /** The name its export directory gives it (`GPTP.qdp`), or null. */
  self: string | null;
  /** It exports `samase_plugin_init` too: on 1.16.1 it sets itself up in a hook on WinMain's call. */
  samase: boolean;
  /**
   * It loads other plugins: it imports `LoadLibrary` and holds `GetMPQDraftPlugin` as a string of its own beside its
   * export (the name it asks `GetProcAddress` for in each module it loads), as a plugin that loads a folder of plugins
   * does.
   */
  loadsPlugins: boolean;
}

const MPQDRAFT_ENTRY = "GetMPQDraftPlugin";

export function moduleFacts(b: Uint8Array): ModuleFacts {
  const ex = exportsOf(b);
  if (!ex) return { entry: "none", self: null, samase: false, loadsPlugins: false };
  const has = (n: string) => ex.names.includes(n);
  const entry: ModuleEntry = has(MPQDRAFT_ENTRY) ? "mpqdraft" : has("GetPluginAPI") && has("ApplyPatchSuspended") ? "bwl" : has("SnpBind") ? "snp" : "dllmain";
  const loads = importsOf(b).some((d) => /^kernel32(\.dll)?$/i.test(d.dll) && d.names.some((n) => /^LoadLibrary(Ex)?[AW]$/.test(n)));
  return { entry, self: ex.self, samase: has("samase_plugin_init"), loadsPlugins: loads && holdsString(b, MPQDRAFT_ENTRY, ex.spans) };
}

/** The interface in words, for a description printed or a sentence. */
export const ENTRY_WORDS: Readonly<Record<ModuleEntry, ModMessage>> = {
  mpqdraft: /* @__PURE__ */ say("entry-mpqdraft", {}),
  bwl: /* @__PURE__ */ say("entry-bwl", {}),
  snp: /* @__PURE__ */ say("entry-snp", {}),
  dllmain: /* @__PURE__ */ say("entry-dllmain", {}),
  none: /* @__PURE__ */ say("entry-none", {}),
};
