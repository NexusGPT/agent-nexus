/**
 * THE DECLARED SKIPS — which leaves one environment is allowed to refuse.
 *
 * DATA, like its sibling table, and deliberately a SEPARATE file from it: a
 * disposition says what may be DONE with a leaf, and this says what an
 * environment currently ANSWERS. They are read by the same gate and they go
 * stale for completely different reasons, so one file each.
 *
 * WHAT BELONGS HERE: one `"<path>": "<cause>"` line per accepted skip, where
 * the value is the CAUSE a human needs in order to decide whether the skip is
 * still right. It is printed in the report.
 *
 * WHAT DOES NOT: a disposition, ever — the docblock below states why promoting
 * a skip to `registration-only` silently ends the coverage it was meant to
 * park.
 */

/**
 * THE SKIPS THE SWEEP IS ALLOWED TO REPORT. Declared, never inferred.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A SKIP AND A PASS ARE ONE SUMMARY LINE APART AND MEAN OPPOSITE THINGS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `sweep.sh` SKIPs a leaf when the backend declares the feature unavailable by
 * policy — a 403 the environment is right to send, with no CLI defect to find.
 * Accepting that is correct. What was missing is that nothing anywhere could
 * tell an EXPECTED skip from a NEW one: the run reported `64 pass · 5 skip · 0
 * fail`, the exit code ignores SKIP by design, and the count moved silently
 * whenever another leaf went dark. Four leaves lost their live coverage that way
 * and the only reason anyone noticed is that they went RED first — a leaf that
 * had always skipped, or that started skipping quietly, produced no signal at
 * any point.
 *
 * So the population is declared here and `sweep.sh` reads it:
 *
 *   - a skip NAMED here is accepted, and the report says the coverage is gone;
 *   - a skip NOT named here is a FAIL, because a leaf going dark is an event
 *     somebody has to see, and one line here is the whole cost of seeing it;
 *   - a leaf named here that did NOT skip is reported STALE and fails nothing.
 *     The environment recovering is good news, and a gate that reddens on good
 *     news gets its declarations deleted rather than its news read.
 *
 * ⚠️ THIS IS NOT A DISPOSITION AND MUST NEVER BECOME ONE. A disposition says what
 * may be DONE with a leaf; this says what one ENVIRONMENT currently answers. The
 * leaf stays `safe` on purpose: it is still executed on every run, so the day the
 * organisation is opted back in, coverage resumes with nobody remembering to flip
 * anything. Parking these as `registration-only` would stop the sweep watching
 * them and would need a human to notice the recovery — which is the silent half
 * the disposition docs already warn about.
 *
 * The value is the CAUSE, not a note about intent. It is printed in the report,
 * so write the sentence a reader needs to decide whether the skip is still right.
 */
export const SWEEP_EXPECTED_SKIPS: Readonly<Record<string, string>> = {
  // `roleless_legacy` reads BACKWARDS: enabled = true means the organization has
  // OPTED OUT of the Role primitive. Migration
  // `20260830150000_roleless_legacy_default_opt_out` set the GLOBAL default to
  // true, so every organization without an explicit `enabled = false` row is
  // opted out — the sweep's own organization included. These four answer 403
  // "This organization has opted out of this feature", which is the product
  // working correctly.
  //
  // Restoring live coverage needs an explicit opt-IN row for a swept
  // organization. That is a feature-flag write on a live environment and it is
  // not this file's to make.
  "role automation-settings": "roleless_legacy: the swept org has opted out of the Role primitive",
  "role governance": "roleless_legacy: the swept org has opted out of the Role primitive",
  "role job-types": "roleless_legacy: the swept org has opted out of the Role primitive",
  "role list": "roleless_legacy: the swept org has opted out of the Role primitive",
  // Linear credentials are a production-only configuration; staging answers
  // "not configured" by design. This one predates the mechanism above and is
  // the reason the phrase allowlist exists at all.
  "ticket list": "LINEAR_API_KEY / LINEAR_TEAM_ID are set on prod only"
};
