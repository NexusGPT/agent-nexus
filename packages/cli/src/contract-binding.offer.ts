import { InvalidArgumentError } from "commander";

import type { ContractEnum, EnumDivergence } from "./contract-binding.types";

/**
 * WHAT A BOUND FLAG OR POSITIONAL OFFERS, DERIVED ONCE.
 *
 * `enumOption` and `enumArgument` need the identical three things — the offered
 * list, the canonical set a normaliser's OUTPUT must land in, and the
 * description with the divergence sentence appended — and derived them twice,
 * line for line. One copy means a change to how an omission or a widening is
 * resolved cannot reach a flag and miss a positional.
 */

/** The offered list and the canonical set, resolved from one declaration. */
export interface ResolvedOffer {
  /** What `.choices()` is given: contract values minus any omission, plus widenings. */
  readonly offered: readonly string[];
  /**
   * What a NORMALISED value must be a member of — contract values minus any
   * omission, and NOT the widenings. A widening's whole purpose is to become a
   * contract value before it goes on the wire, so accepting it here would let
   * the alias itself through unnormalised.
   */
  readonly canonical: ReadonlySet<string>;
}

export function resolveOffer(source: ContractEnum, divergence?: EnumDivergence): ResolvedOffer {
  const omitted = new Set(divergence?.omit ?? []);
  const canonical = source.contractValues.filter((value) => !omitted.has(value));
  return {
    offered: [...canonical, ...(divergence?.alsoAccepts ?? [])],
    canonical: new Set(canonical)
  };
}

/**
 * The caller's description, plus the divergence sentence when there is one.
 *
 * Commander already prints the choices list, and a second copy inside the
 * description is a second thing to go stale.
 */
export function describeOffer(description: string, divergence?: EnumDivergence): string {
  return divergence ? `${description}. ${divergence.because}` : description;
}

/**
 * The parser a `normalise` callback is wrapped in — NORMALISE FIRST, THEN
 * VALIDATE.
 *
 * The other order rejects every alias the normaliser exists to accept: `7d` is
 * not a contract value, and it is not supposed to be — it becomes one.
 * Validating the OUTPUT is also the stronger check, because it asserts the thing
 * that actually goes on the wire is an enum member, whatever the operator typed.
 *
 * 🚨 THE MESSAGE SAYS ONLY WHAT COMMANDER DOES NOT KNOW. Commander has already
 * written `option '<flags>' argument '<raw>' is invalid.` for a flag, or
 * `command-argument value 'X' is invalid for argument 'y'.` for a positional,
 * and appends this string to whichever it wrote — so repeating either half
 * prints it twice. Measured: the refusal this produces is BYTE-IDENTICAL to the
 * built-in `.choices()` one, so the normalised and un-normalised paths are
 * indistinguishable to a reader.
 */
export function normalisingParser(
  normalise: (value: string) => string,
  offer: ResolvedOffer
): (raw: string) => string {
  return (raw: string): string => {
    const value = normalise(raw);
    if (!offer.canonical.has(value)) {
      throw new InvalidArgumentError(`Allowed choices are ${offer.offered.join(", ")}.`);
    }
    return value;
  };
}
