import fs from "node:fs";
import path from "node:path";

/**
 * Walk up from the running module to the directory installed under
 * node_modules (handling scoped packages). Null when not running from a
 * node_modules layout (e.g. local dev via tsx).
 */
function findPackageRoot(from: string): string | null {
  let dir = from;
  for (;;) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    const parentBase = path.basename(parent);
    const grandBase = path.basename(path.dirname(parent));
    if (
      parentBase === "node_modules" ||
      (parentBase.startsWith("@") && grandBase === "node_modules")
    ) {
      return dir;
    }
    dir = parent;
  }
}

/**
 * Pre-check that a global self-install could succeed at all: the package dir
 * and its parent must be writable by this user (they are root-owned after
 * `sudo npm i -g`, the macOS default). When the layout can't be determined,
 * stays permissive — the failure backoff catches anything this misses.
 */
export function isInstallPrefixWritable(): boolean {
  let pkgRoot: string | null;
  try {
    pkgRoot = findPackageRoot(path.dirname(fs.realpathSync(process.argv[1] ?? "")));
  } catch {
    return true;
  }
  if (!pkgRoot) return true;
  try {
    fs.accessSync(pkgRoot, fs.constants.W_OK);
    fs.accessSync(path.dirname(pkgRoot), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
