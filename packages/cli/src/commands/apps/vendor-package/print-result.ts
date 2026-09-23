import { VENDOR_DIRECTORY } from "@nexus/vibe-app-vendoring";

import { color, isJsonMode } from "../../../output";

export interface VendorResult {
  directory: string;
  packageName: string;
  version: string;
  integrity: string;
  vendoredPath: string;
  changed: string[];
  removed: string[];
  warnings: string[];
  nextCommand: string;
}

export function printResult(result: VendorResult): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `${color.green("✓")} ${result.packageName}@${result.version} vendored to ${result.vendoredPath}`
  );
  for (const path of result.changed) console.log(`  ${color.dim("updated")} ${path}`);
  for (const path of result.removed) console.log(`  ${color.dim("removed")} ${path}`);
  for (const warning of result.warnings) console.log(`${color.yellow("!")} ${warning}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  ${result.nextCommand}`);
  console.log(`  git add ${VENDOR_DIRECTORY}/ package.json package-lock.json && git commit`);
  console.log("");
  console.log(
    color.dim(
      "No npm token is needed and none should ever be requested: the package installs from " +
        `${VENDOR_DIRECTORY}/, not the registry. Commit that directory — the server-side build reads it too.`
    )
  );
}
