import { renderFields } from "./render-fields";
import { VARIABLE_FIELDS } from "./variable-fields";

/** Appended to `nexus role set-variables`. */
export const VARIABLES_BODY_SHAPE = `
  THE BODY IS { "variables": [ Variable, ... ] } and a Variable is:

${renderFields(VARIABLE_FIELDS)}

  ALL FIVE KEYS ARE REQUIRED AND THREE OF THEM TAKE null. The schema is strict,
  so an omitted key is a 400 naming it and an unknown key is refused by name —
  but "required" is about the KEY, never about the value: description, unit and
  value each accept null, and null is how you say "none". Only key and label
  must be non-empty text.

  The read-first example above hides that, because a Role that already HAS
  variables hands you complete elements to edit. The FIRST variable on a Role
  that has none is composed by hand.

  A COMPLETE BODY THAT IS ACCEPTED, to copy:
    {"variables":[{"key":"wage","label":"Hourly wage","description":null,
                   "unit":"€ / h","value":23.5}]}`;
