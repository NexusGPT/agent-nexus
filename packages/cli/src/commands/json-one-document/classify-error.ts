import { KNOWN_CODES, NETWORK_STUB_MESSAGE, REMOTE_ONLY_CODES } from "./codes";
import type { ErrorOutcome } from "./outcome";

/**
 * Which error clause a FAILED run fell into, and why.
 *
 * Lifted verbatim out of `driveOne`'s IIFE. The two `let`s the IIFE assigned to
 * were locals of `driveOne`; they are locals here and come back in the return,
 * so the caller reads exactly what the IIFE used to leave behind.
 */
export function classifyErrorOutcome(input: {
  readonly failed: boolean;
  readonly documents: number;
  readonly prose: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly requestsAttempted: number;
}): { errorOutcome: ErrorOutcome; errorCode: string | undefined; miscodeReason: string } {
  const { failed, documents, prose, stdout, stderr, requestsAttempted } = input;
  let errorCode: string | undefined;
  let miscodeReason = "";

  const errorOutcome = ((): ErrorOutcome => {
    if (!failed) return "not-an-error";
    if (documents === 1 && !prose) {
      const value = JSON.parse(stdout.trim()) as { error?: { code?: unknown; message?: unknown } };
      const envelope = typeof value === "object" && value !== null ? value.error : undefined;
      if (envelope === undefined) return "error-masked";

      errorCode = typeof envelope.code === "string" ? envelope.code : undefined;
      const message = typeof envelope.message === "string" ? envelope.message : "";

      if (errorCode === undefined || !KNOWN_CODES.has(errorCode)) {
        miscodeReason = `code "${errorCode ?? "(absent)"}" is not one this CLI mints`;
        return "error-miscoded";
      }
      // SOUND: the harness itself made this a network failure, so the code must
      // say network. No inference — the sentinel is in the message.
      if (message.includes(NETWORK_STUB_MESSAGE) && errorCode !== "CLI_CONNECTION_FAILED") {
        miscodeReason = `the network stub caused it and the code says ${errorCode}`;
        return "error-miscoded";
      }
      // INFERRED, and therefore LEDGERED rather than absolute: an argument
      // refusal CAN legitimately follow a request — `auth login` validates the
      // profile NAME after checking the key against the API. Those are named in
      // the ledger; anything else is the defect.
      if (requestsAttempted > 0 && errorCode === "CLI_INVALID_ARGUMENTS") {
        miscodeReason = `${requestsAttempted} request(s) went out, then it reported a bad argument`;
        return "error-miscoded";
      }
      if (requestsAttempted === 0 && REMOTE_ONLY_CODES.has(errorCode)) {
        miscodeReason = `nothing left this process and the code says ${errorCode}`;
        return "error-miscoded";
      }
      return "error-document";
    }
    if (documents === 0 && !prose) return stderr === "" ? "error-mute" : "error-prose";
    // Prose or several documents on stdout during a failure. The one-document
    // clause already reports it; do not double-count it as an error defect.
    return "error-prose";
  })();

  return { errorOutcome, errorCode, miscodeReason };
}
