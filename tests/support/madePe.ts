// PE images made in a test (no compiler, no game or plugin bytes): a DLL file with one section, its exports and its
// imports.

export interface DllSpec {
  base: number;
  /** Code and data at RVAs of the one section (0x1000 on). */
  bytes: [number, number[]][];
  entry?: number;
  exports?: { name?: string; ordinal: number; rva?: number; forward?: string }[];
  imports?: { dll: string; names: (string | number)[] }[];
  /** RVAs of words holding an address of the image (moved by the loader where the image is mapped elsewhere): a `.reloc` block at RVA 0x1F00. */
  relocs?: number[];
}
/**
 * A DLL file: headers, one section at RVA 0x1000 (0x1000 bytes, code and data, read write execute) holding the code,
 * the import tables at +0xC00 and the export directory at +0xA00. The IAT slot of the k-th import of the d-th DLL is
 * returned (`slot(d, k)`, an RVA), and the file itself.
 */
export function dll(spec: DllSpec): { file: Uint8Array; slot: (d: number, k: number) => number } {
  const file = new Uint8Array(0x1400), v = new DataView(file.buffer);
  file[0] = 0x4d; file[1] = 0x5a; v.setUint32(0x3c, 0x80, true);
  const e = 0x80; v.setUint32(e, 0x4550, true); v.setUint16(e + 4, 0x14c, true); v.setUint16(e + 6, 1, true); v.setUint16(e + 20, 0xe0, true); v.setUint16(e + 22, 0x2102, true);
  const opt = e + 24; v.setUint16(opt, 0x10b, true); v.setUint32(opt + 16, spec.entry ?? 0, true); v.setUint32(opt + 28, spec.base, true);
  v.setUint32(opt + 32, 0x1000, true); v.setUint32(opt + 36, 0x200, true); v.setUint32(opt + 56, 0x2000, true); v.setUint32(opt + 60, 0x400, true); v.setUint32(opt + 92, 16, true);
  const s = opt + 0xe0; ".text".split("").forEach((c, k) => { file[s + k] = c.charCodeAt(0); });
  v.setUint32(s + 8, 0x1000, true); v.setUint32(s + 12, 0x1000, true); v.setUint32(s + 16, 0x1000, true); v.setUint32(s + 20, 0x400, true); v.setUint32(s + 36, 0xE0000060, true);
  const at = (rva: number) => 0x400 + rva - 0x1000;
  for (const [rva, b] of spec.bytes) file.set(b, at(rva));
  const str = (rva: number, t: string) => { for (let k = 0; k < t.length; k++) file[at(rva) + k] = t.charCodeAt(k); file[at(rva) + t.length] = 0; };
  // exports: directory at 0x1A00, functions at 0x1A40, names at 0x1A80, ordinals at 0x1AC0, strings from 0x1B00
  if (spec.exports?.length) {
    const ex = spec.exports, ordBase = Math.min(...ex.map((x) => x.ordinal)), n = Math.max(...ex.map((x) => x.ordinal)) - ordBase + 1;
    const named = ex.filter((x) => x.name).sort((a, b) => (a.name! < b.name! ? -1 : 1));
    let sp = 0x1B00;
    const put = (t: string) => { const r = sp; str(r, t); sp += t.length + 1; return r; };
    v.setUint32(at(0x1A00) + 12, put("made.dll"), true); v.setUint32(at(0x1A00) + 16, ordBase, true); v.setUint32(at(0x1A00) + 20, n, true); v.setUint32(at(0x1A00) + 24, named.length, true);
    v.setUint32(at(0x1A00) + 28, 0x1A40, true); v.setUint32(at(0x1A00) + 32, 0x1A80, true); v.setUint32(at(0x1A00) + 36, 0x1AC0, true);
    for (const x of ex) v.setUint32(at(0x1A40) + 4 * (x.ordinal - ordBase), x.forward ? put(x.forward) : x.rva!, true);
    named.forEach((x, k) => { v.setUint32(at(0x1A80) + 4 * k, put(x.name!), true); v.setUint16(at(0x1AC0) + 2 * k, x.ordinal - ordBase, true); });
    v.setUint32(opt + 96, 0x1A00, true); v.setUint32(opt + 100, 0x200, true);
  }
  // imports: descriptors at 0x1C00, then per DLL a lookup table and an address table of 8 slots each, names after
  const slots: number[][] = [];
  if (spec.imports?.length) {
    let sp = 0x1E00;
    const put = (t: string) => { const r = sp; str(r, t); sp += t.length + 1; return r; };
    spec.imports.forEach((d, i) => {
      const ilt = 0x1C80 + 0x40 * i, iat = ilt + 0x20, desc = at(0x1C00) + 20 * i;
      v.setUint32(desc, ilt, true); v.setUint32(desc + 12, put(d.dll), true); v.setUint32(desc + 16, iat, true);
      slots.push([]);
      d.names.forEach((n, k) => {
        const val = typeof n === "number" ? (0x80000000 | n) >>> 0 : (() => { sp += 2; const r = sp - 2; str(r + 2, n); sp += n.length + 1; return r; })();
        v.setUint32(at(ilt) + 4 * k, val, true); v.setUint32(at(iat) + 4 * k, val, true); slots[i].push(iat + 4 * k);
      });
    });
    v.setUint32(opt + 104, 0x1C00, true); v.setUint32(opt + 108, 20 * (spec.imports.length + 1), true);
  }
  if (spec.relocs?.length) {
    const n = spec.relocs.length + (spec.relocs.length & 1), size = 8 + 2 * n;
    v.setUint32(at(0x1F00), 0x1000, true); v.setUint32(at(0x1F00) + 4, size, true);
    spec.relocs.forEach((r, k) => v.setUint16(at(0x1F00) + 8 + 2 * k, (3 << 12) | (r - 0x1000), true));
    v.setUint32(opt + 136, 0x1F00, true); v.setUint32(opt + 140, size, true);
  }
  return { file, slot: (d, k) => slots[d][k] };
}
