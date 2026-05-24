import fs from "node:fs";

export type PackageManager = "npm" | "pnpm" | "yarn";

/**
 * Detect which package manager was used to install the CLI globally
 * by inspecting the resolved path of the running binary.
 */
export function detectPackageManager(): PackageManager {
  try {
    const resolved = fs.realpathSync(process.argv[1]).replace(/\\/g, "/");
    if (/[/]\.?pnpm[/]/.test(resolved)) return "pnpm";
    if (/[/]\.yarn[/]/.test(resolved)) return "yarn";
  } catch {
    // Detection failed — fall through to default
  }
  return "npm";
}

export function getGlobalInstallCommand(pkg: string, tag = "latest"): string {
  const pm = detectPackageManager();
  switch (pm) {
    case "pnpm":
      return `pnpm add -g ${pkg}@${tag}`;
    case "yarn":
      return `yarn global add ${pkg}@${tag}`;
    default:
      return `npm install -g ${pkg}@${tag}`;
  }
}

export function getGlobalUpdateHint(pkg: string): string {
  const pm = detectPackageManager();
  switch (pm) {
    case "pnpm":
      return `pnpm update -g ${pkg}`;
    case "yarn":
      return `yarn global upgrade ${pkg}`;
    default:
      return `npm update -g ${pkg}`;
  }
}
