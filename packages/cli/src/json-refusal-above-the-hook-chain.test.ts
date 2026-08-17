import { describe, expect, it } from "vitest";

import { describeStdout } from "./commands/json-one-document.scan";
import { handleError } from "./errors";
import { isJsonMode, setJsonMode } from "./output";
import { buildRootProgram } from "./root-program";

/**
 * A REFUSAL COMMANDER DECIDES ITSELF STILL OWES THE CALLER A DOCUMENT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS COVERS THAT THE ONE-DOCUMENT GATE STRUCTURALLY CANNOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `json-one-document.test.ts` drives every leaf with a SYNTHESIZED argv — the
 * mandatory options and the required positionals, filled in from their own
 * declarations. That is what lets it reach 349 real payloads, and it is exactly
 * why it can never reach a missing argument, an unknown command, an unknown
 * option or an excess argument: the synthesizer's whole job is to not produce
 * one. Of the six shapes below, that scan reaches ONE (a value outside a
 * `.choices()` set, which it hits by handing `"stub"` to a constrained
 * positional).
 *
 * So this file is not a duplicate of the gate. It is the population the gate's
 * argv synthesis removes by construction, driven deliberately.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 NOTHING HERE MAY SET JSON MODE ITSELF, AND THAT IS THE WHOLE DESIGN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * JSON mode is decided from `--json` inside the root's `preAction` hook, and
 * commander refuses an invalid invocation ABOVE the hook chain — before any hook
 * runs. A harness that called `setJsonMode(true)` before parsing would therefore
 * be testing a world in which this defect cannot exist, which is precisely how
 * it survived: the one-document ledger read ZERO over a defect reproducible from
 * the shipped binary in one command (`nexus agent get --json` → exit 1, ZERO
 * bytes on stdout, prose on stderr).
 *
 * `--json` rides in argv exactly as a caller types it. Whether the process
 * notices is the measurement.
 */

interface Driven {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | undefined;
}

/**
 * Drive the REAL root program the way the binary does, and capture both streams.
 *
 * `index.ts` ends with `.catch((err) => { process.exitCode = handleError(err); })`
 * and that line is where a refusal becomes its document, so the catch below is
 * the entry point's, not an invention of this file. No `process.exit` neutraliser
 * is needed: every argv here refuses with a NON-ZERO code, and
 * `installArgumentRefusalReporting` turns exactly those into a throw.
 */
