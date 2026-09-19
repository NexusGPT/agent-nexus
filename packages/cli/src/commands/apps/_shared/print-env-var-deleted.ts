import { color, isJsonMode } from "../../../output";
import { type DeleteEnvVarResponse } from "../../../vibe-wire-types";

export function printEnvVarDeleted(data: DeleteEnvVarResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(`${color.green("✓")} Removed env var ${data.deletedId}`);
}
