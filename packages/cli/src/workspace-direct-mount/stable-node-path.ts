import fs from "node:fs";
import path from "node:path";

function realpathOrNull(target: string): string | null {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

/**
 * The node binary to write into the credential_process line: the `node` on
 * PATH that IS this process's binary, when there is one, else the binary
 * itself.
 *
 * `process.execPath` is already resolved through every symlink, so under
 * Homebrew or a version manager it names a versioned directory
 * (`…/Cellar/node/24.6.0/bin/node`) that the next node upgrade deletes — and
 * with it every direct mount's renewal, silently, at its next hour. The PATH
 * entry (`/opt/homebrew/bin/node`) is the spelling that survives the upgrade:
 * the manager repoints it. It is used only when it resolves to the very same
 * file, so the line never names a different node than the one that mounted.
 */
export function stableNodePath(
  execPath: string = process.execPath,
  pathEnv: string | undefined = process.env.PATH
): string {
  const real = realpathOrNull(execPath);
  if (real === null || pathEnv === undefined) return execPath;
  const binary = path.basename(execPath);
  for (const dir of pathEnv.split(path.delimiter)) {
    // A RELATIVE entry — `.` and `./bin` are ordinary in a dev shell — resolves
    // against the CURRENT working directory, and the line built from it is run
    // later by rclone, a detached process with a different one. It would pass
    // `credential-process --check` here and fail an hour later at the first
    // renewal, which is the one failure this function exists to prevent.
    if (dir === "" || !path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, binary);
    if (candidate !== execPath && realpathOrNull(candidate) === real) return candidate;
  }
  return execPath;
}
