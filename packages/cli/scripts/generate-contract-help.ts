#!/usr/bin/env tsx
/**
 * Build-time script: emits `src/commands/<namespace>.contract.generated.ts` from
 * the Public API v1 Zod contract.
 *
 * Run: pnpm --filter @agent-nexus/cli run gen:contract-help
 *
 * ── Why generate rather than import ─────────────────────────────────────────
 *
 * `packages/cli` publishes standalone with `commander` as its only runtime
 * dependency, and `wire-types-bundle.test.ts` refuses `@nexus/types` in any
 * `src/` module that is not a conformance gate. So the CLI cannot read the
 * contract at runtime and has always mirrored it by hand. Hand-mirroring an
 * ENUM THE USER TYPES fails differently from hand-mirroring a payload shape: a
 * stale payload field misprints a column, a stale enum REFUSES a value the
 * server accepts — or offers one it does not.
 *
 * `generate-vibe-audit-event-types.ts` is the precedent, one enum wide. This is
 * the same mechanism generalised to the contract, and its header records what
 * the narrow version cost: a hand-written list held 7 of 34 members, so the
 * terminal event of a failed deploy was rejected before any request left the
 * machine.
 *
 * ── 🚨 THE REFUSAL IS THE POINT ─────────────────────────────────────────────
 *
 * This script REFUSES, names both lists and exits non-zero when an upstream
 * change invalidates a declaration a command file makes. It never picks a
 * winner, because it cannot know which side is right — and the contract has
 * been the wrong side. `DeploymentTypeSchema` listed `SMS`, which the server
 * 500s on, while omitting `INSTAGRAM`, which had a receiver, a sender, a
 * validator and a settings schema. The CLI's hand-typed list was closer to the
 * truth than the contract on one value and wrong on the other. A generator that
 * preferred its source would have deleted a correct correction and re-advertised
 * a broken value with generated authority behind it.
 *
 * `refuseOnUndeclaredDisagreement` below states exactly what is refused and what
 * is left to ordinary diff review; read it before widening either.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Command } from "commander";

import { GENERATED_NAMESPACE_LEDGER } from "../src/commands/contract-help.ledger";
import { renderGeneratedModule } from "../src/contract-help.codegen";
import { projectDescriptor } from "./v1-contract-projection";

const CLI_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function outputPath(namespace: string): string {
  return join(CLI_ROOT, "src", "commands", `${namespace}.contract.generated.ts`);
}

/** Every leaf under a namespace, flattened. */
function leaves(command: Command, prefix: readonly string[]): { path: string; cmd: Command }[] {
  const children = command.commands.filter((child) => child.name() !== "help");
  if (children.length === 0) {
    return prefix.length === 0 ? [] : [{ path: prefix.join(" "), cmd: command }];
  }
  return children.flatMap((child) => leaves(child, [...prefix, child.name()]));
}

/**
 * 🚨 THE REFUSAL. This is the part of the generator that matters most.
 *
 * Before overwriting a namespace's data, check whether the contract has moved
 * out from under a declaration somebody wrote in a command file. Where it has,
 * print both sides and stop. Pick no winner.
 *
 * Picking a winner is the specific failure this exists to prevent, and it has a
 * worked example that ran during this file's own construction. `--type` omitted
 * `SMS` on purpose: the contract listed it, no settings schema existed behind
 * it, and the create answered 500 rather than a validation error. Meanwhile the
 * contract lacked `INSTAGRAM`, which shipped with a receiver, a sender, a
 * validator and a settings schema and was invisible to every API consumer. So
 * the CLI was right about one value and wrong about the other, and no rule of
 * precedence would have got both.
 *
 * A refusal is resolved by a human, exactly two ways:
 *   · THE CONTRACT IS WRONG → fix `packages/types`, then regenerate. This is the
 *     real fix, because the SDK and the MCP catalog read the same schema and are
 *     being told the same thing; a CLI-side declaration leaves them misinformed.
 *     It is what happened here — `DeploymentTypeSchema` now derives from the
 *     Prisma enum, and the CLI's omission was deleted rather than kept.
 *   · THE CLI IS NARROWING OR WIDENING ON PURPOSE → declare an `EnumDivergence`
 *     at the flag with its reason, which `--help` then prints.
 *
 * ── WHAT IS REFUSED, EXACTLY — and why it is not "the two lists differ" ─────
 *
 * The first implementation compared the live contract against the values the CLI
 * currently offers, and it DEADLOCKED on the very first real contract change: the
 * values a flag offers come from the COMMITTED generated file, so a routine
 * upstream edit makes them differ by construction, and the generator refused to
 * write the fix that would have reconciled them. A gate that fires on the
 * ordinary case is a gate somebody deletes, and this one also blocked its own
 * remedy.
 *
 * So the question is not "do the lists match" but "does this contract change
 * INVALIDATE A DECLARATION SOMEBODY WROTE". Three ways it can, all refused:
 *
 *   · a bound path is no longer an enum, or is gone. The field moved or changed
 *     kind; a generated const cannot be emitted for it and the flag is bound to
 *     nothing.
 *   · a declared `omit` names a value the contract no longer lists. The
 *     correction has become a no-op — it excludes nothing, and it reads exactly
 *     like one still doing its job. Someone decided that value must not be
 *     offered; whether that decision still applies is theirs, not the
 *     generator's.
 *   · a declared `alsoAccepts` alias is now a real contract value. The alias was
 *     a spelling the CLI invented; upstream adopting it changes what the flag
 *     means.
 *
 * A value simply APPEARING or DISAPPEARING upstream with no declaration touching
 * it is routine — a new channel, a new granularity — and the generated diff is
 * where a reviewer sees it. That is a review, not a refusal.
 */
