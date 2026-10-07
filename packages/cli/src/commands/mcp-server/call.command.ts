import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError, refuse, reportFailure } from "../../errors";
import { color, printEnvelope } from "../../output";
import { parseJsonObjectFlag } from "../../util/json-object-flag";
import { MCP_SERVER_TOOL_CALL_CONTRACT } from "../mcp-server.contract.generated";
import { CALL_HELP } from "./call.help";

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
          const args = parseJsonObjectFlag(opts.arguments, "--arguments");
          if ("reason" in args) {
            process.exitCode = refuse(
              args.reason,
              `Run "nexus mcp-server get ${serverId}" for the tool's approved input schema.`
            );
            return;
          }
          const cardVariables = parseJsonObjectFlag(opts.cardVariables, "--card-variables");
          if ("reason" in cardVariables) {
            process.exitCode = refuse(
              cardVariables.reason,
              "A card that declares variables is unusable without values for them."
            );
            return;
          }

          const client = createClient(program.optsWithGlobals());
          const result = await client.mcpServers.callTool(serverId, {
            toolName,
            arguments: args.object,
            ...(opts.credentialId === undefined ? {} : { credentialId: opts.credentialId }),
            ...(opts.accessCardId === undefined ? {} : { accessCardId: opts.accessCardId }),
            ...(opts.cardVariables === undefined
              ? {}
              : { cardVariableValues: cardVariables.object }),
            // WRITTEN EVEN WHEN ABSENT, because the SDK's body makes this key
            // required with an optional VALUE: declining to pin has to be an act.
            // `undefined` and not `null` — the route spells the field optional, not
            // nullable, and the body is strict, so `null` is a 400.
            expectedSchemaHash: opts.expectedSchemaHash
          });

          // 🔴 THE FAILURE BRANCH RETURNS BEFORE THE PAYLOAD IS PRINTED, AND THE
          // ORDER IS THE WHOLE POINT. Printing the result first and reporting the
          // failure after reads better and breaks the --json contract: the payload
          // claims stdout, `emitDocument`'s first-wins rule pushes the error
          // document to stderr, and a caller gets a NON-ZERO exit with no error
          // document on the stream it parses. `json-one-document.test.ts` calls that
          // `error-masked` and its ceiling is ZERO — correctly, because a script
          // reading stdout cannot tell that run from a success.
          //
          // So the tool's own text travels INSIDE the error document instead. It is
          // the answer to a failed call, so losing it is not an option either.
          //
          // `remote-error` is the category: the request arrived, Nexus reached the
          // remote, and the TOOL refused. Not `invalid-input` — nothing about the
          // invocation was wrong, and a script must not read it as its own bug.
          if (result.isError) {
            const media =
              result.mediaBlocks.length === 0
                ? ""
                : ` ${String(result.mediaBlocks.length)} media block(s) are dropped on this path.`;
            process.exitCode = reportFailure(
              "remote-error",
              `Tool "${result.toolName}" reported that the call failed: ${result.text}`,
              `That text is the tool's own answer and is what to read to recover.${media}`
            );
            return;
          }

          printEnvelope(result, () => {
            console.log(color.bold(result.toolName));
            console.log(result.text);
            if (result.mediaBlocks.length > 0) {
              console.log();
              console.log(
                color.dim(
                  `${String(result.mediaBlocks.length)} image block(s) returned — read --json for the base64 data.`
                )
              );
            }
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
  bindCommand(leaf, MCP_SERVER_TOOL_CALL_CONTRACT);
  return leaf;
}
