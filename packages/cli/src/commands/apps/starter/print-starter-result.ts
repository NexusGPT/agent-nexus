import { color, isJsonMode } from "../../../output";

export interface StarterResult {
  directory: string;
  starterVersion: string | null;
  uiVersion: string | null;
  bytes: number;
}

export function printStarterResult(result: StarterResult, displayDir: string): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `${color.green("✓")} App starter ${result.starterVersion ?? "?"} ` +
      `(apps-ui ${result.uiVersion ?? "?"}, vendored) extracted to ${result.directory}`
  );
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${displayDir} && npm install`);
  console.log("");
  console.log(
    color.dim(
      "No npm token is needed: @agent-nexus/apps-ui is installed from vendor/, not the registry. " +
        "Commit package-lock.json after the install — the Dockerfile's npm ci reads it."
    )
  );
}
