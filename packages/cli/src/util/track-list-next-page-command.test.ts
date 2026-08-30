import { describe, expect, it } from "vitest";

import { shellQuote, trackListNextPageCommand } from "./track-list-next-page-command";

/**
 * THE PRINTED NEXT-PAGE COMMAND MUST ACTUALLY RUN.
 *
 * Both defects this gates shipped in the first draft of the `tracks list` page
 * footer and were caught in review. They share a shape: the command LOOKS
 * authoritative, and refuses when pasted — which is strictly worse than printing
 * nothing, because the reader trusts it before they test it.
 *
 * The fixtures use the REAL token format from `encodeTrackListCursor`:
 * `<afterNumber>~<status>.<archived>.<nextOwner>`, where an omitted status or
 * next-owner is the literal `*`. So `50~*.exclude.*` is not a contrived hostile
 * input — it is what every UNFILTERED walk produces, which is the common case.
 */

/** What an unfiltered first page actually hands back. Two globs in it. */
const DEFAULT_CURSOR = "50~*.exclude.*";
/** What a filtered page hands back. */
const FILTERED_CURSOR = "50~DONE.exclude.USER";

describe("the printed next-page command survives the shell and the server", () => {
  it("CONTROL: the fixture really does carry a glob, or neither test below means anything", () => {
    // If the token format ever stops containing `*`, the quoting assertion still
    // passes and stops proving anything. This fails first and says why.
    expect(DEFAULT_CURSOR).toContain("*");
  });

  it("quotes the cursor, so an unfiltered token is paste-safe in zsh", () => {
    // Unquoted, zsh does not pass the literal through — an unmatched glob is
    // `no matches found` and the command never runs at all.
    const cmd = trackListNextPageCommand({}, DEFAULT_CURSOR);

    expect(cmd).toBe(`nexus tracks list --cursor '${DEFAULT_CURSOR}'`);
    expect(cmd).not.toContain(`--cursor ${DEFAULT_CURSOR}`);
  });

  it("carries every fingerprinted filter, because omitting one is a 400", () => {
    // The cursor stamps status/archived/nextOwner and the server compares that
    // stamp against the REPLAYING request. An absent `--status` fingerprints as
    // `*`, which is a different string from `DONE` — not a neutral default.
    const cmd = trackListNextPageCommand(
      { status: "DONE", archived: "include", nextOwner: "USER" },
      FILTERED_CURSOR
    );

    expect(cmd).toBe(
      `nexus tracks list --status DONE --archived include --next-owner USER --cursor '${FILTERED_CURSOR}'`
    );
  });

  it("carries --limit too, which changes the answer rather than refusing it", () => {
    // Not part of the fingerprint, so dropping it is not an error — it silently
    // changes the page size mid-walk, which is the worse of the two failures.
    expect(trackListNextPageCommand({ limit: 200 }, DEFAULT_CURSOR)).toBe(
      `nexus tracks list --limit 200 --cursor '${DEFAULT_CURSOR}'`
    );
  });

  it("omits a flag the caller did not pass, rather than inventing a default", () => {
    // Printing `--status *` or `--archived exclude` would be a command the
    // reader never ran, and `--status *` is not even a legal value.
    const cmd = trackListNextPageCommand({ archived: "only" }, DEFAULT_CURSOR);

    expect(cmd).toBe(`nexus tracks list --archived only --cursor '${DEFAULT_CURSOR}'`);
    expect(cmd).not.toContain("--status");
    expect(cmd).not.toContain("--next-owner");
    expect(cmd).not.toContain("--limit");
  });

  it("escapes a single quote, so the quoting cannot be broken out of", () => {
    // The token charset holds no quote TODAY. This asserts the escaper rather
    // than that fact, because the fact is one contract change away from false
    // and nothing type-checks a string's charset.
    expect(shellQuote("a'b")).toBe(`'a'\\''b'`);
  });
});
