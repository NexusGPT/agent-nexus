import type { Option } from "commander";

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
