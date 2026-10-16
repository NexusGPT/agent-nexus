import { Argument } from "commander";

import { describeOffer, normalisingParser, resolveOffer } from "./contract-binding.offer";
import { rememberArgument } from "./contract-binding.registry";
import type { ContractEnum, EnumDivergence } from "./contract-binding.types";

/**
 * The same binding as `enumOption` for a POSITIONAL `<argument>` whose accepted
 * values come from the contract.
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
 * Normalisation goes through `normalise`, and {@link normalisingParser}
 * validates FIRST against the same list `.choices()` was given.
 * `contract-help.test.ts` drives every bound POSITIONAL with a junk value and
 * asserts a refusal, so a future edit reaching for `.argParser()` directly turns
 * the suite red rather than turning the check off.
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
  const offer = resolveOffer(source, divergence);
  const argument = new Argument(name, describeOffer(description, divergence)).choices([
    ...offer.offered
  ]);

  if (normalise) argument.argParser(normalisingParser(normalise, offer));

  rememberArgument(argument, { source, divergence, offered: offer.offered });
  return argument;
}
