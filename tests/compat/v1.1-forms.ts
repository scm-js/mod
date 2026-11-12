// The ways to read without hashing (1.1), held apart from `ReadOptions` so that a value of that type always gives a
// `ModDescription` (`v1.0-callers.ts`): type-checked, never run. Each `@ts-expect-error` fails the check when the line
// below it compiles.
import { readMod, type HashChoiceReadOptions, type ModDescription, type ModFiles, type ReadOptions, type UnhashedDescription, type UnhashedReadOptions } from "../../src/index.ts";
import { readModAt } from "../../src/node.ts";

export async function forms(tree: ModFiles, hash: boolean) {
  const plain: ModDescription = await readMod(tree);
  const unhashed: UnhashedDescription = await readMod(tree, { hashFiles: false });
  const unhashedOptions: UnhashedReadOptions = { hashFiles: false, progress: () => {} };
  const again: UnhashedDescription = await readMod(tree, unhashedOptions);
  const atDisk: UnhashedDescription = (await readModAt("x", { hashFiles: false })).description;
  const hashed: ModDescription = await readMod(tree, { hashFiles: true });
  // (decided at run time: either description, told apart by the identity's hash)
  const choice: HashChoiceReadOptions = { hashFiles: hash };
  const either = await readMod(tree, choice);
  const eitherAtDisk = (await readModAt("x", choice)).description;
  // @ts-expect-error a description read by a choice made at run time may be unhashed
  const notSure: ModDescription = either;
  // @ts-expect-error the same from a disk
  const notSureAtDisk: ModDescription = eitherAtDisk;
  const told = "hash" in either.identity ? (either as ModDescription).identity.hash : null;
  // @ts-expect-error `ReadOptions` never turns hashing off
  const off: ReadOptions = { hashFiles: false };
  // @ts-expect-error nor a boolean decided at run time
  const maybe: ReadOptions = { hashFiles: hash };
  return [plain, unhashed, again, atDisk, hashed, notSure, notSureAtDisk, told, off, maybe];
}
