import { describe, expect, it } from "vitest";

import { CLI_INVALID_ARGUMENTS } from "./errors";
import { isClientSideRefusal } from "./id-graph.refusal";

/**
 * THE SAFETY PROPERTY OF THE ID-THREAD SWEEP, GUARDED IN CI.
 *
 * `invalid-input` (5) is reached both by a client-side refusal that sent nothing
 * and by a 400/409/422 that came back over the wire. The first is a SKIP and the
 * second is a FAILURE, and the exit code cannot tell them apart.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 EVERY DOCUMENT HERE IS PRETTY-PRINTED, BECAUSE THAT IS WHAT THE CLI EMITS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `emitDocument` is `console.log(JSON.stringify(value, null, 2))` — it
 * pretty-prints UNCONDITIONALLY, so a real error document always spans several
 * lines. An earlier version of this file built its documents with a bare
 * `JSON.stringify`, producing SINGLE-LINE JSON the CLI never emits. Eleven tests
 * and a mutation control all passed against that shape while the reader could
 * not parse real output at all: the sweep concatenates stdout with stderr, and
 * with any noise beside it neither the whole blob nor any single line is valid
 * JSON.
 *
 * So {@link document} indents, and {@link noisy} puts stream text on both sides
 * of it. A fixture is a CLAIM about production; these two helpers are where that
 * claim is made, and they are the reason the rest of the file is worth running.
 *
 * 🚨 THE `false` CASES MATTER MORE THAN THE `true` ONES. A wrong `true` records a
 * broken route as a skip and lets the run exit 0 — a control reporting success
 * while the thing it guards is down. Everything ambiguous must return `false`,
 * because `false` means FAILED and FAILED is the loud direction.
 */
describe("telling a client-side refusal from a server rejection", () => {
  /** Exactly what `emitDocument` writes: two-space indent, multi-line. */
  const document = (code: string): string =>
    JSON.stringify({ error: { message: "refused", hint: null, code } }, null, 2);

  /** A document as the sweep actually sees it — stdout and stderr concatenated. */
  const noisy = (code: string): string =>
    `warning: unrelated stream noise\n${document(code)}\nanother trailing line\n`;

  describe("a client-side refusal is recognised in the shape the CLI emits", () => {
    it("pretty-printed, alone", () => {
      expect(isClientSideRefusal(document(CLI_INVALID_ARGUMENTS))).toBe(true);
    });

    it("pretty-printed, with stream noise on both sides", () => {
      // THE CASE THAT WAS BROKEN. Neither the whole blob nor any single line of
      // it is valid JSON, and a real refusal looks exactly like this.
      expect(isClientSideRefusal(noisy(CLI_INVALID_ARGUMENTS))).toBe(true);
    });

    it("pretty-printed, with a leading partial line", () => {
      expect(isClientSideRefusal(`half a line{ not json\n${document(CLI_INVALID_ARGUMENTS)}`)).toBe(
        true
      );
    });

    it("when the message itself contains a closing brace", () => {
      // String-awareness. A brace inside a JSON string must not close the region,
      // or a document with `}` in its prose truncates and fails to parse.
      const withBrace = JSON.stringify(
        { error: { message: "unexpected } in input", hint: null, code: CLI_INVALID_ARGUMENTS } },
        null,
        2
      );
      expect(isClientSideRefusal(`noise\n${withBrace}\nmore noise`)).toBe(true);
    });

    it("when an unrelated JSON object precedes it", () => {
      // The scan must keep looking after a complete object that is not the one.
      expect(isClientSideRefusal(`{ "unrelated": true }\n${document(CLI_INVALID_ARGUMENTS)}`)).toBe(
        true
      );
    });
  });

  describe("everything else is a FAILURE, never a skip", () => {
    it("a server validation error, pretty-printed with noise", () => {
      // The exact shape that made a broken route report as a skip. 422 and
      // CLI_INVALID_ARGUMENTS share an exit code and mean opposite things.
      expect(isClientSideRefusal(noisy("VALIDATION_ERROR"))).toBe(false);
    });

    it("a conflict", () => {
      expect(isClientSideRefusal(noisy("CONFLICT"))).toBe(false);
    });

    it("an unrecognised code", () => {
      expect(isClientSideRefusal(noisy("SOME_FUTURE_CODE"))).toBe(false);
    });

    it("a body that is not JSON at all", () => {
      expect(isClientSideRefusal("required option '--connection-id <id>' not specified")).toBe(
        false
      );
    });

    it("an empty body", () => {
      expect(isClientSideRefusal("")).toBe(false);
    });

    it("a document with no error field", () => {
      expect(isClientSideRefusal(JSON.stringify({ data: { id: "x" } }, null, 2))).toBe(false);
    });

    it("an error with no code", () => {
      expect(isClientSideRefusal(JSON.stringify({ error: { message: "boom" } }, null, 2))).toBe(
        false
      );
    });

    it("a truncated document", () => {
      // Cut off mid-write: the braces never balance, so nothing is read from it.
      expect(isClientSideRefusal(`{\n  "error": {\n    "code": "${CLI_INVALID_ARGUMENTS}"`)).toBe(
        false
      );
    });

    it("the code as a bare string in prose", () => {
      // Keyed on the parsed FIELD, never a substring. A message that merely
      // mentions the code must not flip the verdict.
      expect(isClientSideRefusal(`error: something about ${CLI_INVALID_ARGUMENTS} happened`)).toBe(
        false
      );
    });

    it("the code in a field that is not error.code", () => {
      expect(
        isClientSideRefusal(JSON.stringify({ error: { message: CLI_INVALID_ARGUMENTS } }, null, 2))
      ).toBe(false);
    });
  });
});
