import type { CreateRoleResult, DeleteRoleResult } from "@agent-nexus/sdk";

import { printSuccess, printWarning } from "../../../output";

/**
 * Report a create or a delete that governance may have turned into a request.
 *
 * 🚨 THE DISCRIMINANT IS THE WHOLE POINT. Both routes answer 2xx either way, so
 * printing "created" off the HTTP status would report a Role that does not exist
 * — and printing "deleted" would report one that is still serving traffic. The
 * pending arm is a WARNING rather than a success line, because the caller has to
 * do something about it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `status` IS ON THE PAYLOAD, NOT JUST IN THE PROSE. THAT IS NEX-3627.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The SDK type says *"READ `status`. NEVER THE HTTP CODE"* and the human output
 * obeyed it — but `--json` carried `{success, id, name}` and `{success, note}`,
 * neither of which holds the discriminant, so the one instruction the contract
 * gives could not be followed on the CLI. A scripted caller reading `success`
 * could not tell "Role created" from "request filed", and on the delete side a
 * pending result reported success while the Role kept serving traffic.
 *
 * `success: true` is honest on all three arms — the call was accepted — so it is
 * `status` that has to be the branch, and it is now the same word on both
 * channels: `created`, `deleted`, `pending`.
 */
export function reportGovernedWrite(result: CreateRoleResult | DeleteRoleResult): void {
  if (result.status === "created") {
    printSuccess("Role created.", {
      status: result.status,
      id: result.role.id,
      name: result.role.name
    });
    return;
  }
  if (result.status === "deleted") {
    printSuccess("Role deleted.", {
      status: result.status,
      note: "Its systems are now orphans — they still exist and still run, in no Role."
    });
    return;
  }

  printSuccess("Request filed for approval.", {
    status: result.status,
    requestId: result.request.id
  });
  printWarning(
    "NOTHING HAPPENED YET. This organization requires approval for that action.",
    `A request (${result.request.id}) is waiting on an admin.`,
    "The Role was not created, or not deleted — do not treat this as done."
  );
}
