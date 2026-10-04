import type { HandshakeStatusResponse } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import {
  CLI_HANDSHAKE_EXPIRED,
  CLI_HANDSHAKE_PENDING,
  handleError,
  printFailure,
  reportFailure
} from "../../errors";
import { EXIT_CODES } from "../../exit-codes";
import { isJsonMode, printRecord, type RecordField } from "../../output";
import { TOOL_CONNECTION_STATUS_HELP } from "./copy/connection-status-help";

/**
 * The handshake columns, named once because FIVE code paths print them now.
 *
 * `connection-status` used to have one printer and one exit; it has four arms,
 * and a per-arm copy of this array is four things to drift.
 */
const HANDSHAKE_FIELDS: readonly RecordField<HandshakeStatusResponse>[] = [
  { key: "status", label: "Status" },
  { key: "connectionId", label: "Connection ID" },
  { key: "errorMessage", label: "Error" },
  { key: "expiresAt", label: "Expires At" }
];

/** `nexus tool connection-status` — where a handshake got to. */
export function registerToolConnectionStatusCommand(tool: Command, program: Command): void {
  tool
    .command("connection-status")
    .description("Poll OAuth handshake status")
    .argument("<handshake-id>", "Handshake ID from connect response")
    .addHelpText("after", TOOL_CONNECTION_STATUS_HELP)
    .action(async (handshakeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.toolConnection.pollStatus(handshakeId);
        // FOUR STATES, THREE MEANINGS, and this command's own help already spells
        // them out: anything other than PENDING is a stop condition.
        //
        //   COMPLETED  the handshake worked. Exit 0, and print the record — the
        //              `connectionId` on it IS the thing the caller came for.
        //   PENDING    the browser flow has not finished. NOTHING HAS BEEN
        //              JUDGED, so this is `unmeasured`, never a failure: a poll
        //              loop must be able to tell "keep going" from "it broke"
        //              without parsing the document it just printed.
        //   FAILED     terminal, and the platform says why.
        //   EXPIRED    terminal, and the handshake outlived `expiresAt`.
        //
        // FAILED and EXPIRED both exit `remote-error` and never share a `code`:
        // one is fixed by reading `errorCode` and retrying the same connection,
        // the other only by starting a new handshake. Deliberately NOT
        // `timed-out`, whose declaration says the server may still be completing
        // the request — an expired handshake definitively is not.
        if (result.status === "COMPLETED") {
          printRecord(result, HANDSHAKE_FIELDS);
        } else if (result.status === "PENDING") {
          if (!isJsonMode()) printRecord(result, HANDSHAKE_FIELDS);
          printFailure(
            // 🚨 THE DEADLINE IS INTERPOLATED, NOT POINTED AT. Under --json the
            // error document REPLACES the record, so a hint saying "expiresAt is
            // on this document" would name a field that is not there — a hint
            // that sends the reader to nothing. The scalars this command's own
            // next-step advice depends on travel INSIDE the message and the hint.
            `The handshake is still PENDING — the browser flow has not finished. It expires at ${result.expiresAt ?? "an unpublished time"}.`,
            CLI_HANDSHAKE_PENDING,
            "Nothing failed and nothing passed. Poll again, and bound your loop with the expiry above. The exit code is UNMEASURED, never a failure."
          );
          process.exitCode = EXIT_CODES.unmeasured;
        } else if (result.status === "EXPIRED") {
          if (!isJsonMode()) printRecord(result, HANDSHAKE_FIELDS);
          printFailure(
            `The handshake EXPIRED — it outlived ${result.expiresAt ?? "its deadline"} without completing.`,
            CLI_HANDSHAKE_EXPIRED,
            'Start a new one with "nexus tool connect". This handshake can no longer complete.'
          );
          process.exitCode = EXIT_CODES["remote-error"];
        } else {
          if (!isJsonMode()) printRecord(result, HANDSHAKE_FIELDS);
          process.exitCode = reportFailure(
            "remote-error",
            // Same reason: `errorCode` is the field this command's help tells a
            // caller to branch on, so it travels in the message rather than
            // being referred to. `null` is a REAL value here — the help is
            // explicit that a null errorCode beside FAILED means "read
            // errorMessage", never "there was no error" — so it is printed as
            // `null` rather than omitted, which would make absent and
            // unclassified look identical.
            `The handshake FAILED [errorCode: ${result.errorCode ?? "null"}]: ${result.errorMessage ?? "no message given"}`,
            "Branch on the errorCode above, never on the message text. A null errorCode beside FAILED means read the message — it never means there was no error."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
