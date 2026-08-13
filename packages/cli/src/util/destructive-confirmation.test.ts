import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { COMMAND_CLASSIFICATION } from "../command-universe";
import { booleanFlag } from "./boolean-flag";
import { confirmable, isConfirmable, YES_FLAG_DESCRIPTION } from "./confirm";
import { buildCommandTree } from "./global-option-shadowing";

/**
 * ONE CONVENTION, ENFORCED ON THE TREE.
 *
 * The population comes from `command-universe.ts`'s classification, which is
 * derived from the commander tree by another owner and fails on an unclassified
 * leaf — so it cannot go stale and this file keeps no list of its own.
 *
 * Its three-way split is the right POPULATION FILTER and not a destructiveness
 * oracle: `registration-only` means "a mutation, OR a read that needs a required
 * positional/option", so it cannot separate `document delete` from
 * `agent get <id>`. What it CAN say for certain is the negative — a `safe` leaf
 * is read-only and can never need a confirmation. That is how it is used here.
 */

/** Every leaf that is not read-only, keyed as `command-universe` keys them. */
function notReadOnly(): string[] {
  return Object.entries(COMMAND_CLASSIFICATION)
    .filter(([, disposition]) => disposition !== "safe")
    .map(([path]) => path)
    .sort();
}

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
 * Commands declaring `--yes` by hand, from before `confirmable()` existed.
 *
 * Each is one of the six behaviours the convention replaces. They are listed so
 * the count is visible and shrinking, and so a NEW hand-rolled one cannot join
 * them silently. Migrating a command means deleting its line here — the last
 * assertion refuses an entry that no longer needs one, so the list cannot rot in
 * the other direction either.
 *
 * 🔴 Most of these files belong to other owners. The gate names the work; it
 * does not do it.
 */
const UNMIGRATED_HAND_ROLLED_YES: readonly string[] = [
  "agent delete",
  "agent-eval run delete",
  "agent-eval schedule delete",
  "agent-eval template delete",
  "agent-eval template detach",
  "agent-eval trigger delete",
  "agent-eval webhook delete",
  "agent-skill delete",
  "agent-tool delete",
  "asset delete",
  "channel whatsapp-template delete",
  "collection delete",
  "credential delete",
  "customer delete",
  "deployment delete",
  "deployment folder delete",
  "deployment template detach",
  "document delete",
  "emulator scenario delete",
  "emulator session delete",
  "folder delete",
  "html-template delete",
  "phone-number buy",
  "phone-number release",
  "skill-folder delete",
  "task delete",
  "task-eval session delete",
  "template folder delete",
  "tool delete-credential",
  "user-group delete",
  "version delete",
  "version restore",
  "vibe app delete",
  "vibe app rotate-edge-token",
  "vibe git-project delete",
  "workflow branch delete",
  "workflow delete",
  "workflow edge delete",
  "workflow node delete",
  "workspace delete"
];

describe("the destructive-confirmation convention", () => {
  // CONTROLS FIRST. Every assertion below is an absence claim over a derived
  // population, so both derivations must be shown to produce something.
  it("derives a non-empty not-read-only population from command-universe", () => {
    const population = notReadOnly();
    expect(population.length).toBeGreaterThan(50);
    expect(population).toContain("document delete");
    expect(population).toContain("tool delete-credential");
  });

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

  it("no NEW command declares --yes by hand", () => {
    const handRolled = everyCommand(buildCommandTree())
      .filter(([, cmd]) => cmd.options.some((o) => o.long === "--yes"))
      .filter(([, cmd]) => !isConfirmable(cmd))
      .map(([path]) => path)
      .filter((path) => !UNMIGRATED_HAND_ROLLED_YES.includes(path))
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

  it("carries no entry for a command that has been migrated or removed", () => {
    const live = new Set(
      everyCommand(buildCommandTree())
        .filter(([, cmd]) => cmd.options.some((o) => o.long === "--yes") && !isConfirmable(cmd))
        .map(([path]) => path)
    );
    expect(UNMIGRATED_HAND_ROLLED_YES.filter((p) => !live.has(p))).toEqual([]);
  });

  it("never tests stdout to decide whether a human can answer", () => {
    // The single word behind the whole class. `stdout.isTTY` asks whether OUTPUT
    // is a terminal, which says nothing about who is answering: redirecting to a
    // file from an interactive shell skips the prompt, and piping an answer in
    // makes it prompt. A confirmation reads STDIN or it is not a confirmation.
    expect(YES_FLAG_DESCRIPTION).toContain("no terminal this refuses");
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
