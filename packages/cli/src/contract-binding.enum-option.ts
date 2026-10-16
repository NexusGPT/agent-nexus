import { Option } from "commander";

import { describeOffer, normalisingParser, resolveOffer } from "./contract-binding.offer";
import { rememberOption } from "./contract-binding.registry";
import type { ContractEnum, EnumDivergence } from "./contract-binding.types";

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
 * through `normalise`, and {@link normalisingParser} validates FIRST against the
 * same list `.choices()` was given. `contract-help.test.ts` then drives every
 * bound flag with a junk value and asserts a refusal, so a future edit that
 * reaches for `.argParser()` directly turns the suite red rather than turning
 * the check off.
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
  const offer = resolveOffer(source, divergence);
  const option = new Option(flags, describeOffer(description, divergence)).choices([
    ...offer.offered
  ]);

  if (normalise) option.argParser(normalisingParser(normalise, offer));

  rememberOption(option, { source, divergence, offered: offer.offered });
  return option;
}
