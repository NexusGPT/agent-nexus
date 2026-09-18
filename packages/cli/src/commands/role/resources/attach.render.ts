import type { AttachRoleSystemResult, NexusClient } from "@agent-nexus/sdk";

import { absent, printSuccess, printWarning } from "../../../output";
import { describeRole, roleNamesById } from "../_shared/describe-role";

/** The options `nexus role attach` declares — both mandatory. */
export interface RoleAttachOptions {
  type: string;
  id: string;
}

/**
 * Prints `nexus role attach`, and names the Role a MOVE took the system from.
 * Takes the client because that warning resolves the Role's name, which is a
 * read of its own.
 */
export async function renderRoleAttach(
  client: NexusClient,
  roleId: string,
  opts: RoleAttachOptions,
  result: AttachRoleSystemResult
): Promise<void> {
  printSuccess("System attached.", {
    role: roleId,
    type: opts.type,
    id: opts.id,
    // A null here is "it belonged to no Role", and that is the SEIZURE
    // check: a script asks whether another team just lost this system, so
    // the answer cannot be a sentence it has to match on.
    movedFrom: result.movedFromRoleId ?? absent("(it belonged to no Role)")
  });

  if (result.movedFromRoleId !== null) {
    const names = await roleNamesById(client);
    printWarning(
      `This was a MOVE: the system was taken from Role ${describeRole(names, result.movedFromRoleId)}.`,
      "That Role's members have lost the access they had through it. Nothing else",
      "reports this. If it was not intended, attach the system back to that Role."
    );
  }
}
