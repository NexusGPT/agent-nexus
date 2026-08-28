import type { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { color, printEnvelope, printTable } from "../output";
import { KNOWN_ISSUES_FOR_ROUTE_CONTRACT } from "./known-issues.contract.generated";

/**
 * `nexus known-issues <route-id>` — what is known to be broken on one command.
 *
 * ## The route id is DERIVED, so there is nothing to look up
 *
 * It is the dotted path of the command you ran, without `nexus`:
 * `nexus workflow node test` is `workflow.node.test`. `util/route-id.ts` derives
 * it from commander's own parent chain, and `known-issues-help.ts` prints the
 * exact invocation on every command's `--help`, so a reader never has to
 * assemble one by hand.
 *
 * ## No normalisation, and that is deliberate
 *
 * The server constrains `route` to dot-separated lowercase names and answers 400
 * on anything else. Lower-casing here would make this CLI ACCEPT a spelling the
 * server refuses — the value would be silently rewritten, a different route
 * would be queried, and an empty answer would read as "nothing is broken".
 * The argument goes on the wire exactly as typed and the server decides.
 *
 * ## Why the whole response is the `--json` document
 *
 * `printTable` under `--json` would print the ISSUE ARRAY and nothing else,
 * dropping `polled` — the one field that separates "this route is clean" from
 * "we have not asked yet" — and `capturedAt`, which is how old the snapshot is.
 * So the action hands the whole response to `printEnvelope` and renders the
 * table inside its callback, which runs on the human channel only. One document
 * per invocation: two printers in one action is two concatenated JSON
 * documents, which `JSON.parse` refuses and a script silently truncates.
 */
export function registerKnownIssuesCommand(program: Command): void {
  const knownIssues = program
    .command("known-issues")
    .description("Show the platform issues published against a CLI route")
    .argument("<route-id>", "Dotted route id of the command, e.g. workflow.node.test")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus known-issues workflow.node.test
  $ nexus known-issues agent.list --json
  $ nexus known-issues deployment.create

Notes:
  AN EMPTY LIST IS TWO DIFFERENT ANSWERS AND YOU MUST READ "polled" TO TELL
  THEM APART. "polled": false means the server has not read the ticket
  provider yet, NOT that this route is clean. This command prints "not checked
  yet" in that case and you must not report it as a clean bill of health.
  "polled": true with no issues is the real "nothing published".
  AN ISSUE APPEARS HERE ONLY BECAUSE A HUMAN PUBLISHED IT. The list is not
  every open defect on the route — it is the ones somebody deliberately marked
  publishable. So an empty list never proves the command works.
  THE ROUTE ID IS THE COMMAND PATH WITHOUT "nexus", JOINED BY DOTS. Run
  "nexus workflow node test --help" and the line at the bottom names the exact
  id for that command, so you never have to assemble one.
  AN ALIAS RESOLVES TO ITS CANONICAL COMMAND. "skills install" and "skills
  sync" are both "skills.update", so all three spellings answer the same list.
  A MIS-CASED OR MISSPELLED ID DOES NOT ERROR — IT ANSWERS EMPTY. Uppercase or
  an underscore is refused with a 400, but a well-formed id nobody has
  published against returns an empty list, which is indistinguishable from a
  healthy route. Copy the id from --help rather than typing it.
  Needs the "tickets:read" scope. A key without it gets a 403, not an empty
  list.
  This reads a snapshot the server polls on a timer. It never calls the ticket
  provider on your request, so an issue published in the last few minutes may
  not be here yet.
  To verify what the server actually returned, untouched:
    nexus api GET /known-issues --query route=workflow.node.test`
    )
    .action(async (routeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.knownIssues.forRoute(routeId);

        printEnvelope(result, () => {
          if (!result.polled) {
            console.log(
              color.yellow(
                `Not checked yet — the server has not read the ticket provider since it started.`
              )
            );
            console.log(color.dim(`This is NOT a clean bill of health for ${result.route}.`));
            return;
          }

          if (result.issues.length === 0) {
            console.log(`No published issues for ${result.route}.`);
            console.log(
              color.dim(
                "Only issues a human marked publishable appear here, so this is not proof the command works."
              )
            );
            return;
          }

          printTable(result.issues, [
            { key: "identifier", label: "ID", width: 12 },
            { key: "status", label: "STATUS", width: 16 },
            { key: "title", label: "TITLE", width: 60 },
            { key: "url", label: "URL", width: 48 }
          ]);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after the hand-written prose, so the generated reference lands
  // below the Notes. `Params.route` is this descriptor's only field and the
  // positional above fills it, so there is no enum here and nothing to declare
  // body-only — what the binding buys is `--print-contract` and a --help block
  // naming the route the SDK actually calls.
  bindCommand(knownIssues, KNOWN_ISSUES_FOR_ROUTE_CONTRACT);
}
