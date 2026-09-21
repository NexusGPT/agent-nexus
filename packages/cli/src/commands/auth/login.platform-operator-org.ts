import { refuse } from "../../errors";
import { color } from "../../output";
import type { UserOrganization } from "./_shared/fetch-organizations";
import type { OrgChoice } from "./login.org-choice";
import type { Prompter } from "./login.prompter";

/**
 * Ask a platform-operator key which organization it should start on.
 *
 * `null` means the run is over and the caller must return immediately: the exit
 * code is already set, exactly as the inline `return` this replaces did.
 */
export async function promptPlatformOperatorOrg(
  ask: Prompter["ask"],
  organizations: readonly UserOrganization[]
): Promise<OrgChoice | null> {
  console.log(
    `\nThis is a ${color.cyan("platform-operator key")} — it acts on any ` +
      "organization, including ones you are not a member of. Every request is " +
      "recorded in the admin audit log."
  );
  if (organizations.length > 0) {
    console.log(color.dim("Your own organizations, for convenience:"));
    organizations.forEach((org) => {
      console.log(color.dim(`  ${org.organizationId}  ${org.name ?? ""}`));
    });
  }
  const entered = (await ask("Organization id to start on (org_...): ")).trim();
  if (!entered) {
    process.exitCode = refuse("A platform-operator key must name the organization it acts on.");
    return null;
  }
  const orgId = entered;
  const orgName = organizations.find((o) => o.organizationId === entered)?.name ?? undefined;

  return { orgId, orgName };
}
