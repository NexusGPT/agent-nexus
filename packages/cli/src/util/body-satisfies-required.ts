import type { Command, Option } from "commander";

import { boundOption } from "../contract-binding";
import { resolveBody } from "./body";

/**
 * A REQUIRED FIELD IS SATISFIED BY `--body`, NOT ONLY BY ITS FLAG.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS DELETES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Dozens of commands declare `--body <json>` alongside `requiredOption` flags
 * for the same fields, and their help documents a body-only invocation:
 *
 *   $ nexus agent create --body '{"firstName":"Ada","lastName":"Lovelace","role":"Assistant"}'
 *
 * That line could not run. Commander validates mandatory options in
 * `_parseCommand`, BEFORE the pre-action hooks and before the action handler —
 * so the command exited with
 *
 *   error: required option '--first-name <name>' not specified
 *
 * without reading a single byte of `--body`. The action itself was already
 * correct: it merges the body with the flags. The only thing standing between
 * the documented form and a working request was WHEN the check ran.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS ONE SEAM AND NOT A LIST
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The same defect was shipped independently on every affected command, which is
 * the signature of a rule that lives in nobody's code. A hand-maintained list of
 * participating commands would be that same defect one level up: it goes stale
 * in silence, and the next command to declare `--body` beside a `requiredOption`
 * inherits the bug with nothing to notice it.
 *
 * So the POPULATION IS DERIVED. This walks the real commander tree once, after
 * every command is registered, and rewires every command whose SHAPE matches —
 * a JSON body flag plus at least one other mandatory option. A command written
 * next month participates without its author knowing this file exists.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE MECHANISM
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * For each matching command:
 *
 *  1. Every OTHER mandatory option is made non-mandatory
 *     (`Option.makeOptionMandatory(false)`), so commander's own early check
 *     stops firing. `mandatory` is read in exactly one place in commander —
 *     `_checkForMissingMandatoryOptions` — and never by the help renderer, so
 *     `--help` is unchanged by this.
 *  2. A `preAction` hook re-imposes the requirement at a point where `--body`
 *     has been read: a field is present if the FLAG carries a value OR the body
 *     carries the field's key.
 *  3. Where only the body carries it, the value is BACKFILLED into the option
 *     store, so `opts.<field>` reads the same thing it would have read from the
 *     flag.
 *
 * The check is therefore strictly WEAKER than commander's in one direction and
 * identical in the other: everything commander accepted is still accepted, and
 * a field supplied only through `--body` is now accepted too. Nothing that was
 * an error becomes silent.
 *
 * ── WHY STEP 3 IS NOT OPTIONAL ───────────────────────────────────────────────
 *
 * Permitting the command is not the same as making it work, and the difference
 * is silent. A required flag is not always a body field: `access-card create
 * --credential-id` is a URL SEGMENT, read as `opts.credentialId` and interpolated
 * into the path. With the check deferred and nothing backfilled, that command
 * stopped erroring and started sending
 *
 *   POST /api/public/v1/credentials/undefined/cards
 *
 * — a request that is worse than the refusal it replaced, because it looks like
 * the command ran. Measured, not reasoned: the probe that found it asserts on
 * the request that reaches a server, which is why it caught what a check on the
 * CLI's own exit code could not.
 *
 * Backfilling is confined to STRING values. A body may legitimately carry
 * `{"collectionIds":["a","b"]}` where the flag is a comma-separated string, and
 * writing an array where an action expects a string turns a clear failure into
 * a `TypeError`. Actions that read such a field must tolerate its absence; the
 * flag path and the body path then differ in TYPE, which is the action's own
 * business and not something this seam can decide for it.
 *
 * ── PRECEDENCE: THE FLAG WINS ────────────────────────────────────────────────
 *
 * When a field arrives through both paths, the explicit flag wins. That is not a
 * new decision — it is what `mergeBodyWithFlags` and `readStringField` have
 * always done, and what the root epilogue in `index.ts` states under SENDING A
 * BODY. This seam deliberately does not touch merging; it only decides whether
 * the command is allowed to run. Choosing body-wins here would have contradicted
 * the merge that happens milliseconds later, which is the worst of both.
 *
 * ── WHICH BODY KEY SATISFIES A FLAG: DECLARED FIRST, INFERRED LAST ───────────
 *
 * `--first-name` is satisfied by `"firstName"` — commander's own
 * `attributeName()`, and the key the action handlers already merge under. That
 * inference is right whenever a flag is named after the field it fills, which
 * was every flag in the package when this seam was written.
 *
 * 🚨 IT IS NOT AN INVARIANT, AND THE FIRST COUNTEREXAMPLE WAS MANUFACTURED BY A
 * FIX RATHER THAN BY AN ACCIDENT. `custom-model create` fills the API's `baseUrl`
 * and `apiKey`. It cannot call its flags `--base-url` and `--api-key`, because
 * those are GLOBAL options and the root consumes their values across the whole of
 * argv — so the subcommand's slots stay `undefined` and the operator's provider
 * key is applied to this CLI's own transport. Renaming them to `--endpoint-url`
 * and `--endpoint-key` fixes that and breaks the inference: a mandatory
 * `--endpoint-url` made this seam demand `"endpointUrl"` in the body, refusing a
 * CORRECT body and naming a key the server has never heard of. The class is
 * permanent — whenever a flag must be renamed away from its field, the name that
 * matches is precisely the one that was taken.
 *
 * So the key is RESOLVED from three sources, in order, and the resolution is
 * reported so the refusal can name the key it actually checked:
 *
 *   1. `satisfiedByBodyField(option, "baseUrl")` — declared ON the flag. The
 *      explicit channel, for exactly the case above.
 *   2. `boundOption(option)` from `contract-binding.ts`, when its contract path
 *      sits in the `Body` slot. That file already owns the flag→v1-field join key
 *      and its own docblock says so; two mechanisms in one package answering the
 *      same question, one by declaration and one by inference, is how the
 *      inferring one gets to be quietly wrong.
 *   3. `attributeName()`. Unchanged behaviour for every flag that has neither.
 *
 * ── WHEN 1 AND 2 DISAGREE, THIS GOES RED ─────────────────────────────────────
 *
 * A declared field and a contract-derived `Body` field that name DIFFERENT keys
 * are two authorities contradicting each other about the same flag, and there is
 * no basis for preferring either: `contract-binding.ts`'s own header records the
 * contract being the wrong one (`DeploymentTypeSchema` advertised a value that
 * answers 500 and omitted one that shipped complete), and the whole point of the
 * declared channel is to override a bad inference. Picking a winner silently
 * would make one of those two failures invisible.
 *
 * So `applyBodySatisfiesRequired` THROWS, at build time, naming the flag and both
 * keys. It fires while the program is being constructed — before any parse — so
 * it is caught by every test that calls `buildRootProgram()` and by the first
 * local run, never by an operator. It cannot fire on correct code: it needs both
 * channels populated on one flag with different `Body` fields, which is a
 * contradiction rather than a configuration.
 *
 * DIFFERING from `attributeName()` is NOT a disagreement — it is the entire
 * reason both channels exist, and `--endpoint-url` → `baseUrl` is the worked
 * example.
 *
 * ── STDIN IS READ ONCE ───────────────────────────────────────────────────────
 *
 * This resolves `--body` and so does the action, and `--body -` can only be read
 * once. `resolveRequiredBody` memoizes on the raw flag value for exactly that
 * reason; its own docblock owns the argument. Without it, `--body -` would hang
 * forever rather than fail.
 */

