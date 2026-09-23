/**
 * Appended to `nexus role --help`.
 *
 * ⚠️ AN ENUMERATION OF VERBS IS READ AS AN ENUMERATION OF THE PLATFORM, and a
 * CEO audit of this namespace concluded the product could not do these things.
 * It can; they are served only to a logged-in dashboard session. Naming the gap
 * is what stops the next reader making the same inference — an absent verb and
 * an absent capability are indistinguishable from inside `--help`.
 *
 * Every line below is a route that exists on the internal API today. Do not add
 * a line for something that is genuinely absent from the product; the value of
 * this block is that everything in it is reachable somewhere.
 */
export const ROLE_NAMESPACE_GAPS = `
WHAT THIS NAMESPACE DOES NOT COVER, AND WHY THAT IS NOT THE PLATFORM'S LIMIT.
These have NO verb here at any version, and they are not missing features —
they exist in the product and are served only to a logged-in dashboard session:

  • the system map             every system the organization runs, and the
                               edges between them
  • a Role's workload          the person-hours coverage divides by
  • a system's impact model    the person-hours one system gives back
  • task graduation            turning a task into a system

The workload and the impact model are the two writes that move the coverage
figure, and their absence from the public API is a decision with a reason —
"nexus role coverage --help" carries it. Author all four on the Role's own
screens in the dashboard.`;

/**
 * The SUBJECT of every bullet in {@link ROLE_NAMESPACE_GAPS}, paired with the
 * word a verb would have to carry for that bullet to have become false.
 *
 * 🚨 A BLOCK THAT ASSERTS NON-EXISTENCE ROTS WITHOUT ANYONE EDITING IT. Shipping
 * a verb falsifies a line here from somewhere else entirely, and `--help` still
 * renders — correct-looking and wrong. It has already happened once: the six
 * board verbs shipped ten hours after this block was written, 80 lines away in
 * this same file, and `boards and card placement` then sat here as a false
 * absence. The AREAS block survived that same commit only because
 * `role-namespace-index.test.ts` reads the live tree and reds by name; nothing
 * asked the same question of this block.
 *
 * `role-body-shapes.test.ts` now does, reddening when any live verb carries one
 * of these tokens as a `-`-separated segment.
 *
 * ⚠️ THE TOKEN IS THE BULLET'S HEAD NOUN, NEVER EVERY WORD IN IT. Matching every
 * word reds against verbs that have nothing to do with the claim: "the system
 * map" and "a system's impact model" both contain `system`, which the live
 * `systems` verb matches, and "task graduation" contains `task`, which `tasks`
 * matches. That is three false reds on entries that are true — and a spec that
 * reds wrongly gets edited until it stops, which is precisely how the assertion
 * this replaces was left powerless.
 */
export const ROLE_NAMESPACE_GAP_SUBJECTS = [
  { bullet: "the system map", token: "map" },
  { bullet: "a Role's workload", token: "workload" },
  { bullet: "a system's impact model", token: "impact" },
  { bullet: "task graduation", token: "graduation" }
] as const;
