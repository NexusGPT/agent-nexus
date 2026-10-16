import fs from "node:fs";

import { loosePermissionBits, permissionBits, posixModesCarryAccess } from "./secret-file.modes";

/**
 * The READ-time half: tell the user a credential file was already exposed.
 *
 * Separate from the write path on purpose. The write path REPAIRS a loose mode;
 * this one reports that it was loose, and the two are not the same act — the
 * repair is silent and instantaneous, while the exposure is in the PAST and the
 * only useful response to it is a key rotation the CLI cannot perform.
 *
 * ⚠️ MIRRORED, BYTE FOR BYTE, BETWEEN `@agent-nexus/cli` AND
 * `@agent-nexus/mcp-server`, exactly as `secret-file.ts` is, and held there by
 * the same spec. See that file's header.
 */

/** Fires the read-time warning at most once per process, however many reads happen. */
let warnedAbout: string | undefined;

/**
 * Warn on STDERR when a credential file was found group- or world-accessible.
 *
 * The write path repairs the mode, and repairing it in silence is the failure
 * mode this exists to prevent: the exposure is in the PAST — every user on the
 * machine could already have read the token — and a chmod does not un-read it.
 * The only useful action is to rotate the key, and the user cannot decide to do
 * that if nobody tells them.
 *
 * STDERR, never STDOUT: `--json` mode's stdout must stay a single parseable
 * document. Once per process, because `loadConfig` is called many times per
 * invocation and a warning printed nine times is a warning nobody reads.
 */
export function warnIfLoosePermissions(file: string): void {
  // See `posixModesCarryAccess`: on Windows the mode is synthesised from the
  // read-only bit alone, so 0666 is what a correctly written secret file reports
  // and the warning below would be permanent and wrong.
  if (!posixModesCarryAccess()) return;

  let mode: number;
  try {
    mode = fs.statSync(file).mode;
  } catch {
    return; // No file, or unreadable — nothing to say about a file we cannot see.
  }

  const loose = loosePermissionBits(mode);
  if (loose === 0) return;
  if (warnedAbout === file) return;
  warnedAbout = file;

  const octal = permissionBits(mode).toString(8).padStart(4, "0");
  process.stderr.write(
    `warning: ${file} is mode ${octal} — readable by other users on this machine.\n` +
      `         It holds an API key in plaintext. Assume the key is exposed and rotate it.\n` +
      `         The next write by this CLI restores mode 0600; run: chmod 600 ${file}\n`
  );
}

/** Test seam: forget that the warning already fired. Not used by the CLI itself. */
export function resetLoosePermissionWarning(): void {
  warnedAbout = undefined;
}
