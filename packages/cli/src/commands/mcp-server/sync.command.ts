import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError, printFailure } from "../../errors";
import { color, printEnvelope } from "../../output";
import { MCP_SERVER_SYNC_CONTRACT } from "../mcp-server.contract.generated";
import { SYNC_HELP } from "./sync.help";
import { describeMcpSyncRefusal } from "./sync-refusal";
import { classifyMcpSyncAnswer, isAcceptedMcpSyncVerdict } from "./sync-verdict";

/** `nexus mcp-server sync` */
export function registerMcpServerSyncCommand(mcpServer: Command, program: Command): Command {
  const leaf = mcpServer
    .command("sync")
    // 🔴 THE DESCRIPTION IS LOAD-BEARING BEYOND READABILITY. `cli-surface.generated.ts`
    // hashes module + flags + args + description and NOT the path, and this leaf shares
    // its module, its one `<serverId>` argument and its flag set with `mcp-server get` —
    // so the description is the only thing keeping the two shapes distinct. A reword
    // that converged on `get`'s would make the surface file declare a collision group.
    .description("Ask for one MCP server to be re-discovered and its tool list refreshed")
    .argument("<serverId>", "Server UUID as it appears in `nexus mcp-server list`")
    .addHelpText("after", SYNC_HELP)
    .action(async (serverId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const server = await client.mcpServers.sync(serverId);

        // 🔴 THE TWO COLUMNS TOGETHER, NEVER `lastSyncOutcome` ALONE. `FAILED` is two
        // opposite facts — the queue refused, or a discovery RAN and the remote lost —
        // and only `lastSyncErrorCode` separates them. `sync-verdict.ts` carries the
        // whole table and the reason a wrong reading makes a script retry work that
        // already ran.
        const verdict = classifyMcpSyncAnswer(server.lastSyncOutcome, server.lastSyncErrorCode);

        // 🔴 THE FAILURE BRANCH RETURNS BEFORE THE PAYLOAD IS PRINTED, AND THE ORDER IS
        // THE WHOLE POINT — the rule `call.command.ts` states. Printing first and
        // reporting after claims stdout for the payload, pushes the error document to
        // stderr under `emitDocument`'s first-wins rule, and hands a caller a non-zero
        // exit with no error document on the stream it parses.
        // `json-one-document.test.ts` calls that `error-masked` and its ceiling is ZERO.
        if (!isAcceptedMcpSyncVerdict(verdict)) {
          // 🔴 `printFailure` IS CALLED HERE RATHER THAN INSIDE THE HELPER, AND THAT IS
          // A GATE'S REQUIREMENT. `json-error-document.static-scan.ts` follows DIRECT
          // calls only — its own words: "a HELPER that emits a document is not followed
          // here … That errs toward REPORTING". With the emission buried in
          // `reportMcpSyncRefusal` this exit read as non-zero over an EMPTY stdout,
          // which is exactly what a scripted caller gets if the document never lands.
          // `createClient` above can write prose to stderr, so the pairing was complete.
          //
          // Two statements, in this order, both inside this block: the document claims
          // stdout and THEN the code is set. `scan-file.ts` folds a preceding sequential
          // statement into its path state, so the emission is visible to it here and
          // would not be if it sat in the other arm or after the `return`.
          const refusal = describeMcpSyncRefusal(verdict, server.displayName, serverId);
          printFailure(refusal.message, refusal.code, refusal.hint);
          process.exitCode = refusal.exitCode;
          return;
        }

        printEnvelope(server, () => {
          console.log(color.bold(server.displayName));
          console.log(color.dim(`${server.url}  ·  ${server.transport}`));
          console.log();
          console.log(
            verdict.outcome === "queued"
              ? "Discovery queued. Nothing has been dialled yet."
              : "Discovery already completed — the queue ran it before this answered."
          );
          console.log();
          // The counts are the PREVIOUS discovery's on the `queued` path, and saying so
          // is the point: the numbers are real and they are not this request's answer.
          const counts = server.toolCounts;
          console.log(
            color.dim(
              `Tools as of the last discovery: ${String(counts.approved)} approved, ` +
                `${String(counts.pendingApproval)} pending, ${String(counts.changed)} changed, ` +
                `${String(counts.removed)} removed, ${String(counts.rejected)} rejected`
            )
          );
          console.log(color.dim(`Read the result with: nexus mcp-server get ${serverId}`));
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  // LAST. `bindCommand` reads back what is already registered to render its contract
  // block and to record the binding the id-graph and the contract-help gate consume.
  bindCommand(leaf, MCP_SERVER_SYNC_CONTRACT);
  return leaf;
}
