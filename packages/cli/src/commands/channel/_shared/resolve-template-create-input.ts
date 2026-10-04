import { refuse } from "../../../errors";
import { templateVariablesFromJson } from "../template.variables-from-json";
import { warnIfHighVariableDensity } from "../template.warn-variable-density";
import type { TemplateCreateOptions } from "../template-create.options";
import { refuseBadTemplateCreateOptions } from "../template-create.refuse-bad-options";
import { resolveTemplateTypes } from "../template-create.resolve-types";

type ResolvedTypes = Extract<ReturnType<typeof resolveTemplateTypes>, { ok: true }>["types"];
type ResolvedVariables = Extract<
  ReturnType<typeof templateVariablesFromJson>,
  { ok: true }
>["variables"];

/**
 * The flag-validation prologue of `nexus channel whatsapp-template create`,
 * lifted out of the action verbatim.
 *
 * Returns `undefined` HAVING ALREADY SET `process.exitCode` — each refusal is the
 * same call, with the same message, that used to sit inline.
 */
export function resolveTemplateCreateInput(
  opts: TemplateCreateOptions
): { types: ResolvedTypes; variables: ResolvedVariables } | undefined {
  const badOptions = refuseBadTemplateCreateOptions(opts);
  if (badOptions !== null) {
    process.exitCode = badOptions;
    return undefined;
  }

  const resolvedTypes = resolveTemplateTypes(opts);
  if (!resolvedTypes.ok) {
    process.exitCode = resolvedTypes.exitCode;
    return undefined;
  }

  const parsedVariables = templateVariablesFromJson(opts.variables);
  if (!parsedVariables.ok) {
    process.exitCode = refuse("--variables must be valid JSON.");
    return undefined;
  }

  // Advice, not a gate — the create happens either way.
  warnIfHighVariableDensity(resolvedTypes.types);

  return { types: resolvedTypes.types, variables: parsedVariables.variables };
}
