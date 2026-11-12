/**
 * The self-executing forms a mod is shipped as, opened without running anything: the program is never run, and nothing of it is kept but the archive and the modules it carries.
 *
 * - **FireGraft's patcher** ("FG Patcher"): the program, then an overlay; where it starts is kept in the program's own
 *   header (the u32 at 0x18, which the program reads to find it), and it is `PEGF`, u32 count, u32 1, then for each
 *   plugin u32 id, u32 size, u32 0 and that many bytes of the plugin, one after the other; then the archive, at a
 *   512-byte boundary after the last plugin, where storm finds it. Every patcher exe held so far is this program
 *   (two builds), with 0, 1 or 2 plugins.
 * - **MPQDraft's self-executing MPQ** (SEMPQ, MPQDraft's `src/sempq/`): a stub program, then an Embedded File System
 *   (`EFS `, found by looking at every 512 bytes, MPQDraft's `QResource.cpp`): a header of eight words (the mark,
 *   version 1, the EFS's size, where its directory is and how many entries, from the header), the files end to end,
 *   then the directory, entries of six words (component id, file id, `bExecute`, offset from the header, size, flags).
 *   MPQDraft's own patcher DLL is component 0x2F0B5F48, file 0xA0FCC4E7 (not executed: the stub loads it); each plugin
 *   is an entry with `bExecute` set, its data files entries without. Then the archive, at a 512-byte boundary: the
 *   SEMPQ itself is the one archive the stub hands MPQDraft's patcher.
 * - Neither: an exe with an archive where storm would look for one (at 512-byte boundaries after the program, or
 *   anywhere after it), read as that archive.
 */
import { libraryName, programEnd } from "./pe.ts";
import { ModError, say } from "./messages.ts";

/** "MPQ\x1A", the archive header's mark, as a little-endian word. */
const MPQ_MAGIC = 0x1a51504d;
/** "MPQ\x1B", a user-data header that says where the archive header is. */
const MPQ_USER = 0x1b51504d;
/** "PEGF", FireGraft's patcher overlay. */
const PEGF = 0x46474550;
/** Where FireGraft's patcher keeps its overlay's offset: the u32 at 0x18 of its own header, which its program reads. */
const OVERLAY_AT = 0x18;
/** The overlay's second word in every patcher seen (five, two builds of the program): its form. */
const OVERLAY_FORM = 1;
/** "EFS ", MPQDraft's Embedded File System, and its one version. */
const EFS = 0x20534645;
const EFS_VERSION = 1;
/** MPQDraft's own patcher DLL in an EFS (MPQDraft's `PatcherFlags.h`: `MPQDRAFT_COMPONENT`, `MPQDRAFTDLL_MODULE`). */
export const MPQDRAFT_COMPONENT = 0x2f0b5f48, MPQDRAFT_DLL_MODULE = 0xa0fcc4e7;

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/**
 * Whether an archive header storm would read starts at `at`. A version 0 header's own size is not believed (patchers
 * write 0xFFFFFFFF there), so it is told by its tables: their positions, the header's plus theirs modulo 2^32, must
 * fall inside the file (a header whose tables lie elsewhere is a fake one). A later version's size and format are the
 * known ones.
 */
function mpqHeaderAt(b: Uint8Array, at: number): boolean {
  if (at < 0 || at + 32 > b.length) return false;
  const v = view(b);
  if (v.getUint32(at, true) !== MPQ_MAGIC) return false;
  const size = v.getUint32(at + 4, true), version = v.getUint16(at + 12, true);
  if (version === 0) return (at + v.getUint32(at + 16, true)) % 0x100000000 < b.length && (at + v.getUint32(at + 20, true)) % 0x100000000 < b.length;
  return size >= 32 && size <= 0xd0 && version <= 3;
}

