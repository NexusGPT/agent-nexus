import { Command } from "commander";

import { createClient } from "../../client";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus tool get` — one marketplace tool. */
export function registerToolGetCommand(tool: Command, program: Command): void {
  tool
    .command("get")
    .description("Get marketplace tool details")
    .argument("<id>", "Tool ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool get 11111111-1111-4111-8111-111111111111
  $ nexus tool get 11111111-1111-4111-8111-111111111111 --json

Notes:
  THIS IS THE AUTHORITATIVE ACTION LIST FOR A MARKETPLACE TOOL, and it is what
  you need before "nexus tool execute --action". --json carries actions[], each
  {key, name, description, parameters[]}, and each parameter
  {name, type, label, description, required, default, remoteOptions}. key is
  what --action takes. An array or object parameter on a custom-manifest tool
  also carries schema, holding the nested shape the flat name/type pair cannot
  express.
  This is the opposite of "external-tool get", which returns actionsCount and no
  action list at all — there you read the operation ids out of your own spec.

  ACTIONS ARE PAGED SERVER-SIDE AND THIS COMMAND CANNOT REACH THE PAGES. The
  route takes actionsLimit (200 at most), actionsOffset and actionsSearch; none
  is exposed here. On a tool with a large action set, use
  "nexus api GET /tools/<id>?actionsOffset=..." rather than assuming what came
  back is all of it.

  remoteOptions true means the values are NOT in this response — fetch them with
  "nexus tool resolve-options <id>".

  dashboardUrl IS ADDED BY THIS CLI AND IS NOT AN API FIELD. It is this tool's
  page, and it is where a PERSON connects their own credential — the browser
  half of "nexus tool connect", and the only route that offers an OAuth button
  and an API-key form. Send it to whoever holds the key instead of assembling a
  URL from a path pattern that can be renamed underneath you.
  IT WORKS FOR A MARKETPLACE TOOL ID, WHICH IT DID NOT BEFORE NEX-4021: the page
  answered 404 for every tool published by another organization, which is every
  marketplace tool. A dashboardUrl printed against an older backend opens a
  spinner that never resolves.`
    )
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const detail = await client.tools.get(id);
        printRecord({ ...detail, dashboardUrl: dashboardUrlFor("externalTool", id, globals) });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
