/**
 * THE GLOBAL FLAGS, THE UPDATE CONTRACT, AND HOW TO READ THE OUTPUT.
 *
 * The first third of the root epilogue. Facts that hold for MORE THAN ONE
 * command belong in the epilogue rather than being repeated per command; facts
 * about one command belong on that command, where the reader is when they need
 * them. `root-help-epilogue.ts` composes this with its three siblings.
 *
 * ⚠️ THE FLAG LIST HERE IS PROSE AND THE DERIVED ONE IS NOT. This block spells
 * the globals out WITH their resolution order, for a reader on the root screen.
 * `root-global-flags-footer.ts` derives the same set from `program.options` for
 * every SUBCOMMAND screen, and that one is the authority — a flag added to the
 * root appears there by itself and has to be added here by hand.
 */
export const ROOT_EPILOGUE_FLAGS = `  Global flags work anywhere in the line, before or after the subcommand:
    --json                 machine-readable output
    --profile <name>       use a named profile instead of the active one
    --api-key <key>        override the key for this invocation
    --base-url <url>       point at another environment
    --timeout <seconds>    client-side only; default 30, and 600 for the
                           operations that run a model before they answer
                           (task execute, tool execute, external-tool test, …)
    --auto-update          self-update on exit; OFF by default

  UPDATES
    This CLI does NOT install over itself unless you pass --auto-update. Without
    it you get one line naming the newer version and the command that installs
    it. Set NEXUS_NO_AUTO_UPDATE=1, or run where CI is set, and it also stops
    ASKING npm — no request on any invocation, and the notice comes from
    whatever the last check left on disk. --json skips both.

    Keeping the flag off by default is deliberate: a self-install replaces the
    directory this binary is running from and cannot relink the global shim
    itself, so an interrupted one leaves a shim pointing at nothing. Once that
    happens NO nexus command runs — not even --no-auto-update — because the
    failure is in Node's module resolution, before any of this code.
    Reinstalling is the only repair.

  READING THE OUTPUT
    --json prints ONE JSON document on STDOUT and nothing else. Warnings, the
    profile banner and progress go to STDERR, so a pipe stays parseable. Without
    --json you get a table, and a table COLUMN IS TRUNCATED TO ITS WIDTH — never
    parse one, and never conclude a value is short because it looked short.
    "-" and a blank cell mean NULL, which is not zero and not false.
    A list command prints only the columns it chose; --json can carry fields the
    table does not show, and a few commands drop response fields from BOTH. When
    a value matters and you cannot see it, "nexus api GET <path>" returns the
    untouched response.`;
