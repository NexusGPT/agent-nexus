import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError, refuse, reportFailure } from "../../errors";
import { printEnvelope } from "../../output";
import { MCP_SERVER_TOOL_CALL_CONTRACT } from "../mcp-server.contract.generated";
import { CALL_HELP } from "./call.help";
import { buildMcpCallBody } from "./call-body";
import { describeMcpCallFailure } from "./call-failure";
import { resolveMcpCallInputs } from "./call-inputs";
import { renderMcpCallResult } from "./call-render";

/** `nexus mcp-server call` */
export function registerMcpServerCallCommand(mcpServer: Command, program: Command): Command {
  const leaf = mcpServer
    .command("call")
    .description("Call one APPROVED tool on one of this organization's MCP servers")
    .argument("<serverId>", "Server UUID as it appears in `nexus mcp-server list`")
    .argument("<toolName>", "Tool name exactly as `nexus mcp-server get` prints it")
    .option("--arguments <json>", "Tool arguments as a JSON object (default: {})")
    .option("--credential-id <uuid>", "Credential to spend, instead of the oldest shared one")
    .option("--access-card-id <uuid>", "Access Card to enforce under, instead of the master card")
    .option("--card-variables <json>", "Values for the named card's variables, as a JSON object")
    .option(
      "--expected-schema-hash <hash>",
      "Refuse unless the approved contract still hashes to this"
    )
    .addHelpText("after", CALL_HELP)
    .action(
      async (
        serverId: string,
        toolName: string,
        opts: {
          arguments?: string;
          credentialId?: string;
          accessCardId?: string;
          cardVariables?: string;
          expectedSchemaHash?: string;
        }
      ) => {
        try {
          const inputs = resolveMcpCallInputs(opts, serverId);
          if ("reason" in inputs) {
            process.exitCode = refuse(inputs.reason, inputs.hint);
            return;
          }

          const client = createClient(program.optsWithGlobals());
          const result = await client.mcpServers.callTool(
            serverId,
            buildMcpCallBody(toolName, opts, inputs)
          );

          // 🔴 THE FAILURE BRANCH RETURNS BEFORE THE PAYLOAD IS PRINTED, AND THE
          // ORDER IS THE WHOLE POINT. Printing the result first and reporting the
          // failure after reads better and breaks the --json contract: the payload
          // claims stdout, `emitDocument`'s first-wins rule pushes the error
          // document to stderr, and a caller gets a NON-ZERO exit with no error
          // document on the stream it parses. `json-one-document.test.ts` calls that
          // `error-masked` and its ceiling is ZERO — correctly, because a script
          // reading stdout cannot tell that run from a success.
          //
          // `call-failure.ts` owns what the document SAYS and why its category is
          // `remote-error`; this branch owns only that it comes first.
          if (result.isError) {
            const failed = describeMcpCallFailure(result);
            process.exitCode = reportFailure(failed.cause, failed.message, failed.hint);
            return;
          }

          printEnvelope(result, () => {
            renderMcpCallResult(result);
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
  bindCommand(leaf, MCP_SERVER_TOOL_CALL_CONTRACT);
  return leaf;
}
