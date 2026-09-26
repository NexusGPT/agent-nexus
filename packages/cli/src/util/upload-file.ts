import fs from "node:fs";
import path from "node:path";

import { invalidInput } from "../errors";

/**
 * The hint every upload refusal carries.
 *
 * Named rather than spelled at each throw site because it is the half of the
 * document that drifts silently: a message that disagrees across commands is
 * visible the moment two are read side by side, and a hint that is present at
 * six sites and absent at a seventh is not — the seventh simply prints
 * `"hint": null` and reads as a command that had nothing to add.
 */
const UPLOAD_PATH_HINT = "Pass a path that exists, relative to the current directory or absolute.";

/**
 * Resolve a user-supplied upload path, or REFUSE it — the one decision every
 * upload command in this CLI makes before it touches the wire.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `existsSync` ALONE LETS A DIRECTORY THROUGH, AND THE READ BELOW THEN
 *    THROWS `EISDIR` — A RAW ERRNO, EXIT 1, NO HINT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Measured across the upload commands before this helper existed: six of them
 * guarded on `existsSync` only, so `nexus asset upload ./some-dir` answered
 * `EISDIR: illegal operation on a directory, read` with code
 * `CLI_UNKNOWN_ERROR` — a message about a syscall, on a mistake the caller made
 * about a path. Only the skill-bundle reader tested `isFile()`, and it alone
 * named the actual problem. `isFile()` is therefore part of the guard, not an
 * extra a caller may opt into: the failure it prevents is the caller's own
 * input being wrong, which is exactly what `invalidInput` means.
 *
 * `statSync` is reached only once `existsSync` is true, so it cannot throw on
 * a path that is simply absent.
 *
 * @throws {CategorizedCliError} `invalid-input` — the thrown form of `refuse`,
 *   so `handleError` prints the same `{message, hint, code}` document and exits
 *   with the same code the hand-rolled guards returned.
 */
export function resolveUploadPath(file: string): string {
  const absPath = path.resolve(file);
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    throw invalidInput(`File not found: ${absPath}`, UPLOAD_PATH_HINT);
  }
  return absPath;
}

/**
 * The bytes of an upload, guarded by {@link resolveUploadPath}.
 *
 * Separate from {@link readUploadBlob} because two callers genuinely need the
 * `Buffer` and not a `Blob`: the skill-bundle reader bounces its length off an
 * upload limit and tests the ZIP magic before anything is wrapped, and ticket
 * attachments build a `node:buffer` `File` so the attachment carries a name.
 * Wrapping and then unwrapping to serve them would be a copy for nothing.
 */
export function readUploadBuffer(file: string): Buffer {
  return fs.readFileSync(resolveUploadPath(file));
}

/**
 * A user-supplied file as a `Blob`, ready for an SDK upload method.
 *
 * THE FILE NAME IS NOT IN HERE, and that is deliberate: a `Blob` has no name,
 * and the routes that need one take it as a separate argument. A caller that
 * needs it resolves the path itself — `resolveUploadPath` is idempotent and
 * returns the absolute path this refusal would have named — rather than being
 * handed a second return value that most call sites would discard.
 */
export function readUploadBlob(file: string): Blob {
  return new Blob([readUploadBuffer(file)]);
}