function collectComplaints(
  entry: { namespace: string },
  group: Command,
  boundCommand: (cmd: Command) => unknown,
  boundOption: (option: Command["options"][number]) => BoundOptionLike | undefined,
  boundArgument: (argument: Command["registeredArguments"][number]) => BoundOptionLike | undefined
): string[] {
  const complaints: string[] = [];

  for (const { path, cmd } of leaves(group, [entry.namespace])) {
    if (!boundCommand(cmd)) continue;

    // FLAGS AND POSITIONALS, in one pass. This walked `cmd.options` alone until
    // the first positional enum was bound, which meant a divergence declared on
    // an `<argument>` escaped every refusal below — the generator would have
    // rewritten a namespace whose declaration the contract had already
    // invalidated, and said nothing. `enumArgument` records the same shape as
    // `enumOption`, so the checks need no second spelling, only a second source.
    const slots: { readonly label: string; readonly bound: BoundOptionLike | undefined }[] = [
      ...cmd.options.map((option) => ({ label: option.flags, bound: boundOption(option) })),
      ...cmd.registeredArguments.map((argument) => ({
        label: argument.name(),
        bound: boundArgument(argument)
      }))
    ];

    for (const { label, bound } of slots) {
      if (!bound) continue;

      const [descriptorName, ...rest] = bound.source.path.split(".");
      const fieldPath = rest.join(".");
      const field = projectDescriptor(descriptorName).fields.find((f) => f.path === fieldPath);

      if (!field?.enumValues) {
        complaints.push(
          `  ${path} ${label}\n` +
            `    bound to ${bound.source.path}, which the contract no longer declares as an enum.\n` +
            `    It offers: ${bound.offered.join(", ")}\n` +
            `    Either the field moved, or it stopped being an enum. Both need a human.`
        );
        continue;
      }

      const live = new Set(field.enumValues);

      const danglingOmit = (bound.divergence?.omit ?? []).filter((v) => !live.has(v));
      const collidingAlias = (bound.divergence?.alsoAccepts ?? []).filter((v) => live.has(v));

      if (danglingOmit.length > 0 || collidingAlias.length > 0) {
        complaints.push(
          `  ${path} ${label}  (${bound.source.path})\n` +
            `    contract now lists : ${field.enumValues.join(", ")}\n` +
            `    the CLI declares   : omit=[${(bound.divergence?.omit ?? []).join(", ")}] ` +
            `alsoAccepts=[${(bound.divergence?.alsoAccepts ?? []).join(", ")}]\n` +
            `    reason             : ${bound.divergence?.because ?? "(none)"}\n` +
            (danglingOmit.length > 0
              ? `    OMITS a value the contract no longer lists: ${danglingOmit.join(", ")}\n` +
                `      The correction now excludes nothing. Delete it, or fix the path.\n`
              : "") +
            (collidingAlias.length > 0
              ? `    ALIASES a value the contract now lists: ${collidingAlias.join(", ")}\n` +
                `      Upstream adopted the CLI's own spelling. Drop the alias.\n`
              : "")
        );
      }
    }
  }

  return complaints;
}

/** The shape `contract-binding.ts` records against an `Option`. */
interface BoundOptionLike {
  readonly source: { readonly path: string; readonly contractValues: readonly string[] };
  readonly divergence?: {
    readonly omit?: readonly string[];
    readonly alsoAccepts?: readonly string[];
    readonly because: string;
  };
  readonly offered: readonly string[];
}

function refusalMessage(namespace: string, complaints: readonly string[]): string {
  return (
    `REFUSING "${namespace}" — a contract change has invalidated a ` +
    `declaration in the command file.\n\n${complaints.join("\n")}\n` +
    `Neither list is automatically right. The contract has already been the wrong one: it lists\n` +
    `a deployment type the server 500s on, which the CLI omits on purpose.\n\n` +
    `Resolve it one of two ways, then re-run:\n` +
    `  1. The contract is wrong  -> fix packages/types. This is the real fix: the SDK and the\n` +
    `     MCP catalog read the same schema and are being told the same thing.\n` +
    `  2. The CLI is narrowing or widening on purpose -> declare an EnumDivergence at the flag,\n` +
    `     with a reason. The reason is printed in --help.`
  );
}

