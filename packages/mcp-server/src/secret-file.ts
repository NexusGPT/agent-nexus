import fs from "node:fs";
import path from "node:path";

/**
 * The one way this package writes a file that holds, or sits beside, a secret.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `mode:` ON A WRITE APPLIES ONLY AT CREATE. IT IS NOT A PERMISSION SETTER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `fs.writeFileSync(file, data, { mode: 0o600 })` passes the mode to `open(2)`,
 * where it is the mode for a file that has to be CREATED — and it is masked by
 * the process umask on the way. When the path already exists, `open` ignores the
 * argument entirely and the existing mode survives the write untouched. Same for
 * `fs.mkdirSync(dir, { mode: 0o700 })` on a directory that is already there.
 *
 * So a `~/.nexus-mcp/config.json` that reached 0644 by ANY route — an installer,
 * a restored backup, a hand-created file, a CLI old enough to predate the `mode:`
 * argument, or simply a permissive umask at the moment of creation — stayed
 * world-readable through every subsequent `nexus auth login`, holding a live API
 * key, and nothing in the CLI ever looked.
 *
 * The reliable form is an explicit `chmod` AFTER the write, which is what these
 * functions do. Every write of a credential-bearing file, and every creation of
 * a directory that holds one, goes through here — so the next person to add a
 * credential write cannot get this wrong by omission.
 *
 * ⚠️ THIS FILE IS MIRRORED, BYTE FOR BYTE, BETWEEN `@agent-nexus/cli` AND
 * `@agent-nexus/mcp-server`. The two packages write the SAME
 * `~/.nexus-mcp/config.json` and have no dependency edge between them — neither
 * depends on the other, nor on the SDK — so the guarantee cannot be shared by
 * import. It is shared by copy, and the mirror assertion in
 * `packages/cli/src/util/secret-file.no-create-only-modes.test.ts` fails when the
 * copies drift, which is the enforceable form of "one helper" across a boundary
 * that has no edge to route through.
 */

/** Owner-only on a directory that holds a secret: `rwx------`. */
export const SECRET_DIR_MODE = 0o700;

/** Owner-only on a file that holds a secret: `rw-------`. */
export const SECRET_FILE_MODE = 0o600;

/** Permission bits, isolated from the file-type bits `fs.Stats.mode` also carries. */
export function permissionBits(mode: number): number {
  return mode & 0o777;
}

/**
 * Whether a POSIX permission bit on this platform says anything about WHO CAN
 * READ the file.
 *
 * ⚠️ ON WINDOWS IT DOES NOT, AND READING IT AS IF IT DID PRODUCES A PERMANENT
 * FALSE ALARM. Node synthesises the mode there from one bit: a writable file
 * reports `0666` and a read-only one `0444`, whatever the ACLs actually grant,
 * and `chmod` toggles only that read-only bit. So `0666` read back immediately
 * after a SUCCESSFUL `writeSecretFile` is the normal, correct result — and a
 * warning keyed on the group/other bits would fire on every `loadConfig`, on
 * every invocation, and would never clear, telling the user to rotate a key that
 * nothing is wrong with.
 *
 * Access control on Windows is an ACL question, and this CLI does not answer it.
 * It stays silent there rather than guessing, which is the honest outcome: an
 * instrument that cannot read this platform must not report a verdict about it.
 *
 * Evaluated per call rather than captured at module load, so a spec can exercise
 * both branches on one machine.
 */
function posixModesCarryAccess(): boolean {
  return process.platform !== "win32";
}

/**
 * A chmod that could not be applied is REPORTED, never swallowed and never
 * thrown.
 *
 * Thrown would be worst of both: the write has already landed, so failing the
 * command leaves the credential on disk at the loose mode AND breaks `nexus auth
 * login` on any filesystem that does not carry POSIX modes (a mounted share, a
 * container volume with a fixed ownership map). Swallowed would restore exactly
 * the silence this whole file exists to end.
 */
function chmodOrWarn(target: string, mode: number): void {
  try {
    fs.chmodSync(target, mode);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `warning: could not restrict permissions on ${target} to ${mode.toString(8).padStart(4, "0")}: ${reason}\n` +
        (posixModesCarryAccess()
          ? `         It may be readable by other users on this machine.\n`
          : "")
    );
  }
}

/**
 * Create `dir` (and its parents) and assert 0700 on it, whether it existed or
 * not.
 *
 * The chmod is on `dir` alone, deliberately: a parent this call happened to
 * create is somewhere like `~`, and tightening a user's home directory to 0700
 * because a CLI needed a config folder is a side effect nobody asked for.
 */
export function ensureSecretDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: SECRET_DIR_MODE });
  chmodOrWarn(dir, SECRET_DIR_MODE);
}

/**
 * Write `contents` to `file` and leave the file at 0600 and its directory at
 * 0700 — on a fresh path and on a pre-existing loose one alike.
 */
export function writeSecretFile(file: string, contents: string): void {
  ensureSecretDir(path.dirname(file));
  fs.writeFileSync(file, contents, { mode: SECRET_FILE_MODE });
  chmodOrWarn(file, SECRET_FILE_MODE);
}

/**
 * The bits that make a mode readable by somebody other than its owner.
 * Returns 0 when the mode is already owner-only.
 */
export function loosePermissionBits(mode: number): number {
  return permissionBits(mode) & 0o077;
}

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
