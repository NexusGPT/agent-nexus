/**
 * The two owner-only modes, and the pure predicates over a mode.
 *
 * A leaf with no imports: nothing here touches the filesystem, so the write
 * path and the read-time warning can both read these without either depending
 * on the other.
 *
 * ⚠️ MIRRORED, BYTE FOR BYTE, BETWEEN `@agent-nexus/cli` AND
 * `@agent-nexus/mcp-server`, exactly as `secret-file.ts` is, and held there by
 * the same spec. See that file's header for why the guarantee is shared by copy
 * rather than by import.
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
 * The bits that make a mode readable by somebody other than its owner.
 * Returns 0 when the mode is already owner-only.
 */
export function loosePermissionBits(mode: number): number {
  return permissionBits(mode) & 0o077;
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
export function posixModesCarryAccess(): boolean {
  return process.platform !== "win32";
}
