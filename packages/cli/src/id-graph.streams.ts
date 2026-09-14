/**
 * WHICH STREAM IS THE DOCUMENT, AND WHICH STREAM IS COMMENTARY ABOUT IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE CLI'S `--json` CONTRACT IS ABOUT **STDOUT**, AND IT DELIBERATELY WRITES
 *    DIAGNOSTICS TO STDERR ON A PERFECTLY HEALTHY RUN.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The root epilogue's promise is stable and verbatim: "--json prints ONE JSON
 * document on STDOUT and nothing else." Three shipped features rely on the
 * second half of that sentence being about stdout only, and each of them writes
 * to stderr on a run where nothing whatsoever is wrong:
 *
 *   - the response-contract warning (`contract-warnings.ts`), ON BY DEFAULT,
 *   - the retry notice (`client.ts` → `reportRetryOnStderr`), and
 *   - the deprecation notice (`deprecation-notice.ts` → `emitToStderr`),
 *
 * and none of the three is gated on `isJsonMode()` — each says so at its own
 * declaration, because a conditional write is one `if` away from being wrong in
 * the direction that costs the contract. `client.ts` states the invariant for
 * the first two outright: "Both of these write to stderr and neither writes to
 * stdout, so a `--json` document stays a single parseable value with either or
 * both firing."
 *
 * So a harness that concatenates the two streams and asks whether the RESULT is
 * JSON is not asking about the CLI's contract. It is asking whether the command
 * was silent, which the CLI never promised and deliberately is not.
 *
 * ── THE TWO FAILURES THAT CAUSED, IN THE ORDER THEY BITE ────────────────────
 *
 * 🔴 **THE SECOND ONE IS THE SEVERE ONE, AND IT IS SILENT.** `scan-response.py`
 * parses before it walks: its `scan()` does `json.loads(text)` and returns
 * `1, []` on failure, so `findings()` — the credential walk this whole gate
 * exists for — NEVER RUNS on a body that did not parse. Concatenating stderr
 * therefore does not extend the secret scan to stderr; it DISABLES the secret
 * scan over stdout. One byte of commentary blinds it to the entire response.
 *
 * Measured 2026-09-09 on one response document, the scanner unmodified:
 *
 *   scan(stdout alone)                     exit 2   pushToken (len 40)
 *   scan(stdout + 332 bytes of stderr)     exit 1   NOT-JSON
 *   scan(stdout alone, control)            exit 2   pushToken (len 40)
 *
 * The middle row is a leaf whose response carried a credential, reported as a
 * formatting complaint, with the credential never looked for. That is precisely
 * failure mode 2 in `scan-response.py`'s own header — "a leaf whose RESPONSE
 * gains a token field later" — arriving through the caller rather than past the
 * table.
 *
 * ⚠️ The first failure is the visible one: a leaf is reported `FAILED` with
 * "exit=0 but the response is not JSON" about a response that IS JSON. That is
 * a false statement about the product, and its remedy points at the CLI when
 * the finding is about the API. `document get` is where it landed —
 * `GET /documents/:documentId` publishes `size` as `number | null` and the
 * server sends a decimal string, because `Document.size` is Prisma `BigInt?`
 * and `main.ts` installs `BigInt.prototype.toJSON`. That drift is real, known
 * and owned elsewhere (NEX-4123); the contract warning reporting it is the
 * CLI working, not breaking.
 *
 * ── WHY THE MERGED TEXT IS STILL RETURNED ───────────────────────────────────
 *
 * A REFUSAL is not a document. `errors.ts` prints an error to stderr, and
 * `outcomeForExitCode` reads that sentence to tell a client-side refusal from a
 * 400 the server sent. So the non-zero path genuinely needs both streams, and
 * `transcript` is what it gets. The split is per-QUESTION, never per-stream:
 * ask "is this a document?" of {@link LeafOutput.body}, and "what went wrong?"
 * of {@link LeafOutput.transcript}.
 */

/** What a spawned leaf wrote, before anything has decided what it means. */
export interface CapturedStreams {
  readonly stdout: string | null | undefined;
  readonly stderr: string | null | undefined;
}

/** One leaf's output, split by the question each half can answer. */
export interface LeafOutput {
  /**
   * THE DOCUMENT — stdout alone, and the only thing that may be parsed or
   * scanned. Handing anything wider to `scan-response.py` reopens the hole in
   * this module's header.
   */
  readonly body: string;
  /**
   * BOTH STREAMS, for reading a refusal. An error's text lives on stderr, so a
   * non-zero exit is diagnosed from here and never from `body`.
   */
  readonly transcript: string;
  /**
   * How many bytes of commentary the leaf wrote. Reported, never quoted: the
   * report reaches a CI log and an unscanned stream may carry a credential, so
   * the VOLUME is the most that can be said about it safely.
   */
  readonly diagnosticBytes: number;
}

/**
 * Split one leaf's captured streams into the document and the commentary.
 *
 * Pure, and in `src/` rather than in the runner for the reason that module's
 * header states: `scripts/id-thread-sweep.ts` ends in `main()`, so importing it
 * RUNS the sweep and nothing in it can be reached by a spec. The refusal
 * parser, the outcome mapping, the race verdict and the thread plan all moved
 * out for exactly that reason, and this is the same move.
 */
export function splitLeafOutput(streams: CapturedStreams): LeafOutput {
  const stdout = streams.stdout ?? "";
  const stderr = streams.stderr ?? "";

  return {
    body: stdout,
    transcript: `${stdout}${stderr}`,
    diagnosticBytes: Buffer.byteLength(stderr, "utf8")
  };
}
