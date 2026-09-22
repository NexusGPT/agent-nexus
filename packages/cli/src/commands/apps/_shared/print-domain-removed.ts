import { color, isJsonMode } from "../../../output";
import { type DeleteVibeAppDomainResponse } from "../../../vibe-domain-wire-types";

export function printDomainRemoved(data: DeleteVibeAppDomainResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(`${color.green("✓")} Removed ${data.deletedHost}`);
}
