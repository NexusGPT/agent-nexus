import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { captureHelp } from "./command-universe/capture-help";
import { registerAgentCommands } from "./commands/agent";
import { AGENT_CREATE_HELP } from "./commands/agent/create.help";
import { registerTaskCommands } from "./commands/task";
import { TASK_EXECUTE_HELP } from "./commands/task/copy/execute-help";
import { boundCommand } from "./contract-binding";
import {
  OVERRIDE_DECLARED_FIELDS,
  overrideValidatesField,
  PROVIDER_TUNING_FIELD_NAMES,
  tuningFieldsTheOverrideSchemaSupplies
} from "./provider-tuning-fields.conformance";

/**
 * THE PUBLISHED PROVIDER-TUNING CLAIM, PINNED TO THE CONTRACT IT DESCRIBES.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WAS WRONG, AND WHY NOTHING SAW IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Three hand-written sites key on, or enumerate, the provider-tuning field names:
 *
 *   · `commands/task/execute.command.ts` — a `bodyOnly` record of six paths
 *   · `commands/task/copy/execute-help.ts` — PUBLISHED prose, named five
 *   · `commands/agent/create.help.ts` — PUBLISHED prose, named five
 *
 * Both published lists omitted `reasoningLevel`, which is the single level field
 * every provider reads and the one the other four are `@deprecated` in favour of
 * writing. So the help steered operators at four deprecated fields and hid the
 * current one — and on `agent create` an unknown `--body` key is silently
 * stripped, so acting on that list returns 201 with no tuning applied.
 *
 * `commands/contract-help.test.ts` is the gate over `bodyOnly` and could not see
 * any of it. Its two arms require a reason to be NON-EMPTY and its path to match
 * SOME field in the descriptor. Neither asks whether the SET is complete, and
 * neither reads prose at all.
 *
 * ── WHY THE HAYSTACK IS THE HAND-WRITTEN COPY AND NOT THE WHOLE `--help` ────
 *
 * 🚨 `bindCommand` appends a GENERATED contract block to this command's help,
 * and that block already lists all six field names. So a presence sweep over
 * rendered `--help` is satisfied by the generated block whatever the prose says
 * — green today, green with the prose deleted. Measured before this spec
 * existed: `captureHelp` on `task execute` is 5,269 bytes and contains every one
 * of the six, while the published prose named five.
 *
 * So each prose arm slices a MARKED REGION out of the hand-written constant,
 * and a separate arm asserts that constant is in the rendered output — which is
 * what keeps the first arm a claim about published help rather than about a dead
 * string. Set equality on comma-split tokens, never `toContain` over the blob.
 *
 * ── WHAT THIS CANNOT DO ─────────────────────────────────────────────────────
 *
 * It does not check the SENTENCES around those names. "NOT inherited from the
 * task" is `mergeModelConfig`'s behaviour in `apps/backend`, expressible in no
 * schema, so no arm here can separate a correct sentence from a reworded wrong
 * one. `provider-tuning-fields.conformance.ts` carries that limit too.
 *
 * One claim per `it`, deliberately: a failing assertion throws and aborts the
 * rest of its own block, so a count arm above a name arm would leave the name
 * arm unscored by every mutant that moves both.
 */

/** `nexus task execute`, built on its own program as the namespace gate does. */
function leaf(register: (program: Command) => void, namespace: string, name: string): Command {
  const program = new Command();
  program.name("nexus").exitOverride();
  register(program);
  const group = program.commands.find((cmd) => cmd.name() === namespace);
  if (!group) throw new Error(`no "${namespace}" command was registered`);
  const child = group.commands.find((cmd) => cmd.name() === name);
  if (!child) throw new Error(`"${namespace}" registered no "${name}" subcommand`);
  return child;
}

const TASK_EXECUTE = leaf(registerTaskCommands, "task", "execute");
const AGENT_CREATE = leaf(registerAgentCommands, "agent", "create");

/**
 * The tokens of a marked, comma-separated run of field names.
 *
 * THROWS rather than returning empty when the marker is gone. An absent marker
 * means the published copy was reworded, and an empty token list would make
 * every set comparison below vacuously pass over nothing.
 */
function namesBetween(copy: string, opening: string, closing: string): string[] {
  const start = copy.indexOf(opening);
  if (start === -1) throw new Error(`the published copy no longer carries "${opening}"`);
  const after = copy.slice(start + opening.length);
  const end = after.indexOf(closing);
  if (end === -1) throw new Error(`"${opening}" is no longer closed by "${closing}"`);
  return after
    .slice(0, end)
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token !== "");
}

const sorted = (names: readonly string[]): string[] => [...names].sort();

