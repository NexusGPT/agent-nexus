/**
 * THE DISPOSITION VOCABULARY — what may be DONE with one command leaf.
 *
 * One union, declared here so the table that uses it and the report that
 * projects it both name the same vocabulary. It has no imports and no
 * dependents inside this directory other than those two, which is what keeps it
 * cheap for `scripts/id-thread-sweep.ts` and friends to reach.
 *
 * WHAT BELONGS HERE: the `CommandDisposition` union and the argument for each
 * member. A new disposition is a new member here plus the arm in `classify.ts`
 * that projects it — never a member alone, which would be a state nothing acts
 * on.
 *
 * WHAT DOES NOT: a LEAF. A path and its disposition go in
 * `command-classification.ts`; putting one here would start a second table.
 */

/**
 * How a leaf may be exercised. Three states, and the third is not a synonym for
 * the second — `agent delete` is registration-only (real, just unsafe to fire
 * blind), while `auth logout` must never be reached even by a human running the
 * sweep by hand, because it destroys the credentials the sweep is using.
 */
export type CommandDisposition =
  /** Read-only, needs no required input, emits `--json`. The sweep RUNS these. */
  | "safe"
  /**
   * Registered and real, but not auto-invocable: a mutation, or a read that
   * needs a required positional/option. The sweep asserts it still EXISTS and
   * never executes it.
   */
  | "registration-only"
  /**
   * Executed exactly like `safe`, PLUS the sweep asserts the response is not
   * empty. For a leaf whose route is real but whose organisation holds no rows
   * unless something put them there.
   *
   * 🚨 THE ASSERTION IS THE WHOLE DISPOSITION, and without it this value would
   * be a synonym for `safe` that documents an intention nobody checks. An empty
   * read exercises auth, routing, tenancy scoping and the response envelope
   * while asserting NOTHING about item shape — so a fixture row that someone
   * later deletes turns real coverage back into a green row nobody re-examines,
   * with no event anywhere. That is strictly worse than the honest gap it
   * replaced, because the gap was visible.
   *
   * So: a `safe-with-fixture` leaf that comes back empty is a FAIL, and the
   * remedy is `scripts/seed-sweep-fixtures.sh`, never a demotion to `safe`.
   */
  | "safe-with-fixture"
  /**
   * Never execute, not even by hand during a sweep. Self-modifying, interactive,
   * credential-destroying, or an unbounded arbitrary surface.
   */
  | "never-execute";
