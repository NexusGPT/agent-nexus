import { Option } from "commander";

import { rememberOption } from "./contract-binding.registry";
import type { ContractEnum } from "./contract-binding.types";

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
  rememberOption(option, { source, offered: source.contractValues });
  return option;
}
