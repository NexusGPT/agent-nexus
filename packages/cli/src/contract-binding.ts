import { Argument, Command, InvalidArgumentError, Option } from "commander";

import {
  type ProjectedDescriptor,
  type RenderedOmission,
  renderFullContract,
  renderHelpBlock
} from "./contract-help.render";

/**
 * THE JOIN KEY between a `--flag` and the Public API v1 field it fills.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 *
 * `--help` is hand-typed prose describing behaviour defined three packages away
 * in `packages/types/src/api/public/v1/`. Nothing linked the two, so an audit of
 * 674 help claims found 75 contradicted. The specific, mechanical half of that
 * is enum values: every enum the CLI accepts was validated only by the server
 * and documented only as English inside a `.option()` description. There was not
 * one `.choices()` call in the package, so `--granularity dayly` left the
 * machine, crossed the network, and came back a 400 with no list of what would
 * have worked.
 *
 * Fixing that needs one thing nothing in this repository records: WHICH schema
 * field a given flag fills. `--group-by` → `groupBy` is a convention;
 * `--metric` → `metrics` and `--filter` → `filters[].op` are not, and each
 * `.action()` does the mapping by hand in a different way. So the mapping is
 * declared here, ON the flag, rather than in a table somewhere else — a table
 * goes stale the first time somebody renames a flag and nothing points at it.
 *
 * ── What is generated and what is not ────────────────────────────────────────
 *
 * SHAPE is generated: the values of an enum, and the required keys of a body.
 * `<namespace>.contract.generated.ts` holds them, emitted by
 * `scripts/generate-contract-help.ts` from the real Zod schemas.
 *
 * MEANING is not, and never will be. Why a field is null, what breaks if you run
 * a command twice, which parser branch swallows a malformed input — no schema
 * contains any of that. It stays in `addHelpText` in the command file, beside the
 * behaviour it describes.
 *
 * ── The rule that matters most ───────────────────────────────────────────────
 *
 * 🚨 THE CONTRACT IS NOT AN AUTHORITY. It is one of two opinions, and it has
 * been the wrong one. `DeploymentTypeSchema` listed `SMS`, which no settings
 * schema stands behind and which answers 500 rather than a validation error,
 * while omitting `INSTAGRAM`, which shipped with a receiver, a sender, a
 * validator and a settings schema and was invisible to every API consumer. The
 * CLI's hand-typed list was right about the first and wrong about the second, so
 * no rule of precedence would have got both. A generator that preferred its
 * source would have deleted a correct correction and re-advertised a broken
 * value with generated authority behind it.
 *
 * So a divergence is DECLARED, at the flag, with its reason, and the reason is
 * rendered into `--help` for the operator to read. It is not a suppression entry
 * in a list somewhere: `contract-help.test.ts` fails when a declared omission no
 * longer matches anything upstream, which turns a stale correction into a red
 * build instead of a silent no-op, and the generator refuses outright when a
 * contract change invalidates a declaration.
 *
 * A declaration is also NOT the fix when the contract is wrong. It leaves the
 * SDK and the MCP catalog reading the same false schema. `SMS` was removed from
 * `packages/types` rather than papered over here, and that is the pattern.
 */

/**
 * A contract enum, as emitted into `<namespace>.contract.generated.ts`.
 *
 * `path` is the join key and the only hand-written part: `<Descriptor>.<slot>.
 * <dotted field>`, where slot is `Body`, `Params` or `PathVars`, and a `[]`
 * segment steps into an array's element (`Body.filters[].op`).
 */
export interface ContractEnum {
  readonly path: string;
  /** Every value the v1 contract accepts. Generated — never hand-edited. */
  readonly contractValues: readonly string[];
}

/**
 * A declared, reasoned difference between what the CLI offers and what the
 * contract lists. There are exactly two directions and both must be stated.
 *
 * NOT a way to quiet the gate. Where the CONTRACT is wrong, the fix is the
 * contract — an omission here leaves every SDK and MCP consumer still being told
 * a broken value works.
 */
export interface EnumDivergence {
  /**
   * NARROWING. Contract values this CLI does not offer. Each must still exist
   * upstream: `contract-help.test.ts` fails on an omission that matches nothing,
   * because a filter whose target has already been removed excludes nothing and
   * reads exactly like one that is still doing its job.
   */
  readonly omit?: readonly string[];
  /**
   * WIDENING. Extra spellings the CLI accepts and normalises into a contract
   * value before sending — `7d` for `last_7_days`. Declaring them is what lets
   * `.choices()` keep validating; see `normalise` below for why that is not
   * automatic.
   */
  readonly alsoAccepts?: readonly string[];
  /** Why, in one sentence. Rendered into `--help`, so write it for an operator. */
  readonly because: string;
}

