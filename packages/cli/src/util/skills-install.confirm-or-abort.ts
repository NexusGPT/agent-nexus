import { confirmDestructive } from "./confirm";

/**
 * The installer's confirmation, on the one shared path.
 *
 * It already refused without a terminal, which was the safe branch — but it
 * tested `process.stdout.isTTY`, so `nexus skills update > log.txt` from an
 * interactive shell refused with a human sitting right there. A confirmation
 * READS; `confirmDestructive` tests stdin, which is the only stream that says
 * whether anyone can answer.
 *
 * @see confirmDestructive — the convention, and why refusing is the default.
 */
export async function confirmOrAbort(
  message: string,
  opts: { yes?: boolean; force?: boolean }
): Promise<boolean> {
  return confirmDestructive(message, opts);
}
