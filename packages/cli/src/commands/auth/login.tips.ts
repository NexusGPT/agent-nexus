import { listProfiles } from "../../config";
import { color } from "../../output";

/** The closing tips a successful login prints, if either one applies. */
export function printLoginTips(profileName: string, isPersonalToken: boolean): void {
  if (isPersonalToken) {
    console.log(
      "\n" +
        color.dim("Tip: switch the active org without re-authenticating:") +
        "\n" +
        color.dim("  nexus auth orgs              list your organizations") +
        "\n" +
        color.dim("  nexus auth use-org <orgId>   switch the active organization")
    );
  }

  // Tip for second+ profile
  const { profiles } = listProfiles();
  if (Object.keys(profiles).length > 1) {
    console.log(
      "\n" +
        color.dim("Tip: You have multiple profiles. Consider pinning directories:") +
        "\n" +
        color.dim(`  nexus auth pin ${profileName}    (in your project directory)`)
    );
  }
}
