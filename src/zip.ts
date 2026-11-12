/**
 * A zip of a mod's files: the common "stored" and "deflate" members, read from the central directory, inflated with
 * the platform's `DecompressionStream("deflate-raw")` (the Compression Streams standard: in every browser and in Node).
 * No zip64, no encryption: such a zip is refused in words. `zipFiles` is the zip as a tree of files for `readMod`.
 */
import type { ModFiles } from "./files.ts";
import { ModError, ModReadError, say } from "./messages.ts";

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** Whether the bytes are a zip (its first member's local header). */
export const isZip = (b: Uint8Array): boolean => b.length >= 22 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5);

export interface ZipMember {
  /** The member's path in the zip, with forward slashes. */
  path: string;
  size: number;
  read(): Promise<Uint8Array>;
}

/** Why a zip could not be read: `detail` says how. */
export class ZipError extends ModError {}

/** The files in a zip (folders left out). */
export function readZip(b: Uint8Array): ZipMember[] {
  const v = view(b);
  // The end of the central directory: 22 bytes, maybe followed by a comment of up to 64 KB.
  let eocd = -1;
  for (let at = b.length - 22; at >= Math.max(0, b.length - 22 - 0xffff); at--) if (v.getUint32(at, true) === 0x06054b50) { eocd = at; break; }
  if (eocd < 0) throw new ZipError(say("zip-cut", {}));
  const count = v.getUint16(eocd + 10, true), dirAt = v.getUint32(eocd + 16, true);
  if (count === 0xffff || dirAt === 0xffffffff) throw new ZipError(say("zip64", {}));
  const out: ZipMember[] = [];
  let at = dirAt;
  for (let i = 0; i < count; i++) {
    if (at + 46 > b.length || v.getUint32(at, true) !== 0x02014b50) throw new ZipError(say("zip-damaged", {}));
    const flags = v.getUint16(at + 8, true), method = v.getUint16(at + 10, true);
    const packed = v.getUint32(at + 20, true), size = v.getUint32(at + 24, true);
    const nameLength = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), comment = v.getUint16(at + 32, true);
    const local = v.getUint32(at + 42, true);
    const raw = b.subarray(at + 46, at + 46 + nameLength);
    const path = ((flags & 0x800) ? new TextDecoder().decode(raw) : String.fromCharCode(...raw)).replace(/\\/g, "/");
    at += 46 + nameLength + extra + comment;
    if (path.endsWith("/")) continue;
    if (flags & 1) throw new ZipError(say("zip-encrypted", { path }));
    if (method !== 0 && method !== 8) throw new ZipError(say("zip-method", { path, method }));
    out.push({
      path, size,
      read: async () => {
        if (local + 30 > b.length || v.getUint32(local, true) !== 0x04034b50) throw new ZipError(say("zip-member-damaged", { path }));
        const from = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
        const data = b.subarray(from, from + packed);
        if (method === 0) return data;
        const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
        if (bytes.length !== size) throw new ZipError(say("zip-member-size", { path, got: bytes.length, size }));
        return bytes;
      },
    });
  }
  return out;
}

/** A zip's members as a tree of files, under `prefix/` (the zip's name without `.zip`, as `readMod` lays a zip it opens). */
export function zipFiles(name: string, bytes: Uint8Array, prefix = name.replace(/\.zip$/i, "")): ModFiles {
  const members = readZip(bytes), byPath = new Map(members.map((m) => [`${prefix}/${m.path}`, m]));
  return {
    name: name.replace(/\.zip$/i, ""),
    list: async () => [...byPath].map(([path, m]) => ({ path, size: m.size })),
    read: async (path) => { const m = byPath.get(path); if (!m) throw new ModReadError(say("not-in-tree", { path, name })); return m.read(); },
  };
}
