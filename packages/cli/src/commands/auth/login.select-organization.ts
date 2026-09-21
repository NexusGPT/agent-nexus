import { refuse } from "../../errors";
import { color } from "../../output";
import type { UserOrganization } from "./_shared/fetch-organizations";
import type { OrgChoice } from "./login.org-choice";
import type { Prompter } from "./login.prompter";

/**
 * Pick the active organization from the token's own memberships — silently when
 * there is exactly one, by prompt when there are several.
 *
 * `null` means the run is over and the caller must return immediately: the exit
 * code is already set, exactly as the inline `return` this replaces did.
 */
export async function selectOrganization(
  ask: Prompter["ask"],
  organizations: readonly UserOrganization[]
): Promise<OrgChoice | null> {
  console.log(
    `\nThis is a ${color.cyan("personal token")} — one key across ${color.cyan(
      String(organizations.length)
    )} organization(s).`
  );

  let chosen: UserOrganization;
  if (organizations.length === 1) {
    chosen = organizations[0];
    console.log(`Active organization: ${color.cyan(chosen.name ?? chosen.organizationId)}`);
  } else {
    organizations.forEach((org, i) => {
      console.log(
        `  ${color.cyan(String(i + 1))}. ${org.name ?? org.organizationId} ${color.dim(
          `(${org.role})`
        )}`
      );
    });
    const answer = (await ask(`Select active organization [1]: `)).trim();
    const index = answer ? Number.parseInt(answer, 10) - 1 : 0;
    if (Number.isNaN(index) || index < 0 || index >= organizations.length) {
      process.exitCode = refuse("Invalid selection.");
      return null;
    }
    chosen = organizations[index];
  }

  return { orgId: chosen.organizationId, orgName: chosen.name ?? undefined };
}
