/**
 * `--json` HOLDS ON EVERY WAY THIS PROCESS CAN TERMINATE, NOT ONLY ON THE ONES
 * THAT RUN AN ACTION.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT CLASS: A PATH THAT ENDS ABOVE THE HOOK CHAIN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * JSON mode was decided in the root's `preAction` hook. Every terminal path that
 * ends BEFORE an action runs therefore never learned about `--json`, and each one
 * answered a machine with prose at exit 0. Measured on the shipped binary before
 * this contract existed, `dist/index.js` at 0.26.0:
 *
 *   nexus --json --help           14915 bytes of ANSI-framed prose, exit 0
 *   nexus --json --version        "0.26.0", exit 0
 *   nexus --json zzznope --help   14915 bytes of ROOT HELP, exit 0
 *
 * The third is the expensive one and it is not a formatting complaint. A typo
 * READ AS SUCCESS: a script that shells out, checks the exit code and parses
 * stdout got exit 0 and a document-shaped absence, for a command that does not
 * exist. `installArgumentRefusalReporting` could not see any of the three,
 * because it returns on `exitCode === 0` — by construction, since turning
 * `--help` into an error would be worse.
 *
 * ── WHY THIS IS NOT THREE FIXES ──────────────────────────────────────────────
 *
 * Patching `--help`, `--version` and the unknown-command path one at a time
 * leaves the SHAPE reachable: the next terminal path anyone adds has the defect
 * again on the day it is written. So the fix is placed at the two seams commander
 * itself cannot route around:
 *
 *   1. JSON MODE IS RESOLVED FROM ARGV, BEFORE THE PARSE. {@link installJsonTerminalContract}
 *      wraps `parse` / `parseAsync`, so `isJsonMode()` is already true by the time
 *      commander looks at its first token. Nothing downstream can run "before"
 *      that, because there is nothing before a parse.
 *
 *   2. EVERY BYTE COMMANDER PUTS ON STDOUT GOES THROUGH ONE FUNCTION.
 *      `_outputConfiguration.writeOut` is commander 13.1.0's single stdout door:
 *      `version()` writes through it directly, and `outputHelp()` reaches it via
 *      `_getOutputContext`. Under `--json` this contract owns that door, so a
 *      commander path that writes prose to stdout is unrepresentable rather than
 *      forbidden — including one added by a future commander release, which lands
 *      in the generic `{"output": …}` arm rather than escaping.
 *
 * ── WHAT IT STILL CANNOT REACH, SAID PLAINLY ─────────────────────────────────
 *
 * A COMMAND'S OWN `console.log`. Around forty command actions build their
 * document by hand rather than through a printer, and this contract is not in
 * that path — `output-json-mode.ts`'s `emitDocument` guard is not either, and
 * says so. That half is covered by gates: `json-one-document.test.ts` drives
 * every LEAF, and `json-contract-is-total.test.ts` drives the population that one
 * skips. A gate reports; only the two seams above make anything impossible.
 *
 * ── WHERE THE PARTS LIVE ─────────────────────────────────────────────────────
 *
 * THIS FILE IS THE PUBLIC SURFACE AND IMPORTS NOTHING, so no leaf can import it
 * back and put the index in an `import/no-cycle` loop. The bodies:
 *
 *   json-terminal-argv.ts          seam 1's reading — `--json` off the raw
 *                                  tokens, and the `rawArgs` belt.
 *   json-terminal-command-path.ts  the one spelling of a command's full path.
 *   json-terminal-stray-operand.ts the "typo reads as success" half.
 *   json-terminal-state.ts         one install's state, and seam 2 — commander's
 *                                  single stdout door.
 *   json-terminal-parse-seam.ts    seam 1 — the parse, where the mode is decided.
 *   json-terminal-install.ts       the help wrapper, and the walk that installs
 *                                  it over every command in the tree.
 */

export { argvRequestsJson } from "./json-terminal-argv";
export { commandPath } from "./json-terminal-command-path";
export { installJsonTerminalContract } from "./json-terminal-install";
