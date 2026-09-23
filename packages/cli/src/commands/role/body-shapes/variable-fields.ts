import type { RoleVariableInput } from "@agent-nexus/sdk";

import { CONTINUATION } from "./key-column";

/**
 * The whole of one Role variable.
 *
 * 🚨 REQUIRED AND NULLABLE ARE NOT THE SAME PROPERTY, and this block exists
 * because the prose that stood here collapsed them: it said `label`,
 * `description` and `unit` were "required strings", when `RoleVariableInput`
 * types two of the three `string | null`. Omitting the KEY is a 400; sending
 * `null` for the VALUE is how a caller says "none". A reader who believed the
 * sentence had to invent a description for every variable that has none.
 */
export const VARIABLE_FIELDS: Record<keyof RoleVariableInput, string> = {
  key: `string   what a part's source.variable matches: "wage".\n${CONTINUATION}Lower-case start, then word characters`,
  label: 'string   what the Assumptions tab calls it: "Hourly wage"',
  description: "string|null   the author's own sentence. null for none",
  unit: `string|null   how it reads: "€ / h", "%". A LABEL, and\n${CONTINUATION}nothing parses it. null for none`,
  value: "number|null   null is UNSET and is NEVER 0 — see below"
};
