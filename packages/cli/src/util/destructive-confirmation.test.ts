import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";

import { booleanFlag } from "./boolean-flag";
import {
  confirmable,
  isConfirmable,
  promptLine,
  promptStream,
  YES_FLAG_DESCRIPTION
} from "./confirm";
import { buildCommandTree } from "./global-option-shadowing";

/**
 * HOW A CONFIRMATION IS DECLARED. Whether one EXISTS is the sibling file's job.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE POPULATION THIS FILE USED TO DERIVE HAS BEEN REMOVED, ON PURPOSE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A `notReadOnly()` here filtered `COMMAND_CLASSIFICATION` to every non-`safe`
 * leaf and fed the result to ONE control asserting `length > 50`. Nothing else
 * ever read it. A derived population that feeds no obligation is worse than no
 * population: it reads as the gate over the destructive surface, and it is a
 * `length` check.
 *
 * It could not have carried an obligation either, and the number says why. The
 * non-`safe` bucket is 443 of 501 leaves, because `registration-only` means "a
 * mutation, OR a read that needs a required positional" — so `agent get <id>` is
 * in it. Asserting a confirmation over that set would demand one from every
 * parameterised read in the CLI. "Not read-only" is not "destructive", and no
 * amount of assertion makes it so.
 *
 * `destructive-confirmation.scan.ts` derives the real population — a leaf whose
 * name carries a destructive verb, or one that declares `--yes` — and
 * `destructive-confirmation.driven.test.ts` DRIVES every member of it with no
 * terminal and no `--yes`, so "does this command confirm" is answered by what it
 * did rather than by what it declared.
 *
 * What stays here is the half that is about DECLARATION, and it is still
 * load-bearing: the flag is spelled one way, registered one way, and no command
 * decides on the wrong stream.
 */

function everyCommand(root: Command, trail: string[] = []): Array<[string, Command]> {
  const out: Array<[string, Command]> = [];
  for (const child of root.commands) {
    const path = [...trail, child.name()];
    out.push([path.join(" "), child]);
    out.push(...everyCommand(child, path));
  }
  return out;
}

/**
 * THE HAND-ROLLED LIST IS GONE, AND ITS ABSENCE IS THE ASSERTION.
 *
 * Six commands used to declare `--yes` themselves — `phone-number buy|release`,
 * `workspace delete` and three `vibe` verbs. Every one of them refused
 * correctly, through a parser of its own; they were DRY debt rather than a
 * data-loss risk, and that is exactly why they survived so long. A correct copy
 * of a rule is still a place the rule can change, and a gate over the tree could
 * only ever prove a `--yes` was DECLARED — never that the branch behind it was
 * the shared one.
 *
 * All six now go through `confirmable()` + `confirmDestructive()`, so the
 * assertion below runs against an EMPTY exemption list: any command declaring
 * `--yes` by hand is a new one, and it reds by name. There is deliberately no
 * constant left to add a line to.
 */

