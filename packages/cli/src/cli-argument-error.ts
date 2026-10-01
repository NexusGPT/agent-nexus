/**
 * COMMANDER REFUSED THE INVOCATION, AND IT USED TO DO SO WITHOUT A DOCUMENT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE EPILOGUE'S SECOND `--json` CLAUSE HAD NO FUNNEL AT ALL.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus --help` promises: "Under --json an error is a JSON document on STDOUT:
 * {"error":{"message","hint","code"}}". Every failure that reached `handleError` in `errors.ts`
 * kept that promise. An argument refusal never reached it — commander writes its
 * own sentence to stderr and calls `process.exit(1)` from inside the parser, so
 * stdout is EMPTY. Measured over every leaf: 41 commands refuse this way, and a
 * caller gets a non-zero exit with nothing to parse and nothing to branch on.
 *
 * `installArgumentRefusalReporting` turns that exit into a throw, and this class
 * is what it throws — a TYPED error, so `handleError` branches on `instanceof`
 * rather than string-matching a message, and carrying the command path so the
 * hint can name the exact `--help` to run.
 *
 * The `code` on the wire is `CLI_INVALID_ARGUMENTS`, never commander's own
 * `commander.missingMandatoryOptionValue`. That is the `CLI_*` provenance rule
 * in `CLI_CODES` in `errors.ts`: the prefix means "this never reached the server", and a
 * refusal at the parse boundary is the purest case of it. Commander's code is
 * kept on the object for a reader, not put on the wire.
 */
export class CliArgumentError extends Error {
  readonly commandPath: string;
  readonly exitCode: number;
  readonly commanderCode: string;

  constructor(commandPath: string, exitCode: number, message: string, commanderCode: string) {
    super(message);
    this.commandPath = commandPath;
    this.exitCode = exitCode;
    this.commanderCode = commanderCode;
    this.name = "CliArgumentError";
  }
}
