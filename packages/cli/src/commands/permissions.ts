import { Command } from "commander";

import { registerPermissionsAccessCommand } from "./permissions/access.command";
import { registerPermissionsGrantCommand } from "./permissions/grant.command";
import { registerPermissionsOrgSettingsCommand } from "./permissions/org-settings.command";
import { registerPermissionsRevokeCommand } from "./permissions/revoke.command";
import { registerPermissionsSetVisibilityCommand } from "./permissions/set-visibility.command";

export function registerPermissionsCommands(program: Command): void {
  const permissions = program
    .command("permissions")
    .description("Share resources: read access lists, grant and revoke, read org visibility");

  permissions.addHelpText(
    "after",
    `
BEING AN ORG ADMIN IS NOT ENOUGH HERE, AND THAT SURPRISES EVERYONE ONCE.
Grants are DELEGATED, not administered: what you can read and write on a
resource depends on YOUR OWN relation to that resource, not on your role in the
organization. An org admin with no relation on an agent cannot list its grants
and cannot grant on it — both answer 403.

  • READING NEEDS A RELATION *OR* AN OPEN RESOURCE. "permissions access" answers
    for any resource you can already reach — including one whose type is open
    and that nobody has been granted anything on, which used to be refused. It
    is still refused for a resource that is closed to you, and answers 404 for
    an id outside your organization.
  • GRANTING NEEDS A RELATION AT LEAST AS STRONG AS THE ONE YOU GIVE. You cannot
    hand out access you do not hold. The refusal names the relation you have, or
    says you have none — read that half of the message, it is the diagnosis.
  • THE FIX IS A RELATION, NOT A ROLE. Have someone who already holds owner on
    the resource grant you one; changing your organization role does nothing.

RESOURCE IDS ARE VERSION-4 UUIDs, checked for more than their shape. A
hand-written 8-4-4-4-12 string with tidy digits is refused as an invalid UUID
even though it looks right — copy the id from the resource's own list command.

GRANTS ARE INDEXED BY RESOURCE, AND ONLY BY RESOURCE. Every read here starts
from a resource you already name — "permissions access <type> <id>". There is
no subject-side read, so "what does this user, group or API key reach?" has no
answer in this namespace and is not a command you have failed to find. Answering
it means walking the resources yourself, one "permissions access" per id.
The nearest thing that does exist is scoped to roles rather than to grants:
"nexus role systems" and "nexus role coverage" read outward from a role.

KNOWLEDGE AND WORKSPACE ARE NOT IN --resource-type, AND THAT IS NOT AN OVERSIGHT.
Neither type carries a grant row at all — a Collection is narrowed by a Role's
collection grants and a Workspace by its workspace grants, both resolved live —
so every route in this namespace refuses them. They live one namespace over:

  knowledge   nexus role collection-grants <role>    ·  grant-collection <role> <id>
  workspace   nexus role workspace-grants <role>     ·  grant-workspace <role> <id>

There is no reverse read for either: nothing lists the roles reaching ONE
collection, so an access review over a collection means enumerating the org's
roles and reading each one's grants.`
  );

  registerPermissionsAccessCommand(permissions, program);
  registerPermissionsGrantCommand(permissions, program);
  registerPermissionsRevokeCommand(permissions, program);
  registerPermissionsOrgSettingsCommand(permissions, program);
  registerPermissionsSetVisibilityCommand(permissions, program);
}
