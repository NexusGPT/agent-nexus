/**
 * Shared by `create` and `update`, which declare the same two body-only
 * divergences to `bindCommand`.
 *
 * Both enums sit inside `variables[]`, an ARRAY OF OBJECTS that reaches the
 * request only through --data — there is no flag that could carry one element's
 * `type`, let alone one element's `constraint.format`, so these are body-only by
 * construction rather than by omission. Declaring them is what lets the gate
 * tell that apart from a field somebody forgot to expose.
 *
 * One copy, because the two verbs must declare the SAME reason: two drifting
 * strings would read as two different arguments for one fact.
 */

export const VARIABLES_ARE_JSON_ONLY =
  "variables is an array of objects inside --data; a flag cannot address one element";