/*
 * ── TWO PHASES, AND THE ORDER IS FORCED ─────────────────────────────────────
 *
 * WRITE first, VERIFY second, with a dynamic import in between.
 *
 * The verification needs the declarations, which live on the flags, which means
 * importing the command modules — and those import the generated modules this
 * script writes. `scripts/generated-drift.mjs` DELETES a target's outputs before
 * re-running its generator, precisely so a generator that silently does nothing
 * leaves deletions rather than comparing files against themselves. With those
 * imports at the top of this file, that deletion makes the script fail to LOAD,
 * and the drift check would report a broken generator instead of a clean tree.
 *
 * Writing before verifying costs nothing, because a generated file only ever
 * carries the contract's own facts and is correct by construction. What can be
 * wrong is the DECLARATION in the command file, which this script never touches
 * — so a refusal after the write still stops the run, still names both lists,
 * and still leaves the human the same two choices.
 *
 * 🚨 THE PHASE-1 IMPORTS ARE PART OF THAT, AND ONE OF THEM USED TO BREAK IT.
 * Phase 1 needs the list of namespaces, and the list used to live in
 * `contract-help.namespaces`, which names 39 registrars — values, so importing
 * it loads all 39 command files and every generated artifact with them. That
 * import sat ABOVE the write, so under the drift check's wipe this script died
 * before writing a byte:
 *
 *   Error: Cannot find module './analytics.contract.generated'
 *   Require stack: src/commands/analytics.ts, src/commands/contract-help.namespaces.ts
 *
 * `contract-help.ledger` is the same list with no registrars and no imports at
 * all, so it is safe above the write and is imported statically. NOTHING ELSE
 * MAY JOIN IT THERE: every phase-1 import must be reachable with the whole
 * `src/commands/*.contract.generated.ts` set deleted.
 *
 * (`main()` rather than top-level await: tsx transforms this to CJS, where
 * top-level await is a build error rather than a runtime one.)
 */
async function main(): Promise<void> {
  let wrote = 0;
  let unchanged = 0;

  for (const entry of GENERATED_NAMESPACE_LEDGER) {
    // Sorted, so the emitted order never depends on how the list happens to be
    // typed and two runs cannot differ.
    const descriptors = [...entry.descriptors].sort().map(projectDescriptor);

    if (descriptors.every((descriptor) => descriptor.fields.length === 0)) {
      throw new Error(
        `Namespace "${entry.namespace}" projected ${descriptors.length} descriptor(s) and not ` +
          `one field. Refusing to write an empty module: every enum flag bound to it would then ` +
          `be offered no values at all.`
      );
    }

    const rendered = renderGeneratedModule(entry.namespace, descriptors);
    const target = outputPath(entry.namespace);

    let existing: string | undefined;
    try {
      existing = readFileSync(target, "utf-8");
    } catch {
      existing = undefined;
    }

    if (existing === rendered) {
      unchanged += 1;
      continue;
    }

    writeFileSync(target, rendered, "utf-8");
    wrote += 1;
    const enums = descriptors.flatMap((d) => d.fields.filter((f) => f.enumValues)).length;
    console.log(
      `${entry.namespace}: ${descriptors.length} descriptor(s), ${enums} enum(s) -> ${target}`
    );
  }

  console.log(`Done. ${wrote} written, ${unchanged} already current.`);

  // ── Phase 2 ──────────────────────────────────────────────────────────────
  // Imported here, not at the top: both of these reach the files just written.
  // `contract-help.namespaces` is the registrar half of the ledger, and loading
  // it is what pulls in all 39 command modules.
  const { GENERATED_NAMESPACES, buildNamespace } = await import(
    "../src/commands/contract-help.namespaces"
  );
  const binding = await import("../src/contract-binding");

  const refusals = GENERATED_NAMESPACES.flatMap((entry) => {
    const complaints = collectComplaints(
      entry,
      buildNamespace(entry),
      binding.boundCommand as (cmd: Command) => unknown,
      binding.boundOption as (o: Command["options"][number]) => BoundOptionLike | undefined,
      binding.boundArgument as (
        a: Command["registeredArguments"][number]
      ) => BoundOptionLike | undefined
    );
    return complaints.length > 0 ? [refusalMessage(entry.namespace, complaints)] : [];
  });

  if (refusals.length > 0) {
    console.error(`\n${refusals.join("\n\n")}`);
    // `exit(1)`, never `exit(refusals.length)`. An exit code is ONE BYTE, so a
    // count of exactly 256 exits 0 and reads as a clean run.
    process.exit(1);
  }
}

void main();
