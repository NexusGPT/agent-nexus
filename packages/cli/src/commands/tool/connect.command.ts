import type { ConnectToolBody, ConnectToolHttpBody, ConnectToolOAuthBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse } from "../../errors";
import { printSuccess } from "../../output";
import { readStringField, resolveBody } from "../../util/body";
import { TOOL_CONNECT_HELP } from "./copy/connect-help";

/**
 * The `authType` discriminants `POST /tools/:toolId/connect` accepts.
 *
 * `satisfies` gates the list against the SDK's own union, so a value that stops
 * being a discriminant stops compiling here. If the server ever GROWS an arm,
 * this list is merely incomplete and `--auth-type <new-arm>` is refused locally
 * with the list above — a stated refusal, not a request built from the wrong
 * shape, which is the failure this whole command had.
 */
const CONNECT_AUTH_TYPES = [
  "oauth",
  "http"
] as const satisfies readonly ConnectToolBody["authType"][];

type ConnectAuthType = (typeof CONNECT_AUTH_TYPES)[number];

function isConnectAuthType(value: string): value is ConnectAuthType {
  return (CONNECT_AUTH_TYPES as readonly string[]).includes(value);
}

// Each branch builds a member of the server's own discriminated union
// (`ConnectToolBodySchema`, packages/types/src/api/public/v1/schemas/
// tool-connection.schemas.ts) as a TYPED literal, so the compiler holds
// the request to the contract: the OAuth arm cannot be built without a
// `service`, and a field the union does not declare cannot be added.
//
// The previous shape — an untyped bag asserted with `as any` at the
// call — could express neither constraint, and shipped three defects
// behind that one silence: an OAuth request that could never validate,
// an `--auth-header` the server stripped while the CLI reported
// success, and flag defaults that overwrote `--body`.
//
// NO flag here carries a commander default; `--auth-type`'s applies
// below, once both sources have been read. A default is not
// distinguishable from an explicit value, so declaring one on a flag
// that `--body` can also supply makes the flag always win.

/** `nexus tool connect` — start an OAuth flow, or store an API key. */
export function registerToolConnectCommand(tool: Command, program: Command): void {
  tool
    .command("connect")
    .description("Connect a tool via OAuth or HTTP credentials")
    .argument("<id>", "Tool ID")
    .option("--auth-type <type>", `Auth type: ${CONNECT_AUTH_TYPES.join(" or ")} (default: oauth)`)
    .option(
      "--service <service>",
      "OAuth service or Pipedream app slug to authorize (e.g. GOOGLE_SHEETS, google_sheets). Required for OAuth"
    )
    .option("--api-key-value <key>", "API key for HTTP auth")
    .option("--name <name>", "Label for the credential HTTP auth creates")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", TOOL_CONNECT_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);

        const rawAuthType = readStringField(opts.authType, base, "authType") ?? "oauth";
        if (!isConnectAuthType(rawAuthType)) {
          process.exitCode = refuse(
            `--auth-type must be one of: ${CONNECT_AUTH_TYPES.join(", ")} (got "${rawAuthType}").`
          );
          return;
        }

        if (rawAuthType === "http") {
          const apiKey = readStringField(opts.apiKeyValue, base, "apiKey");
          if (apiKey === undefined) {
            // The body key is apiKey, NOT apiKeyValue — the flag and the field
            // do not share a name here, so the message has to say which.
            process.exitCode = refuse(
              '--api-key-value is required for HTTP auth. Pass it as a flag, or as "apiKey" inside --body (the flag wins if you supply both).',
              "nexus tool connect <id> --auth-type http --api-key-value <key>\n" +
                '  nexus tool connect <id> --body \'{"authType":"http","apiKey":"<key>"}\''
            );
            return;
          }
          const name = readStringField(opts.name, base, "name");
          const httpBody: ConnectToolHttpBody = {
            authType: "http",
            apiKey,
            ...(name !== undefined && { name })
          };
          const result = await client.toolConnection.connect(id, httpBody);
          printSuccess("Tool connected via HTTP.", result);
          return;
        }

        const service = readStringField(opts.service, base, "service");
        if (service === undefined) {
          process.exitCode = refuse(
            '--service is required for OAuth. Pass it as a flag, or as "service" inside --body (the flag wins if you supply both).',
            "nexus tool connect <id> --service <service>\n" +
              '  nexus tool connect <id> --body \'{"authType":"oauth","service":"GOOGLE_SHEETS"}\'\n' +
              "  e.g. --service GOOGLE_SHEETS (built-in OAuth) or --service google_sheets (Pipedream app slug)"
          );
          return;
        }
        const oauthBody: ConnectToolOAuthBody = { authType: "oauth", service };
        const result = await client.toolConnection.connect(id, oauthBody);
        printSuccess("OAuth flow initiated.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
