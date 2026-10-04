/** Appended to `nexus tool connection-status`. */
export const TOOL_CONNECTION_STATUS_HELP = `
Examples:
  $ nexus tool connection-status hs-abc-123
  $ nexus tool connection-status hs-abc-123 --json

Notes:
  FOUR STATES, AND ONLY ONE OF THEM MEANS KEEP POLLING:
    PENDING    the browser flow has not finished. Poll again.
    COMPLETED  terminal, and connectionId is now set — that is the connection.
    FAILED     terminal. Read errorMessage, and branch on errorCode.
    EXPIRED    terminal. The handshake outlived expiresAt; start again with
               "nexus tool connect".
  Anything other than PENDING is a stop condition. There is no timeout here and
  no retry budget, so the loop is yours to bound — expiresAt, returned by
  "tool connect" and echoed on every poll, is the deadline to bound it with.

  errorCode IS THE FIELD TO BRANCH ON, NEVER errorMessage. It is
  ORG_HAS_NO_MEMBERS, PIPEDREAM_TOOL_NOT_IN_MARKETPLACE or
  PIPEDREAM_INVALID_ACCOUNT, and it is null on PENDING and COMPLETED — and also
  null on a FAILED outcome nobody has classified yet, so a null errorCode beside
  FAILED means "read errorMessage", never "no error".

  connectionId IS null UNTIL COMPLETED. Do not read its absence as a failure
  while status is still PENDING.

  connectionId IS A NEXUS CREDENTIAL ID, NOT A PIPEDREAM ACCOUNT ID. COMPLETED
  means the credential is ALREADY STORED — this id names it, "nexus credential
  list" shows it, and no further command is needed to record it. In particular
  it is NOT what "tool create-credential --account-id" takes; that one wants
  Pipedream's own apn_ id, and passing this uuid there is refused.

  THE EXIT CODE SAYS WHICH OF THE FOUR, so a poll loop never has to parse this
  document to decide whether to keep going. COMPLETED exits 0. FAILED and EXPIRED
  exit non-zero, with different codes on the document: one is diagnosed from
  errorCode, the other can only be replaced by a new "nexus tool connect".
  PENDING exits non-zero too, under the UNMEASURED category — nothing failed and
  nothing passed, so it is deliberately not the failure code. Under --json a
  non-COMPLETED status REPLACES this record with the error document, and the two
  fields the advice above depends on — errorCode and expiresAt — are carried in
  that document's own message.`;