/** A module a self-executing exe carries, as its loader takes it. */
export interface CarriedModule {
  /** FireGraft's overlay: the id it gives (the plugin's MPQDraft id). An EFS: the component id. */
  id: number;
  /** An EFS entry's file id (0 for a plugin, as MPQDraft numbers a plugin's own DLL); null in FireGraft's overlay. */
  file: number | null;
  /** Whether the loader runs it: every plugin of FireGraft's overlay; an EFS entry with `bExecute`. */
  execute: boolean;
  /** Where its bytes start in the exe, and how many. */
  at: number;
  size: number;
  /** The name its export directory gives (`GPTP.qdp`), or null. */
  name: string | null;
  /** Its bytes (a view into the exe's). */
  bytes: Uint8Array;
}

/** A patcher's overlay or file system in a form this reader does not know, or one that does not hold together: `detail` says how. */
export class PatcherError extends ModError {}

/** Which self-executing form an exe is. */
export type ExeForm = "firegraft-patcher" | "mpqdraft-sempq" | "archive-after-program";

export interface ExeArchive {
  /**
   * The whole exe. The archive in it is opened as `Archive.open(bytes, { offset: at })`: its tables may lie before its
   * header (positions are the header's plus theirs modulo 2^32), and a slice from the header on cannot reach them.
   */
  bytes: Uint8Array;
  /** Where in the exe its archive's header is. */
  at: number;
  form: ExeForm;
  /** The plugins FireGraft's patcher carries, in the order it loads them; an SEMPQ's EFS entries, in its order (MPQDraft's own DLL among them). */
  plugins: CarriedModule[];
}

/** FireGraft's patcher overlay: where it is, its plugins and where they end. Null when the exe has none. Throws `PatcherError`. */
function patcherOverlay(b: Uint8Array, end: number): { plugins: CarriedModule[]; after: number } | null {
  const v = view(b);
  // Where the program reads it: its header's word at 0x18. Else at the program's end or a little after (some linkers pad).
  let at = -1;
  const said = v.getUint32(OVERLAY_AT, true);
  if (said >= end && said + 12 <= b.length && v.getUint32(said, true) === PEGF) at = said;
  else for (let p = end; p + 12 <= b.length && p < end + 4096; p++) if (v.getUint32(p, true) === PEGF) { at = p; break; }
  if (at < 0) return null;
  const count = v.getUint32(at + 4, true), form = v.getUint32(at + 8, true);
  if (form !== OVERLAY_FORM) throw new PatcherError(say("overlay-form", { at, form, known: OVERLAY_FORM }));
  if (count > 256) throw new PatcherError(say("overlay-count", { at, count }));
  const plugins: CarriedModule[] = [];
  let p = at + 12;
  for (let i = 0; i < count; i++) {
    if (p + 12 > b.length) throw new PatcherError(say("overlay-cut", { count, read: i }));
    const id = v.getUint32(p, true), size = v.getUint32(p + 4, true), zero = v.getUint32(p + 8, true);
    const from = p + 12;
    if (zero !== 0) throw new PatcherError(say("overlay-word", { n: i + 1, at: p, value: zero }));
    if (from + size > b.length) throw new PatcherError(say("overlay-plugin-cut", { n: i + 1, size, left: b.length - from }));
    const bytes = b.subarray(from, from + size);
    if (size < 2 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) throw new PatcherError(say("overlay-plugin-not-library", { n: i + 1, at: from }));
    plugins.push({ id, file: null, execute: true, at: from, size, name: libraryName(bytes), bytes });
    p = from + size;
  }
  return { plugins, after: p };
}

/**
 * MPQDraft's Embedded File System after the program, as its stub finds it (every 512 bytes, the mark, version 1, its
 * size and directory inside the file), or null. Its entries in the directory's order.
 */
