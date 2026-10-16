import type { Option } from "commander";

import { boundOption } from "../contract-binding";

/**
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
