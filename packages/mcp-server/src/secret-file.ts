import fs from "node:fs";
import path from "node:path";

import { posixModesCarryAccess, SECRET_DIR_MODE, SECRET_FILE_MODE } from "./secret-file.modes";

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
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS HELPER IS MIRRORED, BYTE FOR BYTE, BETWEEN `@agent-nexus/cli` AND
 * `@agent-nexus/mcp-server` — AND SO IS EVERY `secret-file.*` FILE BESIDE IT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The two packages write the SAME `~/.nexus-mcp/config.json` and have no
 * dependency edge between them — neither depends on the other, nor on the SDK —
 * so the guarantee cannot be shared by import. It is shared by copy, and the
 * mirror assertion in
 * `packages/cli/src/util/secret-file.no-create-only-modes.test.ts` fails when the
 * copies drift, which is the enforceable form of "one helper" across a boundary
 * that has no edge to route through.
 *
 * 🔴 THAT ASSERTION COVERS THE WHOLE `secret-file.*` FAMILY, NOT THIS FILE
 * ALONE, and it has to: a helper split across three files with a gate on one of
 * them is two ungated copies wearing one gate's name. It also refuses a file
 * present on one side and absent on the other, so adding a fourth leaf here
 * without adding it there is a failing test rather than a silent divergence.
 *
 * Every relative import below is `./secret-file.*`, which resolves identically
 * in `packages/cli/src/util/` and in `packages/mcp-server/src/` — that is what
 * lets the copies be byte-identical rather than merely equivalent.
 */

export {
  loosePermissionBits,
  permissionBits,
  SECRET_DIR_MODE,
  SECRET_FILE_MODE
} from "./secret-file.modes";
export { resetLoosePermissionWarning, warnIfLoosePermissions } from "./secret-file.warn-loose";

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