function efsAt(b: Uint8Array, end: number): { entries: CarriedModule[]; after: number } | null {
  const v = view(b);
  for (let at = Math.ceil(end / 512) * 512; at + 32 <= b.length; at += 512) {
    if (v.getUint32(at, true) !== EFS || v.getUint32(at + 4, true) !== EFS_VERSION) continue;
    const size = v.getUint32(at + 8, true), dir = v.getUint32(at + 12, true), count = v.getUint32(at + 16, true);
    if (at + size > b.length || at + dir + count * 24 > b.length || count > 4096) continue;
    const entries: CarriedModule[] = [];
    for (let k = 0; k < count; k++) {
      const e = at + dir + k * 24;
      const id = v.getUint32(e, true), file = v.getUint32(e + 4, true), execute = v.getUint32(e + 8, true) !== 0, off = v.getUint32(e + 12, true), n = v.getUint32(e + 16, true);
      if (at + off + n > b.length) throw new PatcherError(say("efs-entry-cut", { n: k + 1, at }));
      const bytes = b.subarray(at + off, at + off + n);
      entries.push({ id, file, execute, at: at + off, size: n, name: bytes[0] === 0x4d && bytes[1] === 0x5a ? libraryName(bytes) : null, bytes });
    }
    return { entries, after: at + size };
  }
  return null;
}

function find(b: Uint8Array, from: number): number {
  for (let at = from; at + 32 <= b.length; at++) if (b[at] === 0x4d && b[at + 1] === 0x50 && b[at + 2] === 0x51 && b[at + 3] === 0x1a && mpqHeaderAt(b, at)) return at;
  return -1;
}

/** Where storm would find an archive after `from`: at 512-byte boundaries (a user-data header says where its archive is), else anywhere. */
function archiveAfter(b: Uint8Array, from: number): number {
  const v = view(b);
  for (let at = Math.ceil(from / 512) * 512; at + 32 <= b.length; at += 512) {
    if (v.getUint32(at, true) === MPQ_USER && at + 12 <= b.length) { const real = at + v.getUint32(at + 8, true); if (mpqHeaderAt(b, real)) return real; }
    if (mpqHeaderAt(b, at)) return at;
  }
  return find(b, from);
}

/**
 * The mod archive inside a self-executing exe, or null when there is none (an exe that is only a program). A FireGraft
 * patcher's overlay is read as its program reads it, its archive looked for after its plugins; an SEMPQ's file system
 * as its stub reads it, its archive after it; else an archive where storm looks. A patcher overlay in a form not known,
 * or one with no archive after it, throws `PatcherError`.
 */
export function exeArchive(b: Uint8Array): ExeArchive | null {
  const end = programEnd(b);
  if (end === null) return null;
  const overlay = patcherOverlay(b, end);
  if (overlay) {
    // (storm looks at 512-byte boundaries; the archive's tables may come first, between the plugins and its header)
    let mpq = -1;
    for (let at = Math.ceil(overlay.after / 512) * 512; at + 32 <= b.length; at += 512) if (mpqHeaderAt(b, at)) { mpq = at; break; }
    if (mpq < 0) mpq = find(b, overlay.after);
    if (mpq < 0) throw new PatcherError(say("patcher-no-archive", { plugins: overlay.plugins.length }));
    return { bytes: b, at: mpq, form: "firegraft-patcher", plugins: overlay.plugins };
  }
  const efs = efsAt(b, end);
  if (efs) {
    const at = archiveAfter(b, efs.after);
    if (at < 0) throw new PatcherError(say("sempq-no-archive", { files: efs.entries.length }));
    return { bytes: b, at, form: "mpqdraft-sempq", plugins: efs.entries };
  }
  const at = archiveAfter(b, end);
  return at < 0 ? null : { bytes: b, at, form: "archive-after-program", plugins: [] };
}

/**
 * An archive in bytes that are no Windows program (an `.exe` that is not one): where storm would look for one in any
 * file it is asked to open, at 512-byte boundaries from the start, else anywhere. -1 for none.
 */
export const archiveInFile = (b: Uint8Array): number => archiveAfter(b, 0);

/** Whether the bytes are a Windows program (or library): an image this reader can find the end of. */
export const isExe = (b: Uint8Array): boolean => programEnd(b) !== null;

/** Whether the bytes are an MPQ archive from their first byte (a mod's `.mpq`). */
export const isMpq = (b: Uint8Array): boolean => b.length >= 32 && (view(b).getUint32(0, true) === MPQ_MAGIC || view(b).getUint32(0, true) === MPQ_USER);
