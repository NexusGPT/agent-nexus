import type { McpServerToolCounts } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, printEnvelope, printTable } from "../../output";
import { MCP_SERVER_LIST_CONTRACT } from "../mcp-server.contract.generated";

/**
 * One header per published tool-status count, TOTAL over
 * `keyof McpServerToolCounts`.
 *
 * 🚨 THE TOTALITY IS THE POINT, NOT THE FIFTH COLUMN. This table carried a
 * hand-written `approved` / `pending` / `drifted = changed + removed`, which is
 * four of the five `McpToolStatus` members — and the one it dropped was
 * `REJECTED`, so a tool an administrator had answered NO to was uncounted in
 * this view and reachable only through `mcp-server get`. Nothing was red,
 * because the missing status was a column nobody wrote rather than a value
 * nobody read.
 *
 * `McpServerToolCountsSchema`'s own docblock names that hazard and solves it one
 * layer up — "adding a status to `McpToolStatus` must not leave a count silently
 * uncollected" — with `PUBLIC_TOOL_COUNT_KEY_BY_STATUS`, a
 * `Record<McpToolStatusValue, keyof McpServerToolCounts>` that fails to compile
 * when the enum grows. The `satisfies` below re-establishes that guarantee HERE,
 * at the consumer that dropped it: a count this CLI can see and has no header
 * for is a compile error.
 *
 * ⚠️ NO COMPOSITE COLUMN, DELIBERATELY. `changed + removed` reads as one number
 * and is two facts, and `rejected` is neither of them — it is an administrator's
 * decision, not the remote drifting — so folding it into a widened `drifted`
 * would hide the same status behind different arithmetic. Declaration order is
 * the column order, `APPROVED` first because it is the only callable status.
 */
const TOOL_COUNT_HEADERS = {
  approved: "APPROVED",
  pendingApproval: "PENDING",
  changed: "CHANGED",
  removed: "REMOVED",
  rejected: "REJECTED"
} as const satisfies Readonly<Record<keyof McpServerToolCounts, string>>;

/**
 * The count columns, derived from {@link TOOL_COUNT_HEADERS}.
 *
 * `Object.keys(…) as readonly K[]` follows `exit-codes.ts`'s `EXIT_CATEGORIES`:
 * `Object.keys` widens to `string[]`, and `printTable`'s `ColumnKey<T>` is
 * `Extract<keyof T, string>`, so the key type has to be carried across that one
 * call. Exported for
 * `list.counts-every-tool-status.test.ts`, which compares this set
 * with the PUBLISHED schema's own shape at runtime — a different question from
 * the `satisfies` above, and that spec's header says why neither covers the other.
 */
export const MCP_SERVER_LIST_TOOL_COUNT_COLUMNS = (
  Object.keys(TOOL_COUNT_HEADERS) as readonly (keyof McpServerToolCounts)[]
).map((key) => ({
  key,
  label: TOOL_COUNT_HEADERS[key],
  // The header is the widest cell the column can need: every value is a small
  // non-negative integer and every label is at least seven characters.
  width: TOOL_COUNT_HEADERS[key].length
}));

const LIST_HELP = `
Examples:
  $ nexus mcp-server list
  $ nexus mcp-server list --json

Notes:
  AN EMPTY LIST IS THE ORDINARY ANSWER and exits 0. It means this organization has
  registered no MCP server — never that a read was refused and never a scoping
  failure, because the read is anchored on your API key's organization.
  THIS IS NOT PAGINATED. The contract declares no cursor: an organization's
  registered servers are a set an administrator maintains by hand, not a table.
  THE TOOL COUNTS ARE THE WHOLE POINT OF THIS VIEW. Only APPROVED tools are
  callable, so "approved 0" on a server whose sync SUCCEEDED means an
  administrator has not answered for anything on it yet — the server is reachable
  and nothing on it can be called. Run "mcp-server get <serverId>" for the names.
  THERE IS ONE COLUMN PER TOOL STATUS AND NO COMBINED ONE. PENDING was never
  answered; CHANGED and REMOVED are the remote drifting from what was approved;
  REJECTED is an administrator answering no, which is a decision rather than
  drift. None of the four is callable, and they are counted apart because the
  remedy differs: drift is re-approved, a rejection is reconsidered.
  DISPLAY NAME IS YOURS, URL IS YOURS. Both were typed by whoever registered the
  server, so neither is text a remote chose. Everything "get" prints about a TOOL
  is the remote's own text.
  LAST SYNC IS THE TOOL LIST'S FRESHNESS, NOT A LIVENESS CHECK. "QUEUED" means a
  sync was asked for and has not answered, so the counts beside it are whatever
  the previous one left. A FAILED sync carries a code naming a CLASS of failure
  and never the remote's own error text, which can echo a credential.`;

/** `nexus mcp-server list` */
export function registerMcpServerListCommand(mcpServer: Command, program: Command): Command {
  const leaf = mcpServer
    .command("list")
    .description("List the MCP servers this organization has registered")
    .addHelpText("after", LIST_HELP)
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.mcpServers.list();

        printEnvelope(result, () => {
          if (result.servers.length === 0) {
            console.log("No MCP servers are registered for this organization.");
            console.log(
              color.dim(
                "An administrator registers one in the dashboard; this CLI reads them and calls approved tools."
              )
            );
            return;
          }

          printTable(
            result.servers.map((server) => ({
              serverId: server.serverId,
              displayName: server.displayName,
              // SPREAD, never a hand-picked subset: the row then carries one
              // field per published count and the columns key straight onto
              // them, so the values cannot drift from the headers. Picking
              // fields off this object by hand is what dropped `rejected`.
              ...server.toolCounts,
              lastSync: server.lastSyncOutcome ?? "never",
              // The code and not the outcome, because a FAILED row's whole
              // diagnostic is which class of failure it was.
              errorCode: server.lastSyncErrorCode ?? ""
            })),
            [
              { key: "serverId", label: "SERVER ID", width: 36 },
              { key: "displayName", label: "NAME", width: 24 },
              ...MCP_SERVER_LIST_TOOL_COUNT_COLUMNS,
              { key: "lastSync", label: "LAST SYNC", width: 10 },
              { key: "errorCode", label: "ERROR", width: 28 }
            ]
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, MCP_SERVER_LIST_CONTRACT);
  return leaf;
}
