import type { ConnectCredentialBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse } from "../../errors";
import { printSuccess } from "../../output";
import { readStringField, resolveBody } from "../../util/body";
import { CREDENTIAL_CONNECT_HELP } from "./connect.help";

/**
 * `nexus credential connect` — OAuth or API key, chosen by which flag you pass.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE FOUR REFUSALS BELOW MUST STAY INSIDE THIS `.action(` CALLBACK, IN THIS
 *    FILE, UNDER A CHAIN THAT DECLARES `--body`.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `test/unit/required-field-refusals-name-both-paths.ts` is the gate that keeps a
 * presence refusal from naming only the flag when the field can also come from
 * `--body`. Its MODEL of a command is three things in one file: it brace-matches
 * each `.action(`, walks BACK to the nearest preceding `.command(` and requires
 * `.option("--body <json` in that chain, and then reads the STRING LITERALS in
 * the action's own text.
 *
 * So all three of the obvious tidy-ups delete this file's refusals from that
 * gate's POPULATION, and none of them reds anything:
 *
 *   · moving the branch logic to a `_shared/` resolver — no `.action(` there, so
 *     `actionBodies()` returns nothing and the file is never scanned;
 *   · hoisting the messages to module-level consts — the literal leaves the
 *     action's text, and a const NAME is not a string;
 *   · `.action(connectAction)` with the body as a named function — the action's
 *     text becomes one identifier.
 *
 * Each one leaves four refusals uncovered while the gate goes on reporting the
 * tree clean. That is why this registrar carries its whole branch inline and is
 * kept under the 80-line cap by moving PROSE out — the help block — rather than
 * by moving CODE out.
 *
 * ⚠️ AND EACH MESSAGE KEEPS `--body` IN ITS FIRST STRING LITERAL, which is a
 * constraint on the WRAP and not only on the words: the gate reads one literal
 * at a time, so a mention of `--body` that prettier pushes into the second half
 * of a concatenation reads as naming only the flag. That reddened in CI after
 * passing locally once already.
 *
 * ── TWO NOTES THAT USED TO SIT INSIDE THE ACTION ─────────────────────────────
 *
 * They are here because the 80-line cap is spent on the branch itself, and
 * PROSE is the only thing this registrar can afford to move:
 *
 *   · Each arm is built as a TYPED member of the server's own discriminated
 *     union, and the arm is chosen by testing the field that arm REQUIRES — so
 *     the compiler carries the narrowing and no cast stands in for it.
 *   · `--tool` with `--service` is refused rather than silently dropped: a
 *     caller who passed it believes the account is being authorized FOR that
 *     tool, and it is not.
 */
/**
 * The two shapes a connect answers with, under their own sentence.
 *
 * `authType` is the discriminator the help block documents: `oauth` means
 * NOTHING is connected yet and a browser flow is pending, `api_key` means the
 * credential exists as of this answer. Two different facts, so two sentences.
 */
function printConnectResult(result: { readonly authType: string }): void {
  if (result.authType === "oauth") {
    printSuccess("OAuth flow initiated.", result);
    return;
  }
  printSuccess("App connected.", result);
}

export function registerCredentialConnectCommand(credential: Command, program: Command): void {
  credential
    .command("connect")
    .description("Connect an external app (OAuth or API key)")
    .option("--service <service>", "OAuth service or Pipedream app slug to authorize")
    .option("--api-key-value <key>", "API key to store (API-key branch)")
    .option("--tool <id>", "Marketplace tool the API key belongs to (API-key branch)")
    .option("--name <name>", "Label for the credential the API-key branch creates")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", CREDENTIAL_CONNECT_HELP)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);

        const service = readStringField(opts.service, base, "service");
        const apiKey = readStringField(opts.apiKeyValue, base, "apiKey");
        const toolId = readStringField(opts.tool, base, "toolId");

        if (service !== undefined && apiKey !== undefined) {
          process.exitCode = refuse(
            "Pass --service or --api-key-value, not both — as flags or inside --body. " +
              "--service selects OAuth; --api-key-value selects the API key.",
            "nexus credential connect --service GMAIL\n" +
              "  nexus credential connect --tool <tool-id> --api-key-value <key>"
          );
          return;
        }

        let body: ConnectCredentialBody;
        if (apiKey !== undefined) {
          if (toolId === undefined) {
            process.exitCode = refuse(
              "--tool is required with --api-key-value, as a flag or in --body. " +
                "The key is stored against that tool's auth block, so this branch names a " +
                "tool where the OAuth one has none.",
              "nexus credential connect --tool <tool-id> --api-key-value <key>\n" +
                "  Resolve the tool id with: nexus tool search --query <name>"
            );
            return;
          }
          const name = readStringField(opts.name, base, "name");
          body = {
            authType: "api_key",
            toolId,
            apiKey,
            ...(name !== undefined && { name })
          };
        } else if (service !== undefined) {
          if (toolId !== undefined) {
            process.exitCode = refuse(
              "--tool is not accepted with --service, as a flag or in --body. " +
                "An OAuth connection belongs to the account, not to a tool.",
              "nexus credential connect --service GMAIL"
            );
            return;
          }
          body = { authType: "oauth", service };
        } else {
          process.exitCode = refuse(
            "One of --service or --api-key-value is required, as a flag or in --body. " +
              "--service selects OAuth; --api-key-value selects the API key (a flag wins " +
              "over --body).",
            "nexus credential connect --service GMAIL\n" +
              "  nexus credential connect --tool <tool-id> --api-key-value <key>\n" +
              "  e.g. --service GMAIL (built-in OAuth) or --service google_sheets (Pipedream app slug)"
          );
          return;
        }

        printConnectResult(await client.credentials.connect(body));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