async function drive(argv: readonly string[]): Promise<Driven> {
  const out: string[] = [];
  const err: string[] = [];
  const realLog = console.log;
  const realError = console.error;
  const realStdoutWrite = process.stdout.write.bind(process.stdout);
  const realStderrWrite = process.stderr.write.bind(process.stderr);

  console.log = (...args: unknown[]): void => void out.push(args.map(String).join(" "));
  console.error = (...args: unknown[]): void => void err.push(args.map(String).join(" "));
  process.stdout.write = ((text: string | Uint8Array): boolean => {
    out.push(typeof text === "string" ? text.replace(/\n$/, "") : "");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((text: string | Uint8Array): boolean => {
    err.push(typeof text === "string" ? text.replace(/\n$/, "") : "");
    return true;
  }) as typeof process.stderr.write;

  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await buildRootProgram().parseAsync(["node", "nexus", ...argv]);
  } catch (error) {
    process.exitCode = handleError(error);
  } finally {
    console.log = realLog;
    console.error = realError;
    process.stdout.write = realStdoutWrite;
    process.stderr.write = realStderrWrite;
    // The run boundary. One `nexus` process runs one command; this file runs
    // several, so a mode the program set has to be cleared or the next case
    // inherits it and passes without the fix.
    setJsonMode(false);
  }

  const exitCode = process.exitCode;
  process.exitCode = previousExitCode;
  return { stdout: out.join("\n"), stderr: err.join("\n"), exitCode };
}

interface ErrorDocument {
  readonly error: { readonly message: string; readonly hint: string | null; readonly code: string };
}

/**
 * Every way commander can refuse before a single hook has run.
 *
 * Each `argv` omits `--json`; the cases below add it where the shape needs it.
 * The last row is the one no listener on the `--json` option could ever cover:
 * `--timeout`'s value parser throws while walking argv, so the parse is over
 * before `--json` is looked at. It is here to pin that the fix reads the argv
 * commander RECORDED rather than the values commander managed to parse.
 */
const REFUSALS: readonly { readonly name: string; readonly argv: readonly string[] }[] = [
  { name: "a missing required argument", argv: ["agent", "get"] },
  { name: "an unknown command at the root", argv: ["definitely-not-a-command"] },
  { name: "an unknown command inside a namespace", argv: ["agent", "definitely-not-a-subcommand"] },
  { name: "an unknown option", argv: ["agent", "list", "--definitely-not-a-flag"] },
  { name: "a value outside a .choices() set", argv: ["analytics", "metrics", "not-a-real-view"] },
  { name: "too many arguments", argv: ["agent", "get", "one", "two", "three"] },
  {
    name: "a root option whose value parser throws before --json is reached",
    argv: ["--timeout", "not-a-number", "agent", "list"]
  }
];

describe("a commander refusal under --json emits the documented envelope", () => {
  it("CONTROL: json mode is off before anything is driven", () => {
    expect(isJsonMode()).toBe(false);
  });

  for (const refusal of REFUSALS) {
    it(`${refusal.name} answers ONE error document on stdout`, async () => {
      const run = await drive([...refusal.argv, "--json"]);

      // CONTROL, and it must come first: a run that refused nothing would leave
      // stderr empty, and every assertion below would be about a command that
      // was never invoked.
      expect(run.stderr).toContain("error:");

      expect(describeStdout(run.stdout)).toEqual({ documents: 1, prose: false });

      const document = JSON.parse(run.stdout.trim()) as ErrorDocument;
      // All three keys ALWAYS present — a consumer needs no presence check.
      expect(Object.keys(document.error).sort()).toEqual(["code", "hint", "message"]);
      expect(document.error.code).toBe("CLI_INVALID_ARGUMENTS");
      expect(document.error.message).not.toBe("");
      // Commander's own "error: " prefix is not part of the message; the
      // document has a `code` field for that job.
      expect(document.error.message.startsWith("error:")).toBe(false);

      // The exit code is UNCHANGED by this. A refusal that started exiting 0
      // because it now prints JSON would be a worse bug than the one fixed.
      expect(run.exitCode).toBe(1);
    });

    it(`${refusal.name} still prints PROSE when --json is absent`, async () => {
      const run = await drive(refusal.argv);

      expect(run.stdout.trim()).toBe("");
      expect(run.stderr).toContain("error:");
      expect(run.exitCode).toBe(1);
    });
  }

  /**
   * The seventh shape, and the only one whose commander message is not prose.
   *
   * "No command was given" is answered by `help({ error: true })`, which writes
   * the help screen to stderr and exits carrying the literal marker
   * `(outputHelp)`. Putting that on the wire is a document whose `message` says
   * nothing, on the one failure with the most obvious remedy in the CLI.
   */
  it("a bare invocation with no command answers a document that SAYS SO", async () => {
    const run = await drive(["--json"]);

    // CONTROL: the help screen still goes to stderr, exactly as before.
    expect(run.stderr).toContain("Usage:");

    expect(describeStdout(run.stdout)).toEqual({ documents: 1, prose: false });
    const document = JSON.parse(run.stdout.trim()) as ErrorDocument;
    expect(document.error.code).toBe("CLI_INVALID_ARGUMENTS");
    expect(document.error.message).toBe("No command given.");
    expect(document.error.message).not.toContain("outputHelp");
    expect(run.exitCode).toBe(1);
  });

  /**
   * The same commander code, a different sentence.
   *
   * `commander.help` is raised for a bare `nexus` AND for a namespace run
   * without a leaf. One message for both denies a command the caller plainly
   * supplied, and contradicts the hint printed beside it — which names that
   * namespace's own help. Found by review, not by the arm above: a mutation of
   * my own fix could only ever have moved the case I had already thought of.
   */
  it("a namespace with no subcommand says THAT, and names the namespace", async () => {
    const run = await drive(["agent", "--json"]);

    expect(run.stderr).toContain("Usage:");

    expect(describeStdout(run.stdout)).toEqual({ documents: 1, prose: false });
    const document = JSON.parse(run.stdout.trim()) as ErrorDocument;
    expect(document.error.code).toBe("CLI_INVALID_ARGUMENTS");
    expect(document.error.message).toBe('No subcommand given for "nexus agent".');
    // The message and the hint must agree about which help to read.
    expect(document.error.hint).toContain('"nexus agent --help"');
    expect(run.exitCode).toBe(1);
  });

  it("json mode does not leak out of a driven run", () => {
    expect(isJsonMode()).toBe(false);
  });
});
