/**
 * `@scm-js/mod/node`: a mod on a disk as a tree of files for `readMod`. A folder (its files under the folder's own
 * name, as a browser hands a dropped folder over), or a file the person named (an exe, an `.mpq`, a zip), with the
 * DLLs beside it in its folder, which Windows finds beside a program. It lists once and reads when asked, and can also
 * read synchronously (`readSync`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { readMod, type ModDescription, type ReadOptions, type UnhashedDescription } from "./mod.ts";
import type { ModEntry, ModFiles } from "./files.ts";
import { ModReadError, say } from "./messages.ts";

export interface DiskFiles extends ModFiles {
  /** The folder or file given, on the disk (absolute). */
  root: string;
  /** The file on the disk a path of the tree is. */
  diskPath(path: string): string;
  readSync(path: string): Uint8Array;
}

/**
 * `path` (a folder, or a file) as a tree of files. A folder is walked in the order of its names (byte-wise, so a tree
 * is listed alike on every disk); folders whose names start with a dot (`.git`) are not walked, as `readMod` leaves
 * them out.
 */
export function diskFiles(path: string): DiskFiles {
  const full = resolve(path);
  const isDir = statSync(full).isDirectory();
  const top = basename(full);
  const entries: ModEntry[] = [];
  const disk = new Map<string, string>();
  const add = (tree: string, file: string, size: number) => { entries.push({ path: tree, size }); disk.set(tree, file); };
  if (isDir) {
    const walk = (dir: string, rel: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        const f = join(dir, e.name), t = `${rel}/${e.name}`;
        if (e.isDirectory()) { if (!e.name.startsWith(".")) walk(f, t); }
        else if (e.isFile()) add(t, f, statSync(f).size);
      }
    };
    walk(full, top);
  } else {
    add(top, full, statSync(full).size);
    // (a program's folder: the DLLs Windows finds beside it)
    if (/\.exe$/i.test(top)) {
      for (const e of readdirSync(dirname(full), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        if (e.isFile() && /\.dll$/i.test(e.name)) add(e.name, join(dirname(full), e.name), statSync(join(dirname(full), e.name)).size);
      }
    }
  }
  const name = isDir ? top : top.replace(/\.(mpq|exe|zip)$/i, "");
  const diskPath = (p: string) => { const f = disk.get(p); if (!f) throw new ModReadError(say("not-in-tree", { path: p, name })); return f; };
  return {
    name,
    ...(isDir ? {} : { named: top }),
    list: async () => entries,
    read: async (p) => bytesOf(readFileSync(diskPath(p))),
    readSync: (p) => bytesOf(readFileSync(diskPath(p))),
    diskPath, root: full,
  };
}

/**
 * A file's bytes as a plain `Uint8Array` that owns its whole buffer, as `read` has always given them: the bytes Node
 * read when they are a buffer of their own (every file but a small one), so a large archive is not held twice while it
 * is copied; a copy of a small file, which Node reads into a buffer shared with others.
 */
const bytesOf = (b: Buffer): Uint8Array => (b.byteOffset === 0 && b.byteLength === b.buffer.byteLength ? new Uint8Array(b.buffer, 0, b.byteLength) : new Uint8Array(b));

/** The mod at `path` read (`readMod`), with the tree it was read from. */
export function readModAt(path: string, o: ReadOptions & { hashFiles: false }): Promise<{ description: UnhashedDescription; files: DiskFiles }>;
export function readModAt(path: string, o?: ReadOptions & { hashFiles?: true }): Promise<{ description: ModDescription; files: DiskFiles }>;
export function readModAt(path: string, o?: ReadOptions): Promise<{ description: ModDescription | UnhashedDescription; files: DiskFiles }>;
export async function readModAt(path: string, o: ReadOptions = {}): Promise<{ description: ModDescription | UnhashedDescription; files: DiskFiles }> {
  const files = diskFiles(path);
  return { description: await readMod(files, o), files };
}