/**
 * Flags whose satisfying body field is DECLARED rather than inferred.
 *
 * A `WeakMap` on the `Option` for the same reason `contract-binding.ts` uses
 * one: a module-level registry accumulates across every throwaway `Command` tree
 * built in one vitest process and reports another namespace's flags as this
 * one's. Keying on the object confines an entry to the tree that made it.
 */
const DECLARED_BODY_FIELD = new WeakMap<Option, string>();

/**
 * Declare which `--body` field satisfies this flag, when it is not the flag's
 * own name.
 *
 * ```ts
 * .addOption(satisfiedByBodyField(new Option("--endpoint-url <url>", "…"), "baseUrl"))
 * ```
 *
 * Returns the option so it composes into a fluent chain. Use it whenever a flag
 * is deliberately named away from the field it fills — the usual cause is that
 * the matching name belongs to a global option.
 */
export function satisfiedByBodyField(option: Option, field: string): Option {
  DECLARED_BODY_FIELD.set(option, field);
  return option;
}

/** Where a resolved body key came from. Named so a refusal can be honest. */
export type BodyFieldSource = "declared" | "contract" | "attribute";

/**
 * The `Body`-slot field a contract binding points at, if it points at one.
 *
 * `ContractEnum.path` is `<Descriptor>.<slot>.<dotted field>`. Only the `Body`
 * slot says anything about what `--body` must carry; a `Params` or `PathVars`
 * binding is about the query string or the URL and is not a body key.
 */
function contractBodyField(option: Option): string | undefined {
  const path = boundOption(option)?.source.path;
  if (path === undefined) return undefined;
  const segments = path.split(".");
  const slot = segments.indexOf("Body");
  if (slot === -1 || slot === segments.length - 1) return undefined;
  return segments.slice(slot + 1).join(".");
}

/**
 * Resolve the body key that satisfies a flag, and say which channel decided.
 *
 * Throws when the declared and contract channels contradict each other — see
 * the module docblock for why that is not a preference to be resolved silently.
 */
