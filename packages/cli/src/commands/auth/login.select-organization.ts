import { refuse } from "../../errors";
import { color } from "../../output";
import { promptLine } from "../../util/confirm";
import type { UserOrganization } from "./_shared/fetch-organizations";
import type { OrgChoice } from "./login.org-choice";
import type { Prompter } from "./login.prompter";

/**
 * Pick the active organization from the token's own memberships — silently when
 * there is exactly one, by prompt when there are several.
 *
 * `null` means the run is over and the caller must return immediately: the exit
 * code is already set, exactly as the inline `return` this replaces did.
 *
 * 🚨 THE NUMBERED LIST IS PART OF THE QUESTION, SO IT GOES ON THE QUESTION'S
 * STREAM. `Select active organization [1]:` is unanswerable on its own — the
 * numbers it asks for only exist in the list above it. Printing the list with
 * `console.log` while asking through `promptStream()` sent them to different
 * places under `nexus auth login > out.log`: the question reached the terminal
 * and the options it refers to went into the file. That is the same defect as
 * asking on the wrong stream, one step later, which is what `promptLine` exists
 * for.
 *
 * `Active organization:` stays on `console.log` deliberately — it is the single
 * membership branch, where nothing is asked at all, so it is a RESULT and
 * `login.run.ts` reports the chosen org on stdout the same way.
 */
export async function selectOrganization(
  ask: Prompter["ask"],
  organizations: readonly UserOrganization[]
): Promise<OrgChoice | null> {
  promptLine(
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
      promptLine(
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
