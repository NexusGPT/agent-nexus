import type { Command, Option } from "commander";

export const STUB_UUID = "11111111-1111-4111-8111-111111111111";

/**
 * A value for one declared slot, chosen from its NAME.
 *
 * The name is the only signal available and it is a good one: this CLI names an
 * id `<id>`, a body `<json>` and a limit `<n>`. A wrong guess costs one run its
 * `clean` and lands it in `error-path`, which the gate counts rather than
 * hides — so the synthesizer degrades into "measured less", never into "passed
 * without looking".
 */
export function placeholderFor(name: string, sandboxDir: string): string {
  const n = name.toLowerCase();
  const has = (...needles: string[]): boolean => needles.some((needle) => n.includes(needle));

  if (has("json", "body", "payload", "schema", "params", "properties")) return "{}";
  if (has("id", "uuid", "sid")) return STUB_UUID;
  if (has("email")) return "stub@example.com";
  if (has("url", "endpoint", "webhook")) return "https://example.invalid/stub";
  if (has("file", "path", "dir", "output", "zip", "archive")) return `${sandboxDir}/stub.txt`;
  if (has("date", "since", "until", "after", "before")) return "2026-01-01";
  // 🚨 NO BARE `"n"` HERE, AND THAT ONE LETTER COST REAL COVERAGE. The list was
  // a substring test and `"n"` is a substring of `name`, `friendlyName`,
  // `connection`, `region` — so a third of the tree was handed `"1"` where it
  // wanted a word, and every one of those runs died in an argument refusal that
  // the scan then counted as an unmeasured command. The metavariable `<n>` is
  // not what is being read either: commander's `attributeName()` is the LONG
  // FLAG (`limit`), never the placeholder in the help text.
  if (has("limit", "page", "count", "port", "days", "seconds", "size", "offset", "number")) {
    return "1";
  }
  return "stub";
}

/** commander declares whether an option takes a value and whether it is required. */
function optionValue(option: Option, sandboxDir: string): string[] {
  const flag = option.long ?? option.short ?? "";
  if (!option.required && !option.optional) return [flag];
  const choices = option.argChoices;
  const value = choices?.[0] ?? placeholderFor(option.attributeName(), sandboxDir);
  return [flag, value];
}

export interface Synthesized {
  readonly argv: string[];
  readonly synthesized: boolean;
  readonly hasDryRun: boolean;
}

/**
 * Build the argv that reaches this command's action.
 *
 * Mandatory options and required positionals only. Passing every declared flag
 * would fire mutually exclusive ones together and measure a shape no user can
 * produce; passing none would stop at commander's own refusal for half the tree.
 * `--yes` is the one exception and it is not a special case so much as the same
 * rule: without a terminal the confirmation REFUSES (by design — see
 * `util/confirm`), so a destructive command would never reach its printer.
 */
export function synthesizeArgv(path: string, command: Command, sandboxDir: string): Synthesized {
  const argv = [...path.split(" ")];
  let synthesized = false;
  let hasDryRun = false;

  for (const option of command.options) {
    const long = option.long ?? "";
    if (long === "--dry-run") {
      hasDryRun = true;
      continue;
    }
    if (long === "--yes") {
      argv.push(long);
      continue;
    }
    if (!option.mandatory) continue;
    argv.push(...optionValue(option, sandboxDir));
    synthesized = true;
  }

  for (const argument of command.registeredArguments) {
    if (!argument.required) continue;
    argv.push(placeholderFor(argument.name(), sandboxDir));
    synthesized = true;
  }

  return { argv, synthesized, hasDryRun };
}
