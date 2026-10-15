import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import { nonBlankOr } from "../../util/present-text";
import {
  CREDENTIAL_LIST__PARAMS_SORT_BY,
  CREDENTIAL_LIST__PARAMS_SORT_ORDER,
  CREDENTIAL_LIST__PARAMS_SOURCE,
  CREDENTIAL_LIST__PARAMS_STATUS,
  CREDENTIAL_LIST_CONTRACT
} from "../credential.contract.generated";
import { CREDENTIAL_LIST_HELP } from "./list.help";

/**
 * `nexus credential list`
 *
 * ⚠️ `addHelpText` sits INSIDE the `addPaginationOptions(...)` argument and
 * `.action(...)` is chained onto its RESULT, exactly as the pre-split file had
 * it. That ordering decides which options exist when `bindCommand` reads them:
 * the pagination flags are appended by the wrapper, so they land after the
 * seven declared here and the generated reference renders them in that order.
 */
export function registerCredentialListCommand(credential: Command, program: Command): void {
  const credentialList = addPaginationOptions(
    credential
      .command("list")
      .description("List credentials")
      .addOption(
        enumOption(
          "--source <source>",
          "Filter by which record backs the row",
          CREDENTIAL_LIST__PARAMS_SOURCE
        )
      )
      .addOption(
        enumOption("--status <status>", "Filter by status", CREDENTIAL_LIST__PARAMS_STATUS)
      )
      .option("--service <service>", "Filter by service name")
      .option(
        "--tool-id <id>",
        "Only credentials scoped to this tool — the exact 'is it connected' check"
      )
      .option("--search <query>", "Case-insensitive substring over several fields — see Notes")
      .addOption(enumOption("--sort-by <field>", "Sort by field", CREDENTIAL_LIST__PARAMS_SORT_BY))
      .addOption(
        enumOption("--sort-order <order>", "Sort direction", CREDENTIAL_LIST__PARAMS_SORT_ORDER)
      )
      .addHelpText("after", CREDENTIAL_LIST_HELP)
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.credentials.list({
        ...getPaginationParams(opts),
        source: opts.source,
        status: opts.status,
        service: opts.service,
        toolId: opts.toolId,
        search: opts.search,
        sortBy: opts.sortBy,
        sortOrder: opts.sortOrder
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "service", label: "SERVICE", width: 20 },
        { key: "name", label: "NAME", width: 25 },
        { key: "source", label: "SOURCE", width: 18 },
        { key: "status", label: "STATUS", width: 15 },
        // SERVICE alone was read as an answer to "is this tool connected" and
        // it is not one — see the note in this command's --help. Full width, not
        // an abbreviation: this id is the argument of "nexus tool credentials"
        // and of --tool-id, so a cut one is a value the reader has to go and
        // look up again. "—" rather than a blank cell for the org-wide sources,
        // so "no tool" reads as an answer rather than as missing data.
        { key: "toolId", label: "TOOL ID", width: 36, format: (v) => nonBlankOr(v, "—") }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(credentialList, CREDENTIAL_LIST_CONTRACT);
}
