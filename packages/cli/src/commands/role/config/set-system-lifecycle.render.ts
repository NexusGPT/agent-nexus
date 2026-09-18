import type { RoleSystemLifecycleResult } from "@agent-nexus/sdk";

import { printSuccess } from "../../../output";

/** Prints `nexus role set-system-lifecycle`: the attachment, and the bucket it is now in. */
export function renderRoleSetSystemLifecycle(result: RoleSystemLifecycleResult): void {
  printSuccess("System lifecycle updated.", {
    roleResourceId: result.roleResourceId,
    lifecycle: result.lifecycle
  });
}
