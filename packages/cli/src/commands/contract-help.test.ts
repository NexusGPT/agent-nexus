import { Argument, Command, Option } from "commander";
import { describe, expect, it } from "vitest";

import {
  type BoundArgument,
  boundArgument,
  boundCommand,
  type BoundOption,
  boundOption,
  enumArgument
} from "../contract-binding";
import { buildNamespace, GENERATED_NAMESPACES } from "./contract-help.namespaces";

/**
 * THE BIDIRECTIONAL GATE between the CLI's flags and the committed contract data.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS CHECKS, AND WHAT IT DELIBERATELY DOES NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Two questions, two instruments, and keeping them apart is what lets this file
 * exist at all:
 *
 *   · IS THE GENERATED DATA CURRENT WITH THE ZOD CONTRACT?
 *     Not here. That needs Zod, `zod` is not resolvable from `src/`, and
 *     `packages/cli` publishes standalone with `commander` as its only runtime
 *     dependency. `scripts/generate-contract-help.ts` re-derives and
 *     `scripts/generated-drift.mjs` fails CI when the committed copy differs.
 *
 *   · DO THE FLAGS AGREE WITH THE GENERATED DATA?
 *     Here. Both sides are plain TypeScript in `src/`, and the question needs no
 *     schema at all.
 *
 * ── The four directions ──────────────────────────────────────────────────────
 *
 * A one-way check is how a generator quietly wins an argument it should have
 * lost, so every direction is asserted:
 *
 *   1. CONTRACT → FLAG. An enum in the descriptor with no `.choices()` on a flag
 *      is a failure, unless declared `bodyOnly` with a reason.
 *   2. FLAG → CONTRACT. A flag's offered values must be the contract's, minus a
 *      declared narrowing, plus a declared widening. Nothing else.
 *   3. A DECLARED OMISSION MUST STILL MATCH SOMETHING. An omission whose target
 *      has already left the contract excludes nothing and is byte-identical to
 *      one still doing its job — the failure shape where a stale filter silently
 *      widens what it was meant to narrow.
 *   4. THE FLAG ACTUALLY REFUSES. Driven, not inspected. `.choices()` and
 *      `.argParser()` on one option make commander skip the choices check
 *      entirely while `--help` still prints `(choices: …)`, so a flag can read as
 *      validated and validate nothing. Only firing a junk value through it can
 *      tell the difference.
 *
 * ── Why the description scan is scoped, and scoped this way ─────────────────
 *
 * Direction 2 has a mirror: help prose that ENUMERATES values while the schema
 * behind it is a free string. A general detector for that over 832 option sites
 * would be a regex judging English, and a gate that cries wolf is switched off
 * within a day. So it runs only over the namespaces in the ledger, where every
 * enum is already bound and any remaining list in a description is by definition
 * either a bound flag's duplicate or an unbound flag's unchecked claim.
 */

function leavesOf(command: Command, prefix: readonly string[]): { path: string; cmd: Command }[] {
  const children = command.commands.filter((child) => child.name() !== "help");
  if (children.length === 0) {
    return prefix.length === 0 ? [] : [{ path: prefix.join(" "), cmd: command }];
  }
  return children.flatMap((child) => leavesOf(child, [...prefix, child.name()]));
}

const NAMESPACE_LEAVES = new Map(
  GENERATED_NAMESPACES.map(
    (entry) => [entry.namespace, leavesOf(buildNamespace(entry), [entry.namespace])] as const
  )
);

/**
 * ONE BOUND SLOT — a flag or a positional — flattened so every assertion below
 * walks the same population.
 *
 * 🚨 THE POPULATION IS THE WHOLE POINT OF THIS TYPE. Every direction used to
 * iterate `cmd.options` directly, which silently scoped the gate to flags. A
 * contract enum bound to a POSITIONAL would have satisfied direction 1 (it is
 * reachable) while being checked by nothing in directions 2, 3 and 4 — the
 * combination that reads as fully gated and validates nothing. Adding a slot
 * kind now means adding it here, once, rather than remembering five loops.
 */
