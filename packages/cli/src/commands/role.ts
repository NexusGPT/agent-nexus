import { Command } from "commander";

import { resolveRoleId } from "./role/_shared/resolve-role-id";
import { registerBoardsCommands } from "./role/boards/boards.commands";
import { registerConfigCommands } from "./role/config/config.commands";
import { registerJobTypesCommands } from "./role/job-types/job-types.commands";
import { registerLifecycleCommands } from "./role/lifecycle/lifecycle.commands";
import { registerMembersCommands } from "./role/members/members.commands";
import { registerPermissionSetsCommands } from "./role/permission-sets/permission-sets.commands";
import { registerReadsCommands } from "./role/reads/reads.commands";
import { registerRequestsCommands } from "./role/requests/requests.commands";
import { registerResourcesCommands } from "./role/resources/resources.commands";
import { ROLE_NAMESPACE_GAPS, ROLE_NAMESPACE_INDEX } from "./role-body-shapes";

/**
 * `nexus role` — the Roles surface.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE HELP TEXT USES THE SCREEN'S WORDS, THE CODE USES THE CODE'S
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * An external operator types these commands having read the dashboard, not the
 * schema. Three names differ, and inventing a third word for any of them is worse
 * than either:
 *
 * | in this CLI | on screen | in the database |
 * |---|---|---|
 * | `systems` | a system the Role holds | `RoleResource` |
 * | `permission-sets` | a permission set | `RoleGroup` |
 * | — not exposed — | the "Group access" tab | `RoleGroupGrant` |
 *
 * `RoleGroup` and `RoleGroupGrant` are one character apart and mean opposite
 * things, which is why `permission-sets` is never spelled `groups` here even
 * though the internal HTTP route is.
 *
 * ── EVERY `<role>` TAKES A NAME OR A UUID ────────────────────────────────────
 *
 * A uuid goes straight through. Anything else is resolved by listing the
 * organization's Roles and matching on name — see {@link resolveRoleId}. That
 * turns "attach this system to the Support Role" from three commands into one,
 * and it is affordable only because the Roles list is unpaginated by design: a
 * Role is a unit of organizational structure, so the list is bounded by how the
 * company is arranged rather than by usage.
 */

export function registerRoleCommands(program: Command): void {
  const role = program
    .command("role")
    .description("Read and manage Roles — who holds which systems, and what each Role reaches");

  role.addHelpText(
    "after",
    `
Every <role> argument takes a Role NAME or a UUID. A name costs one extra
lookup and needs the roles:read scope.

Two facts that decide whether a write does damage:
  • "role attach" MOVES a system. Each system belongs to exactly ONE Role, so
    attaching takes it off whatever Role held it, along with the access that
    Role's members had. The command prints which Role it came from.
  • A system in NO Role reaches nothing at runtime and reports no error. So
    "role detach", and deleting a Role, are quiet disablings — not tidy-ups.
${ROLE_NAMESPACE_INDEX}
${ROLE_NAMESPACE_GAPS}`
  );

  registerReadsCommands(role, program);
  registerLifecycleCommands(role, program);
  registerResourcesCommands(role, program);
  registerMembersCommands(role, program);
  registerPermissionSetsCommands(role, program);
  registerRequestsCommands(role, program);
  registerJobTypesCommands(role, program);
  registerConfigCommands(role, program);
  registerBoardsCommands(role, program);
}