export function resolveBodyField(option: Option): {
  field: string;
  source: BodyFieldSource;
} {
  const declared = DECLARED_BODY_FIELD.get(option);
  const fromContract = contractBodyField(option);

  if (declared !== undefined && fromContract !== undefined && declared !== fromContract) {
    throw new Error(
      `${option.flags}: satisfiedByBodyField() says the body field is "${declared}", ` +
        `but its contract binding says "${fromContract}". Two authorities, one flag, ` +
        `and no basis for preferring either — fix whichever is wrong rather than ` +
        `letting this seam choose.`
    );
  }

  if (declared !== undefined) return { field: declared, source: "declared" };
  if (fromContract !== undefined) return { field: fromContract, source: "contract" };
  return { field: option.attributeName(), source: "attribute" };
}

/**
 * Which flags carry a JSON request body.
 *
 * `--body` on most namespaces, `--data` on `ticket` — the root epilogue records
 * that exception. The placeholder is what discriminates a JSON body from a
 * same-named prose field: `ticket comment --body <text-or-->` is a comment's
 * TEXT, not a request body, and must keep commander's early check.
 */
function findJsonBodyOption(command: Command): Option | undefined {
  return command.options.find(
    (option) => (option.long === "--body" || option.long === "--data") && /<json/.test(option.flags)
  );
}

/**
 * Every command in the tree, root included, depth first.
 */
function everyCommand(root: Command): Command[] {
  const out: Command[] = [root];
  for (const child of root.commands) out.push(...everyCommand(child));
  return out;
}

/**
 * A command whose required flags may instead be supplied inside its JSON body,
 * and the options that applies to.
 *
 * Exported so the test can derive the same population from the same rule rather
 * than restating it — a test carrying its own copy of the predicate proves the
 * copy, not the code.
 */
export interface DeferredRequirement {
  command: Command;
  bodyFlag: string;
  options: Option[];
}

export function findDeferredRequirements(root: Command): DeferredRequirement[] {
  const out: DeferredRequirement[] = [];
  for (const command of everyCommand(root)) {
    const bodyOption = findJsonBodyOption(command);
    if (!bodyOption) continue;
    const options = command.options.filter((option) => option.mandatory && option !== bodyOption);
    if (options.length === 0) continue;
    out.push({ command, bodyFlag: bodyOption.long as string, options });
  }
  return out;
}

/**
 * The error a genuinely missing field produces.
 *
 * The first clause is byte-identical to commander's own
 * `missingMandatoryOptionValue`, so anything matching that string still matches.
 * The second clause is the reason this function exists: the old message named
 * one of the two ways to satisfy the field and read as though it were the only
 * one, which is how an operator holding a correct `--body` concluded the body
 * form did not exist.
 *
 * 🚨 IT NAMES THE KEY THIS SEAM ACTUALLY CHECKED, never the flag's camelCase.
 * The two are the same for most flags and deliberately different for some, and
 * getting it wrong is worse than the original defect: it sends an operator to
 * add a key the server discards, so the body they were told to write is refused
 * again, silently, for the same reason. Take the field from
 * {@link resolveBodyField} rather than recomputing it here — one derivation, one
 * chance to be wrong.
 */
export function missingFieldMessage(option: Option, bodyFlag: string, field: string): string {
  return (
    `error: required option '${option.flags}' not specified — ` +
    `supply it as a flag, or as "${field}" inside ${bodyFlag} ` +
    `(the flag wins if you supply both)`
  );
}

/**
 * Rewire every command in the tree whose required flags can be satisfied from
 * its JSON body. Call ONCE, from `index.ts`, after every command is registered.
 */
export function applyBodySatisfiesRequired(root: Command): void {
  for (const { command, bodyFlag, options } of findDeferredRequirements(root)) {
    // Resolve every key HERE, while the tree is being built, so a contradiction
    // between the declared and contract channels throws before any parse rather
    // than inside a pre-action hook on one unlucky invocation.
    const deferred = options.map((option) => ({
      option,
      attribute: option.attributeName(),
      ...resolveBodyField(option)
    }));

    for (const { option } of deferred) option.makeOptionMandatory(false);

    const bodyAttribute = bodyFlag.replace(/^--/, "");

    command.hook("preAction", async (_thisCommand, actionCommand) => {
      const opts = actionCommand.opts();
      const rawBody: unknown = opts[bodyAttribute];
      const body = typeof rawBody === "string" ? await resolveBody(rawBody) : undefined;

      for (const { option, attribute, field } of deferred) {
        if (opts[attribute] !== undefined) continue; // the flag wins, always

        // `field` is the BODY key, `attribute` is where the ACTION reads it.
        // They differ whenever a flag is named away from the field it fills, and
        // conflating them is what refused a correct body.
        const fromBody = body?.[field];
        if (fromBody === undefined) {
          actionCommand.error(missingFieldMessage(option, bodyFlag, field), {
            code: "commander.missingMandatoryOptionValue"
          });
          return;
        }
        if (typeof fromBody === "string") actionCommand.setOptionValue(attribute, fromBody);
      }
    });
  }
}
