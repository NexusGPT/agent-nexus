import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printTable } from "../../output";

/** `nexus tool credentials` — the credentials stored against a tool. */
export function registerToolCredentialsCommand(tool: Command, program: Command): void {
  tool
    .command("credentials")
    .description("List credentials for a marketplace tool")
    .argument("<id>", "Tool ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool credentials 11111111-1111-4111-8111-111111111111
  $ nexus tool credentials 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE ID COLUMN IS THE CREDENTIAL, NOT THE TOOL. The argument is the tool's id;
  every row's ID is a credential id, and that is what "tool execute" and
  "tool delete-credential" take.
  THAT CREDENTIAL ID IS TOOL-SCOPED, AND IT IS NOT THE ONE "credential" AND
  "access-card" TAKE. Those take the UNIFIED id for the same connected account,
  and it comes from "nexus credential list". Both are UUIDs, so pasting this one
  into "access-card list --credential-id" is well-formed and still wrong — it is
  refused, and the refusal names the unified id to use instead.
  TYPE says how the credential was obtained — it is what tells a Pipedream OAuth
  account apart from a key entered by hand, which matters because only one of
  them can be re-minted without a person.
  ONE TOOL CAN HOLD SEVERAL, and nothing here marks one as default. When two rows
  look alike, NAME is the only thing separating them, so name them on creation.
  An empty list prints an empty table rather than an error — a tool with no
  credential is a normal state, not a failure.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tools.credentials(id);
        const creds = result.credentials ?? [];

        printTable(creds, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 25 },
          { key: "type", label: "TYPE", width: 12 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
