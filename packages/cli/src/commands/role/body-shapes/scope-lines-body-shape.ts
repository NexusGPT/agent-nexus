import { renderFields } from "./render-fields";
import { SCOPE_LINE_FIELDS } from "./scope-line-fields";

/** Appended to `nexus role set-scope-lines`. */
export const SCOPE_LINES_BODY_SHAPE = `
  THE BODY IS { "lines": [ Line, ... ] } and a Line is:

${renderFields(SCOPE_LINE_FIELDS)}

  THOSE THREE KEYS AND NO OTHERS. The schema is strict, so a line carrying a
  "note" is refused by name — "scope" is the text field, and it is required
  rather than optional.

  A COMPLETE BODY THAT IS ACCEPTED, to copy:
    {"lines":[{"jobTypeId":"<uuid>","quantity":6,
               "scope":"France, Monday to Friday"}]}`;