interface BoundSlot {
  /** How the slot prints in a failure message: `--granularity <g>` or `<view>`. */
  readonly label: string;
  readonly bound: BoundOption | BoundArgument;
  /** What `.choices()` put on the live commander object, or undefined. */
  readonly argChoices: readonly string[] | undefined;
  /** Fire one value at this slot through a throwaway program. Throws on refusal. */
  readonly drive: (value: string) => void;
}

function slotsOf(cmd: Command): BoundSlot[] {
  const slots: BoundSlot[] = [];

  for (const option of cmd.options) {
    const bound = boundOption(option);
    if (!bound) continue;
    slots.push({
      label: option.flags,
      bound,
      argChoices: option.argChoices,
      drive: (value) => driveOption(option, value)
    });
  }

  for (const argument of cmd.registeredArguments) {
    const bound = boundArgument(argument);
    if (!bound) continue;
    slots.push({
      label: `<${argument.name()}>`,
      bound,
      argChoices: argument.argChoices,
      drive: (value) => driveArgument(argument, value)
    });
  }

  return slots;
}

describe("the ledger names namespaces that exist", () => {
  it("finds a leaf under every converted namespace", () => {
    // Guards the gate itself. A renamed namespace would otherwise give every
    // assertion below an empty list to iterate, and an empty loop passes.
    for (const [namespace, leaves] of NAMESPACE_LEAVES) {
      expect(leaves.length, `${namespace} derived no leaf commands`).toBeGreaterThan(0);
    }
    expect([...NAMESPACE_LEAVES.values()].flat().length).toBeGreaterThan(10);
  });

  it("binds at least one command per namespace", () => {
    // The second half of the same guard: a namespace whose `bindCommand` calls
    // were all removed would satisfy every "for each bound command" assertion
    // vacuously, and the whole file would go green over nothing.
    for (const [namespace, leaves] of NAMESPACE_LEAVES) {
      const bound = leaves.filter(({ cmd }) => boundCommand(cmd) !== undefined);
      expect(bound.length, `${namespace} has no command bound to a contract`).toBeGreaterThan(0);
    }
  });
});