describe("the destructive-confirmation convention", () => {
  // CONTROL FIRST. Every assertion below is an absence claim over a derived
  // population, so the derivation must be shown to produce something.
  it("walks a tree that actually has commands", () => {
    expect(everyCommand(buildCommandTree()).length).toBeGreaterThan(200);
  });

  it("registers a command declared through confirmable(), and not one declared by hand", () => {
    // The detector, proven in both directions. Without this, an assertion that
    // "every --yes is confirmable" is satisfied by an isConfirmable that always
    // returns true.
    const root = new Command().name("nexus");
    const viaHelper = confirmable(root.command("good"));
    const byHand = root.command("bad").option("--yes", "skip");

    expect(isConfirmable(viaHelper)).toBe(true);
    expect(isConfirmable(byHand)).toBe(false);
    expect(viaHelper.options.find((o) => o.long === "--yes")?.description).toBe(
      YES_FLAG_DESCRIPTION
    );
  });

  it("no command declares --yes by hand", () => {
    const handRolled = everyCommand(buildCommandTree())
      .filter(([, cmd]) => cmd.options.some((o) => o.long === "--yes"))
      .filter(([, cmd]) => !isConfirmable(cmd))
      .map(([path]) => path)
      .sort();

    expect(
      handRolled,
      "This command declares --yes by hand. Six different behaviours grew behind that " +
        "flag — refuse on a non-TTY, proceed silently on stdout, proceed silently on " +
        "stdin, exit 1 doing nothing — and a reader cannot tell which one they are " +
        "running. Use confirmable(cmd) to declare the flag and confirmDestructive() to " +
        "ask, from src/util/confirm.ts. Both refuse when stdin is not a terminal."
    ).toEqual([]);
  });

  it("never tests stdout to decide whether a human can answer", () => {
    // The single word behind the whole class. `stdout.isTTY` asks whether OUTPUT
    // is a terminal, which says nothing about who is answering: redirecting to a
    // file from an interactive shell skips the prompt, and piping an answer in
    // makes it prompt. A confirmation reads STDIN or it is not a confirmation.
    expect(YES_FLAG_DESCRIPTION).toContain("no terminal this refuses");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE SOURCE SCAN. The WeakSet above proves a `--yes` was DECLARED through the
  // helper; it cannot prove the action body then ASKS through it, because which
  // function a closure calls is invisible on the `Command`. So the one spelling
  // that caused the incident is banned by text as well.
  //
  // 🚨 THIS IS A GREP AND IT IS ADMITTED AS ONE. It cannot certify a
  // hand-rolled prompt is correct; it can only certify that no confirmation
  // decides on the WRONG STREAM. The two assertions are complementary and
  // neither subsumes the other.
  // ───────────────────────────────────────────────────────────────────────────
  const COMMAND_SOURCES = (): Array<[string, string]> => {
    const dir = join(__dirname, "..", "commands");
    return readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => [f, readFileSync(join(dir, f), "utf-8")] as [string, string]);
  };

  /** `!opts.yes && process.stdout.isTTY`, allowing any whitespace between. */
  const STDOUT_GATE = /!\s*opts\.yes\s*&&\s*process\s*\.\s*stdout\s*\.\s*isTTY/;

  it("CONTROL: the scan reads real command sources and the pattern matches its own shape", () => {
    const sources = COMMAND_SOURCES();
    expect(sources.length).toBeGreaterThan(30);
    expect(sources.some(([, src]) => src.includes("confirmDestructive"))).toBe(true);
    // Without this the regex could be misspelt, match nothing, and the absence
    // assertion below would pass over a tree full of the defect.
    expect(STDOUT_GATE.test("if (!opts.yes && process.stdout.isTTY) {")).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE OTHER HALF OF READING STDIN. Deciding on stdin makes
  // `nexus <destructive> > log` ask, which is right — the operator is there. If
  // the QUESTION then goes to stdout it lands in the log file and the terminal
  // stays blank while the process waits for a keystroke, which is the hang this
  // change removes, reappearing in the one case the change set out to support.
  // ───────────────────────────────────────────────────────────────────────────
  describe("the question goes where a person can read it", () => {
    const stdoutWas = process.stdout.isTTY;
    const stderrWas = process.stderr.isTTY;

    const set = (stdout: boolean, stderr: boolean): void => {
      Object.defineProperty(process.stdout, "isTTY", { value: stdout, configurable: true });
      Object.defineProperty(process.stderr, "isTTY", { value: stderr, configurable: true });
    };

    afterEach(() => set(stdoutWas, stderrWas));

    it("uses stderr when stdout is redirected and the terminal is on stderr", () => {
      set(false, true);
      expect(promptStream()).toBe(process.stderr);
    });

    it("uses stderr when BOTH are terminals — a prompt is interaction, not output", () => {
      // Also what keeps a question out of a --json document by construction.
      set(true, true);
      expect(promptStream()).toBe(process.stderr);
    });

    it("uses stdout for the one case where only stdout is a terminal", () => {
      set(true, false);
      expect(promptStream()).toBe(process.stdout);
    });

    it("puts the whole conversation on that stream, not only the question", () => {
      // A spend gate asked through promptStream() and printed the figures the
      // question refers to with console.log. With stdout redirected the operator
      // was asked to accept a cost and shown none of it. Splitting a dialogue
      // across two streams is the same defect as asking on the wrong one.
      set(false, true);
      const written: string[] = [];
      const real = process.stderr.write.bind(process.stderr);
      process.stderr.write = ((chunk: string) => {
        written.push(String(chunk));
        return true;
      }) as typeof process.stderr.write;

      try {
        promptLine("Cost-safety status: BLOCKED");
      } finally {
        process.stderr.write = real;
      }

      expect(written).toEqual(["Cost-safety status: BLOCKED\n"]);
    });
  });

  it("no command gates a confirmation on stdout", () => {
    const offenders = COMMAND_SOURCES()
      .filter(([, src]) => STDOUT_GATE.test(src))
      .map(([file]) => file)
      .sort();

    expect(
      offenders,
      "This file decides whether it may ask by testing stdout. Piped — `nexus " +
        "customer delete <id> | tee log` — the answer is false, the question is " +
        "skipped and the row is destroyed with nobody asked. stdout a terminal " +
        "with stdin closed is the mirror image: the prompt prints against an " +
        "ended stream and the process hangs on a promise nothing can settle. " +
        "Ask through confirmDestructive() from src/util/confirm.ts, which reads " +
        "stdin and REFUSES when it cannot."
    ).toEqual([]);
  });
});

/**
 * `<bool>` options that already REFUSE, through a correct parser of their own.
 *
 * These are not the defect. `role.ts`'s `readBoolean` and `vibe.ts`'s
 * `parseBoolFlag` both throw on an unrecognised value — two authors independently
 * reached the same rule, which is the strongest argument that refusing is the
 * convention rather than one person's taste. What they do differently is WHEN:
 * they throw from inside the action, so the command has already begun work, and
 * they are two copies of one rule.
 *
 * Listed rather than fixed because both files belong to other owners. Migrating
 * one means deleting its line; the assertion below refuses a line that no longer
 * corresponds to anything.
 */
const SOUND_LOCAL_BOOLEAN_PARSERS: readonly string[] = [
  "role set-system-policy --allow-proposals",
  "role set-system-policy --auto-push",
  "role set-system-policy --notify-takeover",
  "role set-system-policy --require-review",
  "role set-system-policy --start-paused",
  "vibe app update --require-approvals",
  "vibe app update --require-verification"
];

describe("a boolean flag refuses rather than coercing", () => {
  it("accepts true and false in any case", () => {
    expect(booleanFlag("true")).toBe(true);
    expect(booleanFlag("TRUE")).toBe(true);
    expect(booleanFlag("False")).toBe(false);
    expect(booleanFlag(" true ")).toBe(true);
  });

  it("refuses the values that used to become false", () => {
    // Each of these silently disabled something in production.
    for (const raw of ["1", "yes", "on", "maybe", "y", ""]) {
      expect(() => booleanFlag(raw), `booleanFlag(${JSON.stringify(raw)})`).toThrow(
        /expected "true" or "false"/
      );
    }
  });

  it("every <bool> option in the tree parses through it", () => {
    const offenders = everyCommand(buildCommandTree())
      .flatMap(([path, cmd]) =>
        cmd.options
          .filter((o) => o.flags.includes("<bool>"))
          .filter((o) => o.parseArg !== booleanFlag)
          .map((o) => `${path} ${o.long}`)
      )
      .filter((entry) => !SOUND_LOCAL_BOOLEAN_PARSERS.includes(entry))
      .sort();

    expect(
      offenders,
      "A <bool> option without the shared parser reads every unrecognised value as " +
        "false. `deployment update --active TRUE` deactivated a live channel and " +
        "reported success. Pass booleanFlag from src/util/boolean-flag.ts as the " +
        "option's parser."
    ).toEqual([]);
  });

  it("carries no entry for a boolean flag that has been migrated or removed", () => {
    const live = new Set(
      everyCommand(buildCommandTree()).flatMap(([path, cmd]) =>
        cmd.options
          .filter((o) => o.flags.includes("<bool>") && o.parseArg !== booleanFlag)
          .map((o) => `${path} ${o.long}`)
      )
    );
    expect(SOUND_LOCAL_BOOLEAN_PARSERS.filter((e) => !live.has(e))).toEqual([]);
  });
});