describe("the override contract's provider-tuning fields", () => {
  it("validates every field the contract derives as provider tuning", () => {
    // FLOOR AND SET EQUALITY IN ONE CLAIM. The floor alone cannot see a field
    // leaving the override schema, and the equality alone is vacuous over an
    // emptied derived set.
    expect(PROVIDER_TUNING_FIELD_NAMES.length).toBeGreaterThan(1);
    expect(sorted(PROVIDER_TUNING_FIELD_NAMES.filter(overrideValidatesField))).toEqual(
      sorted(PROVIDER_TUNING_FIELD_NAMES)
    );
  });

  it("can report a key it does not validate", () => {
    // THE CONTROL THAT CAN STOP ME. The arm above rests on
    // `overrideValidatesField` being able to answer NO; a probe stuck on YES
    // would make it pass over nothing. The positive half names `modelProvider`
    // rather than `modelName`, because `modelName` is a bare `z.string()` and
    // the probe's junk value is a valid one for it — the conformance module
    // carries why that is a limit on the probe's population, not a defect.
    expect(overrideValidatesField("__a-field-no-contract-declares__")).toBe(false);
    expect(overrideValidatesField("modelProvider")).toBe(true);
  });

  it("supplies no tuning field when an override names none", () => {
    // The schema property the published "or the call runs with none" rests on.
    // A `.default()` on any tuning field puts that field's name here.
    expect(tuningFieldsTheOverrideSchemaSupplies()).toEqual([]);
  });
});

describe("nexus task execute's body-only declaration", () => {
  const bodyOnlyPaths = (): string[] => Object.keys(boundCommand(TASK_EXECUTE)?.bodyOnly ?? {});

  it("names exactly the contract's provider-tuning fields", () => {
    expect(sorted(bodyOnlyPaths())).toEqual(
      sorted(PROVIDER_TUNING_FIELD_NAMES.map((field) => `Body.modelOverride.${field}`))
    );
  });

  it("declares no routing field body-only", () => {
    // THE EXCLUDED COMBINATION. `customModelId` is not inherited either, and it
    // HAS a flag — `--custom-model-id` — so declaring it body-only would publish
    // a reason telling an operator to reach for `--body` for a value a flag
    // already carries. Same for the routing pair.
    const routing = OVERRIDE_DECLARED_FIELDS.filter(
      (field) => !PROVIDER_TUNING_FIELD_NAMES.includes(field)
    );
    expect(routing.length).toBeGreaterThan(1);
    const declared = new Set(bodyOnlyPaths());
    expect(routing.filter((field) => declared.has(`Body.modelOverride.${field}`))).toEqual([]);
  });
});

describe("nexus task execute's published tuning note", () => {
  it("is in the rendered help", () => {
    // What makes the next arm a claim about PUBLISHED help. Without it, the
    // constant could be dropped from the command and the list arm would still
    // read the string and pass.
    expect(captureHelp(TASK_EXECUTE)).toContain(TASK_EXECUTE_HELP.trim());
  });

  it("names exactly the contract's provider-tuning fields", () => {
    expect(sorted(namesBetween(TASK_EXECUTE_HELP, "These have no flag: ", "."))).toEqual(
      sorted(PROVIDER_TUNING_FIELD_NAMES)
    );
  });
});

describe("nexus agent create's body-only declaration", () => {
  it("names exactly the contract's provider-tuning fields under modelConfig", () => {
    // READ OFF THE BOUND COMMAND, not off `MODEL_CONFIG_TUNING`: a record that
    // is correct and no longer passed to `bindCommand` would satisfy an arm over
    // the constant while declaring nothing to the gate.
    //
    // Scoped to the `Body.modelConfig.` prefix because that record also carries
    // `Body.modelProvider`, the flat mirror, which is not a tuning field.
    // `temperature` and `customModelId` never appear: the gate's population is
    // fields WITH `enumValues`, and neither is an enum.
    const underModelConfig = Object.keys(boundCommand(AGENT_CREATE)?.bodyOnly ?? {}).filter(
      (path) => path.startsWith("Body.modelConfig.")
    );
    expect(sorted(underModelConfig)).toEqual(
      sorted(PROVIDER_TUNING_FIELD_NAMES.map((field) => `Body.modelConfig.${field}`))
    );
  });
});

describe("nexus agent create's published modelConfig list", () => {
  it("is in the rendered help", () => {
    expect(captureHelp(AGENT_CREATE)).toContain(AGENT_CREATE_HELP.trim());
  });

  it("names every provider-tuning field the contract derives", () => {
    // A SUPERSET here, not set equality: this run legitimately also names the
    // routing pair, `temperature` and `customModelId`. Token comparison rather
    // than a substring sweep, so no name can be satisfied by a longer sibling.
    const tokens = new Set(namesBetween(AGENT_CREATE_HELP, "modelConfig{", "}"));
    expect(tokens.size).toBeGreaterThan(PROVIDER_TUNING_FIELD_NAMES.length);
    expect(PROVIDER_TUNING_FIELD_NAMES.filter((field) => !tokens.has(field))).toEqual([]);
  });
});
