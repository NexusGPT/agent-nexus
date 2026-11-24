import { refuse } from "../../errors";
import { color } from "../../output";
import { promptLine } from "../../util/confirm";
import type { UserOrganization } from "./_shared/fetch-organizations";
import type { OrgChoice } from "./login.org-choice";
import type { Prompter } from "./login.prompter";

/**
 * Ask a platform-operator key which organization it should start on.
 *
 * `null` means the run is over and the caller must return immediately: the exit
 * code is already set, exactly as the inline `return` this replaces did.
 *
 * 🚨 EVERY LINE HERE IS PART OF THE QUESTION, SO ALL OF IT GOES ON THE
 * QUESTION'S STREAM. `Organization id to start on (org_...):` asks for an id,
 * and the ids it offers "for convenience" are printed above it — plus the
 * warning that this key acts on organizations the operator is not a member of
 * and that every request is audited, which is the one thing they most need in
 * front of them while answering. With the question on `promptStream()` and
 * these on `console.log`, `nexus auth login > out.log` put the warning and the
 * ids in the file and the bare question on the terminal.
 */
export async function promptPlatformOperatorOrg(
  ask: Prompter["ask"],
  organizations: readonly UserOrganization[]
): Promise<OrgChoice | null> {
  promptLine(
    `\nThis is a ${color.cyan("platform-operator key")} — it acts on any ` +
      "organization, including ones you are not a member of. Every request is " +
      "recorded in the admin audit log."
  );
  if (organizations.length > 0) {
    promptLine(color.dim("Your own organizations, for convenience:"));
    organizations.forEach((org) => {
      promptLine(color.dim(`  ${org.organizationId}  ${org.name ?? ""}`));
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
