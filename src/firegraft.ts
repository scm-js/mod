/**
 * Which FireGraft project and database a mod applies, and when FireGraft's patcher applies them. One pick for every
 * caller: the project is the first `.fgp` found (loose files before an archive's, an archive's in its list's order); its
 * database is the one for the game's version, as FireGraft keeps one database a version of the game named by the
 * version (`114a.fgd`, `115a.fgd`, …, `1161.fgd` for 1.16.1: a patcher's datalist may list several), in
 * the project's own place first; else the first `.fgd`. FireGraft's own list (`firegraft\datalist.txt`) is what finds
 * them in an archive that has no list of its names.
 */

/** The names FireGraft's patcher reads from its archive (its program's own strings): its lists of the project's files,
 *  buttons, requirements and plugins. `Firegraft\datalist.txt` names the project and its databases. */
export const FIREGRAFT_LISTS = ["firegraft\\datalist.txt", "firegraft\\actlist.txt", "firegraft\\displist.txt", "firegraft\\reqlist.txt", "firegraft\\statlist.txt", "plugins\\pluginlist.txt"] as const;

/** The moment FireGraft's patcher writes its project: when the game first opens this file. */
export const FIREGRAFT_MOMENT = { at: "file-open", name: "font\\font8.fnt" } as const;

/** The names a FireGraft list (`datalist.txt`) gives, one a line. */
export const listedNames = (text: Uint8Array | null): string[] => text ? new TextDecoder("latin1").decode(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];

/** The database FireGraft names for 1.16.1, the game the loaders are for. */
const DATABASE_116 = /1161\.fgd$/i;

/**
 * The project and the database among `found` (each a FireGraft file with its file name and where it came from, in the
 * order found): indexes into `found`, null for none.
 */
export function firegraftPick(found: readonly { name: string; place: string }[]): { project: number | null; database: number | null } {
  const project = found.findIndex((f) => /\.fgp$/i.test(f.name));
  if (project < 0) return { project: null, database: null };
  const fgd = (test: (f: { name: string; place: string }) => boolean) => found.findIndex((f) => /\.fgd$/i.test(f.name) && test(f));
  let database = fgd((f) => f.place === found[project].place && DATABASE_116.test(f.name));
  if (database < 0) database = fgd((f) => DATABASE_116.test(f.name));
  if (database < 0) database = fgd(() => true);
  return { project, database: database < 0 ? null : database };
}
