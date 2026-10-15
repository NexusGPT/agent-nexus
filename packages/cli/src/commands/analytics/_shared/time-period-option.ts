import type { Option } from "commander";

import { type ContractEnum, enumOption } from "../../../contract-binding";
import {
  parseTimePeriod,
  timePeriodHelpFor,
  timePeriodShorthandsFor
} from "../../../util/time-period";

/**
 * `--time-period`, bound to whichever descriptor's copy of the enum applies.
 *
 * The CLI accepts MORE than the contract here and always has: `30d` and friends
 * were the documented spelling in older help text, and NEX-2367 kept them
 * working rather than 400ing a command somebody had in a script. That is a
 * declared WIDENING — the shorthands are offered as choices and normalised to
 * the canonical value before the request leaves, so the flag is still validated
 * locally and the server still only ever sees an enum member.
 *
 * 🔴 **The widening is computed FROM the descriptor, never taken whole.** The
 * three dashboard-backed commands and `metrics` bind different enums: the
 * dashboard-backed routes cannot serve `all_time` or `last_24_hours` and their
 * contract no longer offers either, while the structured-query route serves
 * both. Offering the full shorthand list here would advertise `all` and `24h`
 * on a flag whose own parser refuses them — normalise-then-validate checks the
 * OUTPUT, so the alias resolves to a value the descriptor does not carry and
 * dies one line later.
 */
export function timePeriodOption(source: ContractEnum): Option {
  const shorthands = timePeriodShorthandsFor(source.contractValues);
  return enumOption(
    "--time-period <period>",
    timePeriodHelpFor(source.contractValues),
    source,
    {
      alsoAccepts: shorthands,
      because: "shorthands are normalised to the canonical value before sending"
    },
    parseTimePeriod
  );
}
