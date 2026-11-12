// A zip made for the tests: each member stored, or deflated with `deflate` (a test passes node:zlib's).
import { concat } from "./patcherExe.ts";

const text = (s: string) => new TextEncoder().encode(s);

/** A zip of `files` (stored), or of members each with its method and packed bytes. */
export function madeZip(files: Record<string, Uint8Array | { method: number; data: Uint8Array; size: number }>): Uint8Array {
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
  let at = 0;
  for (const [name, given] of Object.entries(files)) {
    const e = given instanceof Uint8Array ? { method: 0, data: given, size: given.length } : given;
    const n = text(name), local = new Uint8Array(30), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, e.method, true); lv.setUint32(18, e.data.length, true); lv.setUint32(22, e.size, true); lv.setUint16(26, n.length, true);
    const central = new Uint8Array(46), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, e.method, true); cv.setUint32(20, e.data.length, true); cv.setUint32(24, e.size, true); cv.setUint16(28, n.length, true); cv.setUint32(42, at, true);
    locals.push(local, n, e.data); centrals.push(central, n);
    at += 30 + n.length + e.data.length;
  }
  const dir = concat(...centrals), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, centrals.length / 2, true); ev.setUint16(10, centrals.length / 2, true); ev.setUint32(12, dir.length, true); ev.setUint32(16, at, true);
  return concat(...locals, dir, end);
}