/** What the gate recovers from a live `Option`. */
export interface BoundOption {
  readonly source: ContractEnum;
  readonly divergence?: EnumDivergence;
  /** What `.choices()` was actually given: contract values minus any omission. */
  readonly offered: readonly string[];
}

/**
 * What the gate recovers from a live `Argument`.
 *
 * Structurally identical to `BoundOption`, and deliberately a separate type
 * rather than a shared one: the two are keyed off different commander objects
 * and read back through different accessors, so a single alias would let a
 * caller pass an `Option`'s record where an `Argument`'s belongs and typecheck.
 */
export interface BoundArgument {
  readonly source: ContractEnum;
  readonly divergence?: EnumDivergence;
  /** What `.choices()` was actually given: contract values minus any omission. */
  readonly offered: readonly string[];
}

/** What the gate recovers from a live `Command`. */
export interface BoundCommand {
  /** The generated shape of the v1 descriptor this command calls. */
  readonly shape: ProjectedDescriptor;
  /**
   * Enum paths this command reaches only through `--body`, each with the reason
   * it has no flag. Without this the gate cannot tell a field somebody forgot to
   * expose from one deliberately left to `--body`.
   */
  readonly bodyOnly: Readonly<Record<string, string>>;
}

/**
 * WeakMaps rather than a registry array: the gate builds a throwaway `Command`
 * tree per namespace, and a module-level array would accumulate across every
 * build in one vitest process and report another namespace's flags as this
 * one's. Keying on the object confines each entry to the tree that made it.
 */
const BOUND_OPTIONS = new WeakMap<Option, BoundOption>();
const BOUND_ARGUMENTS = new WeakMap<Argument, BoundArgument>();
const BOUND_COMMANDS = new WeakMap<Command, BoundCommand>();

export function boundOption(option: Option): BoundOption | undefined {
  return BOUND_OPTIONS.get(option);
}

export function boundArgument(argument: Argument): BoundArgument | undefined {
  return BOUND_ARGUMENTS.get(argument);
}

export function boundCommand(command: Command): BoundCommand | undefined {
  return BOUND_COMMANDS.get(command);
}

/**
 * Declare which v1 descriptor a leaf command calls, and splice the generated
 * shape into its `--help`.
 *
 * 🚨 CALL THIS LAST IN THE CHAIN, after every `.option()` AND every
 * `.addArgument()`. It reads the command's own options and positionals to find
 * the divergences it must print, and either added afterwards is invisible to the
 * block it already rendered. The gate asserts the rendered block agrees with the
 * offered choices, so getting the order wrong is a red build rather than a quiet
 * omission.
 *
 * Three things happen here:
 *   · the binding is recorded, so the gate can ask the question no flag can —
 *     does EVERY enum in this descriptor reach a flag, or is one silently
 *     undocumented?
 *   · the contract block is appended to the command's "after" help. Commander
 *     prints those in registration order, so calling this LAST puts the
 *     generated reference below the hand-written Examples and Notes — the half
 *     carrying the meaning a schema cannot hold;
 *   · `--print-contract` is added, the escape hatch from the readability rule.
 */
