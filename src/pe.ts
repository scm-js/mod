/**
 * A Windows program or library read from its bytes, never run: where its own bytes end (an overlay starts there), the
 * name it gives itself, what it exports and imports. What a mod's reader needs to tell a module's role and the
 * interface a loader enters it by from the module itself rather than from its file name.
 */

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** The PE header's place, or null when the bytes are no Windows image. */
function peAt(b: Uint8Array): number | null {
  if (b.length < 64 || b[0] !== 0x4d || b[1] !== 0x5a) return null;
  const pe = view(b).getUint32(0x3c, true);
  return pe + 24 <= b.length && view(b).getUint32(pe, true) === 0x00004550 ? pe : null;
}

/** Where a Windows program's own bytes end (after its last section): the overlay starts there. Null when it is no program. */
export function programEnd(b: Uint8Array): number | null {
  const pe = peAt(b);
  if (pe === null) return null;
  const v = view(b);
  const sections = v.getUint16(pe + 6, true), optional = v.getUint16(pe + 20, true), table = pe + 24 + optional;
  let end = table + sections * 40;
  for (let i = 0; i < sections; i++) {
    const s = table + i * 40;
    if (s + 40 > b.length) return null;
    const raw = v.getUint32(s + 16, true), at = v.getUint32(s + 20, true);
    if (raw && at + raw > end) end = at + raw;
  }
  return Math.min(end, b.length);
}

/** An image's sections and data directories, enough to turn an RVA into a place in the file. */
interface Image { v: DataView; b: Uint8Array; dirs: number; dirCount: number; table: number; sections: number }

function image(b: Uint8Array): Image | null {
  const pe = peAt(b);
  if (pe === null) return null;
  const v = view(b), optional = pe + 24, magic = v.getUint16(optional, true);
  if (optional + (magic === 0x20b ? 112 : 96) > b.length) return null;
  return { v, b, dirs: optional + (magic === 0x20b ? 112 : 96), dirCount: v.getUint32(optional + (magic === 0x20b ? 108 : 92), true), table: optional + v.getUint16(pe + 20, true), sections: v.getUint16(pe + 6, true) };
}

function offsetOf(im: Image, rva: number): number | null {
  for (let i = 0; i < im.sections; i++) {
    const s = im.table + i * 40;
    if (s + 40 > im.b.length) return null;
    const va = im.v.getUint32(s + 12, true), raw = im.v.getUint32(s + 16, true), at = im.v.getUint32(s + 20, true);
    if (rva >= va && rva < va + raw) return at + rva - va;
  }
  return null;
}

function cString(b: Uint8Array, at: number | null, max = 260): string | null {
  if (at === null || at >= b.length) return null;
  let end = at;
  while (end < b.length && end - at < max && b[end] !== 0) end++;
  const text = String.fromCharCode(...b.subarray(at, end));
  return /^[\x20-\x7e]+$/.test(text) ? text : null;
}

/** A data directory's place in the file and size, or null. */
function directory(im: Image, k: number): { at: number; rva: number; size: number } | null {
  if (im.dirCount <= k) return null;
  const rva = im.v.getUint32(im.dirs + 8 * k, true), size = im.v.getUint32(im.dirs + 8 * k + 4, true);
  const at = rva ? offsetOf(im, rva) : null;
  return at === null ? null : { at, rva, size };
}

/** What a library exports by name, and the name it gives itself in its export directory. */
export interface PeExports { self: string | null; names: string[]; /** Where the names' strings lie in the file. */ spans: [number, number][] }

export function exportsOf(b: Uint8Array): PeExports | null {
  try {
    const im = image(b);
    if (!im) return null;
    const dir = directory(im, 0);
    if (!dir || dir.at + 40 > b.length) return { self: null, names: [], spans: [] };
    const v = im.v, selfAt = offsetOf(im, v.getUint32(dir.at + 12, true));
    const self = cString(b, selfAt);
    const count = Math.min(v.getUint32(dir.at + 24, true), 65536), namesAt = offsetOf(im, v.getUint32(dir.at + 32, true));
    const names: string[] = [], spans: [number, number][] = [];
    if (self && selfAt !== null) spans.push([selfAt, selfAt + self.length]);
    for (let k = 0; namesAt !== null && k < count && namesAt + 4 * k + 4 <= b.length; k++) {
      const at = offsetOf(im, v.getUint32(namesAt + 4 * k, true)), name = cString(b, at, 512);
      if (name && at !== null) { names.push(name); spans.push([at, at + name.length]); }
    }
    return { self, names, spans };
  } catch { return null; }
}

/**
 * The name a Windows library gives itself in its export directory (`GPTP.qdp`), or null when it has none or the bytes
 * are no library. An MPQDraft plugin exports `GetMPQDraftPlugin`, so it has one.
 */
export const libraryName = (b: Uint8Array): string | null => exportsOf(b)?.self ?? null;

/** What an image imports: each DLL (as written, any case) and the functions by name (an ordinal as `#n`). */
export function importsOf(b: Uint8Array): { dll: string; names: string[] }[] {
  try {
    const im = image(b);
    if (!im) return [];
    const dir = directory(im, 1);
    if (!dir) return [];
    const v = im.v, out: { dll: string; names: string[] }[] = [];
    for (let d = dir.at; d + 20 <= b.length && out.length < 512; d += 20) {
      const lookup = v.getUint32(d, true), nameRva = v.getUint32(d + 12, true), thunks = v.getUint32(d + 16, true);
      if (!nameRva && !thunks) break;
      const dll = cString(b, offsetOf(im, nameRva));
      if (!dll) continue;
      const names: string[] = [];
      let t = offsetOf(im, lookup || thunks);
      for (let k = 0; t !== null && t + 4 <= b.length && k < 8192; k++, t += 4) {
        const e = v.getUint32(t, true);
        if (!e) break;
        if (e & 0x80000000) names.push(`#${e & 0xffff}`);
        else { const n = cString(b, (offsetOf(im, e) ?? -3) + 2, 512); if (n) names.push(n); }
      }
      out.push({ dll, names });
    }
    return out;
  } catch { return []; }
}

/** Whether `text` stands in the bytes as a string of its own (a zero byte before and after), outside `except` (file spans). */
export function holdsString(b: Uint8Array, text: string, except: readonly [number, number][] = []): boolean {
  const t = [...text].map((c) => c.charCodeAt(0));
  for (let at = b.indexOf(t[0], 1); at >= 1 && at + t.length < b.length; at = b.indexOf(t[0], at + 1)) {
    if (b[at - 1] !== 0 || b[at + t.length] !== 0) continue;
    let k = 1;
    while (k < t.length && b[at + k] === t[k]) k++;
    if (k === t.length && !except.some(([lo, hi]) => at >= lo && at < hi)) return true;
  }
  return false;
}