describe("1. every contract enum reaches a flag", () => {
  it("has no enum that is neither bound to a flag nor declared body-only", () => {
    const unreachable: string[] = [];

    for (const [namespace, leaves] of NAMESPACE_LEAVES) {
      for (const { path, cmd } of leaves) {
        const binding = boundCommand(cmd);
        if (!binding) continue;

        // Flags AND positionals. A `<view>` bound to a contract enum reaches the
        // operator exactly as a `--view` does, and must not need a bodyOnly
        // exemption to satisfy this direction.
        const flagged = new Set(slotsOf(cmd).map((slot) => slot.bound.source.path));

        for (const field of binding.shape.fields) {
          if (!field.enumValues) continue;
          const full = `${binding.shape.name}.${field.path}`;
          if (flagged.has(full)) continue;
          if (binding.bodyOnly[field.path] !== undefined) continue;
          unreachable.push(`${namespace}: ${path} — ${full} has no flag and no bodyOnly reason`);
        }
      }
    }

    expect(unreachable).toEqual([]);
  });

  it("gives every body-only exemption a reason and a real target", () => {
    const bad: string[] = [];
    for (const [, leaves] of NAMESPACE_LEAVES) {
      for (const { path, cmd } of leaves) {
        const binding = boundCommand(cmd);
        if (!binding) continue;
        const known = new Set(binding.shape.fields.map((field) => field.path));

        for (const [fieldPath, reason] of Object.entries(binding.bodyOnly)) {
          if (reason.trim() === "")
            bad.push(`${path}: bodyOnly "${fieldPath}" has an empty reason`);
          // An exemption for a field the contract no longer has exempts nothing
          // and reads exactly like a live one.
          if (!known.has(fieldPath)) bad.push(`${path}: bodyOnly "${fieldPath}" matches no field`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("2. every bound flag offers exactly what it declares", () => {
  it("offers the contract values, minus declared omissions, plus declared aliases", () => {
    const mismatches: string[] = [];

    for (const [, leaves] of NAMESPACE_LEAVES) {
      for (const { path, cmd } of leaves) {
        for (const { label, bound } of slotsOf(cmd)) {
          const expected = [
            ...bound.source.contractValues.filter(
              (value) => !(bound.divergence?.omit ?? []).includes(value)
            ),
            ...(bound.divergence?.alsoAccepts ?? [])
          ];
          if (JSON.stringify(bound.offered) !== JSON.stringify(expected)) {
            mismatches.push(
              `${path} ${label}: offers [${bound.offered.join(", ")}], ` +
                `declaration implies [${expected.join(", ")}]`
            );
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("requires a reason for every divergence", () => {
    const silent: string[] = [];
    for (const [, leaves] of NAMESPACE_LEAVES) {
      for (const { path, cmd } of leaves) {
        for (const { label, bound } of slotsOf(cmd)) {
          if (bound.divergence && bound.divergence.because.trim() === "") {
            silent.push(`${path} ${label}`);
          }
        }
      }
    }
    expect(silent).toEqual([]);
  });
});

describe("3. a declared omission still matches something upstream", () => {
  it("has no omission naming a value the contract no longer lists", () => {
    // 🚨 THE POLARITY INVERTS HERE, which is why it is its own assertion. A
    // filter whose target has already been removed does not error — it silently
    // stops narrowing anything, under a clean green build, and the CLI quietly
    // starts offering a value somebody deliberately withdrew. Presence in the
    // contract is what makes an omission meaningful.
    const dead: string[] = [];

    for (const [, leaves] of NAMESPACE_LEAVES) {
      for (const { path, cmd } of leaves) {
        for (const { label, bound } of slotsOf(cmd)) {
          for (const omitted of bound.divergence?.omit ?? []) {
            if (!bound.source.contractValues.includes(omitted)) {
              dead.push(
                `${path} ${label}: omits "${omitted}", which the contract no longer lists — ` +
                  `the correction is now a no-op, delete it or fix the path`
              );
            }
          }
        }
      }
    }

    expect(dead).toEqual([]);
  });

  it("has no alias that collides with a real contract value", () => {
    const collisions: string[] = [];
    for (const [, leaves] of NAMESPACE_LEAVES) {
      for (const { path, cmd } of leaves) {
        for (const { label, bound } of slotsOf(cmd)) {
          for (const alias of bound.divergence?.alsoAccepts ?? []) {
            if (bound.source.contractValues.includes(alias)) {
              collisions.push(`${path} ${label}: "${alias}" is already a contract value`);
            }
          }
        }
      }
    }
    expect(collisions).toEqual([]);
  });
});

describe("4. a bound flag actually refuses a bad value", () => {
  /**
   * DRIVEN, NOT INSPECTED — and this is the assertion that earns the file.
   *
   * Measured against commander 13.1.0 by mutation: an `Option` carrying both
   * `.choices()` and `.argParser()` never checks its choices. Identical option,
   * junk value, `argParser` absent → refused, naming the allowed list;
   * `argParser` present → accepted silently. `--help` prints `(choices: …)` in
   * both cases, so reading the source, reading the help, or asserting on
   * `option.argChoices` all report a validated flag either way.
   *
   * Only firing a value through the parser separates them.
   */
  it("refuses a value that is in no list, on every bound option", () => {
    const accepted: string[] = [];

    for (const [, leaves] of NAMESPACE_LEAVES) {
      for (const { path, cmd } of leaves) {
        for (const { label, argChoices, drive } of slotsOf(cmd)) {
          // A composite flag (`--filter field:op:value`) carries an enum on one
          // COMPONENT, so commander cannot validate the whole token and the
          // binding records that honestly. Nothing to drive here.
          if (argChoices === undefined) continue;

          const junk = "__not_a_contract_value__";
          let refused = false;
          try {
            drive(junk);
          } catch {
            refused = true;
          }
          if (!refused) accepted.push(`${path} ${label} accepted "${junk}"`);
        }
      }
    }

    expect(accepted).toEqual([]);
  });

  it("still accepts every value it offers", () => {
    // The negative control's twin. A flag that refuses EVERYTHING would satisfy
    // the assertion above perfectly while being completely broken.
    const wrongly: string[] = [];

    for (const [, leaves] of NAMESPACE_LEAVES) {
      for (const { path, cmd } of leaves) {
        for (const { label, bound, argChoices, drive } of slotsOf(cmd)) {
          if (argChoices === undefined) continue;

          for (const value of bound.offered) {
            try {
              drive(value);
            } catch (error) {
              wrongly.push(`${path} ${label} refused its own value "${value}": ${error}`);
            }
          }
        }
      }
    }

    expect(wrongly).toEqual([]);
  });
});

describe("5. the positional mechanism holds on its own", () => {
  /**
   * `enumArgument` IS TESTED HERE RATHER THAN ONLY THROUGH ITS CALL SITES.
   *
   * Directions 1–4 walk the ledger, so they cover a positional only while some
   * command happens to bind one. The `normalise` path has NO call site at all
   * today, which means the branch that re-implements `.choices()` by hand — the
   * one that exists because `.argParser()` silently disables the real check —
   * would ship completely undriven. That is the exact shape this file was
   * written to refuse, so the mechanism gets its own negative control.
   */
  const SOURCE = {
    path: "Probe.Body.view",
    contractValues: ["alpha", "beta"]
  } as const;

  const drive = (argument: Argument, value: string): string | undefined => {
    let seen: string | undefined;
    const probe = new Command();
    probe.name("probe").exitOverride();
    probe.addArgument(argument);
    probe.action((v: string) => {
      seen = v;
    });
    probe.parse(["node", "probe", value]);
    return seen;
  };

  it("refuses a junk value with no normaliser", () => {
    const argument = enumArgument("<view>", "probe", SOURCE);
    expect(() => drive(argument, "__junk__")).toThrow(/Allowed choices are alpha, beta/);
  });

  it("refuses a junk value WITH a normaliser attached", () => {
    // 🚨 THE ONE THAT MATTERS. `.argParser()` disables `.choices()` on an
    // `Argument` exactly as it does on an `Option` — measured on commander
    // 13.1.0 — so this refusal can only come from the hand-rolled check inside
    // `enumArgument`. Delete that check and this test is the only thing that
    // notices; `--help` still prints `(choices: …)` either way.
    const argument = enumArgument("<view>", "probe", SOURCE, undefined, (raw) =>
      raw.trim().toLowerCase()
    );
    expect(() => drive(argument, "__junk__")).toThrow(/Allowed choices are alpha, beta/);
  });

  it("normalises a declared alias into its contract value", () => {
    const argument = enumArgument(
      "<view>",
      "probe",
      SOURCE,
      { alsoAccepts: ["a"], because: "shorthand" },
      (raw) => (raw === "a" ? "alpha" : raw)
    );
    // The alias is OFFERED, so `--help` lists it, and what reaches the action is
    // the contract value — never the spelling the operator typed.
    expect(drive(argument, "a")).toBe("alpha");
    expect(drive(argument, "beta")).toBe("beta");
  });

  it("records the binding so the gate can see it", () => {
    const argument = enumArgument("<view>", "probe", SOURCE);
    expect(boundArgument(argument)?.offered).toEqual(["alpha", "beta"]);
    expect(argument.argChoices).toEqual(["alpha", "beta"]);
  });

  it("has at least one real positional bound across the ledger", () => {
    // Without this, every argument-side branch above goes vacuous the moment the
    // last `enumArgument` call site is removed — and an empty loop passes.
    const positionals = [...NAMESPACE_LEAVES.values()]
      .flat()
      .flatMap(({ cmd }) => cmd.registeredArguments)
      .filter((argument) => boundArgument(argument) !== undefined);

    expect(positionals.length).toBeGreaterThan(0);
  });
});

/**
 * Fire one value at one option through a throwaway program.
 *
 * A fresh `Command` per call: commander stores parsed values on the command, and
 * reusing one would let an earlier value satisfy a later assertion.
 */
function driveOption(option: Option, value: string): void {
  const probe = new Command();
  probe.name("probe").exitOverride();
  probe.addOption(option);
  probe.action(() => {});
  probe.parse(["node", "probe", option.long ?? option.short ?? "", value]);
}

/**
 * The same, for a positional.
 *
 * The argument is added ALONE to the probe rather than alongside its siblings,
 * so a required neighbour cannot make the parse fail for a reason that has
 * nothing to do with the value under test — which would read as a refusal and
 * pass the assertion above for the wrong reason.
 */
function driveArgument(argument: Argument, value: string): void {
  const probe = new Command();
  probe.name("probe").exitOverride();
  probe.addArgument(argument);
  probe.action(() => {});
  probe.parse(["node", "probe", value]);
}
