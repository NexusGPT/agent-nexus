import { JOB_TYPE_BODY_FIELDS, JOB_TYPE_PART_FIELDS } from "./job-type-fields";
import { renderFields } from "./render-fields";

/**
 * Appended to `nexus role create-job-type` and `update-job-type`.
 *
 * The worked example is not decoration: the reporter who found this could not
 * compose a legal body from the Notes, and the fallback the Notes offered —
 * "read an existing one" — is unavailable in an organization whose library is
 * empty, which is every new organization.
 */
export const JOB_TYPE_BODY_SHAPE = `
  THE WHOLE BODY, AND EVERY KEY IS REQUIRED — the nullable ones included. Send
  null, never omit and never 0. The schema is strict, so an unknown key is
  refused by name.

${renderFields(JOB_TYPE_BODY_FIELDS)}

  A Part is:

${renderFields(JOB_TYPE_PART_FIELDS)}

  A PART'S SOURCE IS A TAGGED UNION, AND THE TAG IS THE WHOLE FIELD. Exactly two
  kinds, and no third:
    {"kind": "variable", "variable": "<part key>"}   resolved against the ROLE's
      own variables at evaluation time — which is why one org-wide job type
      prices differently in each Role
    {"kind": "fixed", "value": <number>}             a literal this type owns
  There is no "constant", no "literal" and no "variableRef" — the last is a
  database comment describing a design that never shipped.

  A COMPLETE BODY THAT IS ACCEPTED, to copy:
    {"name":"Support agent","basis":"SALARY","group":"PEOPLE",
     "category":"PEOPLE","quantityUnit":"FTE","note":"","fte":null,
     "costExpression":null,"hoursExpression":"","revenueExpression":"",
     "parts":[{"key":"salary","label":"Salary","unit":"EUR a year",
               "source":{"kind":"fixed","value":50000}}]}`;