export function bindCommand(
  command: Command,
  shape: ProjectedDescriptor,
  bodyOnly: Readonly<Record<string, string>> = {}
): Command {
  BOUND_COMMANDS.set(command, { shape, bodyOnly });

  const omissions = new Map<string, RenderedOmission>();
  const collect = (bound: BoundOption | BoundArgument | undefined): void => {
    if (!bound?.divergence) return;
    omissions.set(bound.source.path, {
      values: bound.divergence.omit ?? [],
      because: bound.divergence.because
    });
  };
  for (const option of command.options) collect(BOUND_OPTIONS.get(option));
  // POSITIONALS TOO. A divergence declared on an argument renders into the same
  // block as one declared on a flag — an operator reading `--help` has no reason
  // to care which side of the command line a value is typed on.
  for (const argument of command.registeredArguments) collect(BOUND_ARGUMENTS.get(argument));

  const block = renderHelpBlock(shape, omissions);
  if (block !== "") command.addHelpText("after", `\n${block}`);

  command.option("--print-contract", "Print every field of the API contract behind this command");
  // 🚨 AN `option:` LISTENER, NOT A `preAction` HOOK, AND THE DIFFERENCE IS
  // WHETHER THE FLAG WORKS AT ALL ON HALF THE COMMANDS THAT OFFER IT.
  //
  // Commander enforces `.requiredOption()` inside `_parseCommand`, BEFORE any
  // action hook runs. So on `role create-job-type` — whose whole point is that
  // `--body` is required — `--print-contract` answered
  // `error: required option '--body <json>' not specified` and exited 1, while
  // the block right above it printed *"Use --print-contract for the full list"*.
  // A false instruction in shipped output, on the one route whose nested fields
  // are reachable NOWHERE else: the summary hides `parts[].unit`, and a caller
  // who cannot see it cannot compose a body the server accepts.
  //
  // `option:<name>` is emitted during option parsing, which is upstream of that
  // check — the same place `--help` and `--version` take their exits. Reading it
  // here also makes the flag independent of whether the command has an action at
  // all. Pinned by `contract-binding.print-contract.test.ts`, whose control is a
  // command with NO required option: it must print either way, so a green there
  // cannot come from the flag being broken in both.
  command.on("option:print-contract", () => {
    process.stdout.write(`${renderFullContract(shape)}\n`);
    process.exit(0);
  });

  return command;
}

/**
 * An `--flag <value>` whose accepted values come from the contract.
 *
 * A bad value is refused locally, with the valid list printed, instead of
 * becoming a server-side 400 that names nothing. Before this existed there was
 * not one `.choices()` call in the package.
 *
 * 🚨 THE VALIDATION IS DONE HERE, NOT BY `.choices()` ALONE, AND THAT IS NOT
 * BELT-AND-BRACES. Measured against commander 13.1.0: an `Option` carrying BOTH
 * `.choices()` and `.argParser()` does not check its choices at all. The parser
 * runs, its return value is taken, and an invalid argument is accepted silently
 * — while `--help` still prints `(choices: …)`, so the flag reads as validated
 * and validates nothing. Isolated by mutation: identical option, junk value,
 * `argParser` absent → refused with the allowed list; `argParser` present → not
 * refused.
 *
 * So this function never hands the caller a raw parser slot. Normalisation goes
 * through `normalise`, and the parser below validates FIRST against the same
 * list `.choices()` was given. `contract-help.test.ts` then drives every bound
 * flag with a junk value and asserts a refusal, so a future edit that reaches
 * for `.argParser()` directly turns the suite red rather than turning the check
 * off.
 *
 * The description is the caller's; this appends only the divergence sentence.
 * Commander already prints the list, and a second copy in the description is a
 * second thing to go stale.
 */
export function enumOption(
  flags: string,
  description: string,
  source: ContractEnum,
  divergence?: EnumDivergence,
  normalise?: (value: string) => string
): Option {
  const omitted = new Set(divergence?.omit ?? []);
  const offered = [
    ...source.contractValues.filter((value) => !omitted.has(value)),
    ...(divergence?.alsoAccepts ?? [])
  ];

  const text = divergence ? `${description}. ${divergence.because}` : description;
  const option = new Option(flags, text).choices([...offered]);

  if (normalise) {
    // NORMALISE FIRST, THEN VALIDATE. The other order rejects every alias the
    // normaliser exists to accept: `7d` is not a contract value, and it is not
    // supposed to be — it becomes one. Validating the OUTPUT is also the
    // stronger check, because it asserts the thing that actually goes on the
    // wire is an enum member, whatever the operator typed.
    const canonical = new Set(source.contractValues.filter((value) => !omitted.has(value)));
    option.argParser((raw: string) => {
      const value = normalise(raw);
      if (!canonical.has(value)) {
        // COMMANDER ALREADY WROTE "option '<flags>' argument '<raw>' is
        // invalid." and appends this string to it, so repeating either half
        // prints it twice. Say only what commander does not know: the list.
        throw new InvalidArgumentError(`Allowed choices are ${offered.join(", ")}.`);
      }
      return value;
    });
  }

  BOUND_OPTIONS.set(option, { source, divergence, offered });
  return option;
}

