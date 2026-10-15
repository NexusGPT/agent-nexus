import type { Command } from "commander";

import { handleError, refuse, reportFailure } from "../../errors";
import { isJsonMode } from "../../output";
import { parseJsonObjectFlag } from "../../util/json-object-flag";
import {
  createMcpTransport,
  readCallPayload,
  readCallResult,
  toolsCallMessage
} from "../../util/mcp-rpc";
import { ONE_SHOT_ID, requestResult } from "./_shared/rpc-request";
import { CALL_NOTES } from "./copy/call-notes";

/** `nexus mcp call` */
export function registerMcpCallCommand(mcp: Command, program: Command): void {
  mcp
    .command("call")
    .description("Invoke one MCP tool and print what it returned")
    .argument("<tool>", "Tool name as it appears in `nexus mcp tools list`")
    .option("--input <json>", "Tool arguments as a JSON object (default: {})")
    .option("--raw", "Print the untouched JSON-RPC result instead of the tool's payload")
    .addHelpText("after", CALL_NOTES)
    .action(async (name: string, opts: { input?: string; raw?: boolean }) => {
      try {
        // `util/json-object-flag.ts` owns this refusal, shared with
        // `mcp-server call --arguments`: two spellings of one check would let the
        // two namespaces — one suffix apart — disagree about what is wrong.
        const args = parseJsonObjectFlag(opts.input, "--input");
        if ("reason" in args) {
          process.exitCode = refuse(
            args.reason,
            `Run "nexus mcp tools get ${name}" for its input schema.`
          );
          return;
        }

        const transport = createMcpTransport(program.optsWithGlobals());
        const result = await requestResult(
          transport,
          toolsCallMessage(ONE_SHOT_ID, name, args.object),
          `Run "nexus mcp tools list" to see the names this key exposes.`
        );
        if (result === undefined) return;

        const call = readCallResult(result);
        if (call.isError === true) {
          const payload = readCallPayload(call);
          process.exitCode = reportFailure(
            "remote-error",
            `Tool "${name}" returned an error: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`,
            `Run "nexus mcp tools get ${name}" to check the input schema and the scope it needs.`
          );
          return;
        }

        const output = opts.raw ? result : readCallPayload(call);
        // Printed like `nexus api`: one JSON document, pretty by default and
        // compact under --json, because the payload has no fixed table shape.
        console.log(JSON.stringify(output, null, isJsonMode() ? undefined : 2));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