/**
 * The same binding for a POSITIONAL `<argument>` whose accepted values come from
 * the contract.
 *
 * ── 🚨 COMMANDER VALIDATES `.choices()` ON POSITIONALS TOO ──────────────────
 *
 * This file used to say otherwise, and so did three command files and the
 * rollout ledger: "commander validates `.choices()` on options only". That
 * sentence was never measured, and it is FALSE. It cost four contract
 * descriptors their binding — the enums reached the operator as prose in a
 * `Notes:` block and were checked by nothing until the server answered.
 *
 * Measured against commander 13.1.0, driving a junk value through a real
 * program rather than reading `Argument`'s source:
 *
 *   · `<required>` with `.choices()`  -> REFUSED, naming the allowed list
 *   · `[optional]` with `.choices()`  -> REFUSED
 *   · `<variadic...>` with `.choices()` -> REFUSED, per element
 *   · `[optional]` OMITTED entirely   -> accepted, parser never runs
 *
 * The refusal text is `command-argument value 'X' is invalid for argument 'y'.
 * Allowed choices are …` — the same shape an `Option` produces, so an operator
 * reads one error, not two dialects.
 *
 * ── AND THE `.argParser()` TRAP IS IDENTICAL ────────────────────────────────
 *
 * An `Argument` carrying BOTH `.choices()` and `.argParser()` does not check its
 * choices at all, exactly as an `Option` does not. Isolated by the same
 * mutation: identical argument, junk value, `argParser` absent -> refused;
 * `argParser` present -> ACCEPTED SILENTLY, with `--help` still printing
 * `(choices: …)` and `argument.argChoices` still populated.
 *
 * So this function never hands the caller a raw parser slot either.
 * Normalisation goes through `normalise`, and the parser below validates FIRST
 * against the same list `.choices()` was given. `contract-help.test.ts` drives
 * every bound POSITIONAL with a junk value and asserts a refusal, so a future
 * edit reaching for `.argParser()` directly turns the suite red rather than
 * turning the check off.
 *
 * ── ON REACHING FOR `normalise` HERE ────────────────────────────────────────
 *
 * Do not add one to case-fold. Every v1 enum behind a positional today is a bare
 * `z.enum`, which is case-SENSITIVE — measured by driving `AGENT` and
 * `CONVERSATIONS` through the real schemas, both REFUSED. A normaliser that
 * lowercased would make the CLI accept a spelling the server rejects, which is a
 * WIDENING, and a widening has to be declared as `alsoAccepts` with a reason so
 * `--help` says so. Silently is how the two ends stop agreeing.
 */
export function enumArgument(
  name: string,
  description: string,
  source: ContractEnum,
  divergence?: EnumDivergence,
  normalise?: (value: string) => string
): Argument {
  const omitted = new Set(divergence?.omit ?? []);
  const offered = [
    ...source.contractValues.filter((value) => !omitted.has(value)),
    ...(divergence?.alsoAccepts ?? [])
  ];

  const text = divergence ? `${description}. ${divergence.because}` : description;
  const argument = new Argument(name, text).choices([...offered]);

  if (normalise) {
    // NORMALISE FIRST, THEN VALIDATE — the same order and the same reasoning as
    // `enumOption`. Validating the OUTPUT asserts that the thing which actually
    // goes on the wire is an enum member, whatever the operator typed.
    const canonical = new Set(source.contractValues.filter((value) => !omitted.has(value)));
    argument.argParser((raw: string) => {
      const value = normalise(raw);
      if (!canonical.has(value)) {
        // COMMANDER ALREADY WROTE "command-argument value 'X' is invalid for
        // argument 'y'." and appends this string to it. Measured: this produces
        // a refusal BYTE-IDENTICAL to the built-in `.choices()` one, so the
        // normalised and un-normalised paths are indistinguishable to a reader.
        throw new InvalidArgumentError(`Allowed choices are ${offered.join(", ")}.`);
      }
      return value;
    });
  }

  BOUND_ARGUMENTS.set(argument, { source, divergence, offered });
  return argument;
}

/**
 * The same binding for a flag whose value is NOT one enum member — a repeatable
 * composite like `--filter <field:op:value>`, where the contract enum sits on
 * one component.
 *
 * `.choices()` cannot help here: commander would compare the whole token. So
 * this records the binding for the gate and renders the values into the
 * description, which is the only place an operator can read them. It is the
 * honest half-measure, and it is marked as one so nobody reads a bound flag as
 * a validated flag.
 */
export function enumInCompositeOption(
  flags: string,
  description: string,
  source: ContractEnum,
  component: string
): Option {
  const option = new Option(
    flags,
    `${description} (${component} = ${source.contractValues.join("|")})`
  );
  BOUND_OPTIONS.set(option, { source, offered: source.contractValues });
  return option;
}
