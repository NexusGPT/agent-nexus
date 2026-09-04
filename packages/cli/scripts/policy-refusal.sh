# policy-refusal.sh — the ONE definition of "the backend declared this feature
# unavailable BY POLICY", sourced by every script that has to tell that refusal
# apart from a real failure.
#
# ══════════════════════════════════════════════════════════════════════════════
# WHY THIS IS A FILE RATHER THAN A LINE IN sweep.sh
# ══════════════════════════════════════════════════════════════════════════════
#
# Two scripts now need the same answer and they need it for opposite reasons:
#
#   sweep.sh              a refusal that is policy must not be scored as a CLI
#                         regression, so it becomes SKIP rather than FAIL.
#   seed-sweep-fixtures.sh  a leaf the environment refuses by policy cannot be
#                         seeded and must not be counted as an unsatisfied
#                         fixture — but a leaf that ANSWERS and is empty must.
#
# The second one is the reason this cannot be an emptiness check. `nexus <leaf>
# --json` exits non-zero for a policy refusal, for a 500 and for an expired key
# alike, and reading any non-zero exit as "policy" is the exact broadening
# `sweep-skips-only-a-declared-opt-out.test.ts` exists to forbid: it would let
# an outage and a dead credential subtract themselves out of the seeder's
# contract silently and permanently.
#
# A copy of the pattern in the second script would keep passing after the first
# was broadened, so the two would disagree about what "policy" means with
# nothing anywhere to notice. One definition, two readers.
#
# ══════════════════════════════════════════════════════════════════════════════
# 🚨 MATCH THE SENTENCE, NEVER THE STATUS
# ══════════════════════════════════════════════════════════════════════════════
#
# Every phrase here is a specific declaration by the backend that a feature is
# unavailable BY POLICY, and each comes straight from a current backend error
# message. Each tempting broadening is silent and permanent:
#
#   - `403 means policy`            — swallows every authorization regression.
#   - the `FEATURE_NOT_ENABLED` code — shared with refusals that ARE bugs.
#   - `exit code != 0 means policy` — a gate that can no longer fail.
#
# ✅ THE CORRECT WAY TO EXTEND THIS IS ONE SENTENCE AT A TIME, as new features
# adopt the same "feature not configured" convention. Resist the urge to broaden
# into generic 5xx matching — that would mask real outages, which is the one
# thing both callers exist to surface. `sweep-skips-only-a-declared-opt-out.test.ts`
# holds that line by asserting a plain 401 and a 500 still FAIL, and it reads
# this pattern out of this file rather than restating it, so a broadening here
# reddens it immediately.
#
# `opted out of this feature` is the OPT-OUT branch of
# `apps/backend/src/feature-flags/infrastructure/guards/feature-flag.guard.ts`:
# the org asked not to have the feature, so the 403 is the environment answering
# correctly and there is no CLI defect to find. It is a distinct sentence from
# the positive branch on purpose — the flag IS enabled, which is precisely why
# the route refuses — so it needs its own phrase here.
#
# ⚠️ THE POSITIVE BRANCH IS NOT MATCHED, AND THAT IS A DECISION RATHER THAN AN
# OVERSIGHT. The same guard also emits "This feature is not enabled for your
# organization" (2 sites), which no phrase here matches — so a leaf behind a
# feature flag the org simply lacks FAILS exactly as the four `role *` leaves
# once did. It is left unmatched because no swept leaf reaches it today, so
# adding the phrase would be untested surface on the one matcher that must never
# over-broaden. If a red brought you here: that is the case, adding the sentence
# is the fix, and `sweep-skips-only-a-declared-opt-out.test.ts` is where to prove
# it both ways before you do.
#
# ⚠️ These phrases are English sentences owned by `apps/backend`, and
# `packages/cli` is mirrored to a public repository on its own, so nothing here
# may reach across that boundary to assert them. A backend reword re-reds both
# readers silently — the coupling is documented, not enforced.

# The pattern, in ERE, matched against the CLI's `--json` error document. Kept as
# a variable rather than inlined so a reader — and the spec — has exactly one
# place to look, and so `grep -qE "$POLICY_REFUSAL_PATTERN"` is the only spelling
# either caller writes.
POLICY_REFUSAL_PATTERN='"message":[[:space:]]*"[^"]*(not configured|feature is disabled|feature not enabled|opted out of this feature)'

# is_policy_refusal <captured output>
#
# True when the backend declared the feature unavailable by policy.
#
# 🚨 THIS ANSWERS ONE QUESTION AND NOT THE OTHER. It says the REFUSAL is policy.
# It does not say anyone DECIDED TO ACCEPT the resulting coverage loss — that is
# a fact about this repository and only `SWEEP_EXPECTED_SKIPS` carries it. Both
# callers ask this first and the declaration second; collapsing the two is how
# four leaves went dark while moving one digit in a line nobody reads.
is_policy_refusal() {
  printf '%s' "$1" | grep -qE "$POLICY_REFUSAL_PATTERN"
}

# The reason sentence the backend sent, for a report a human reads. Empty when
# the document is not the shape we expect — the caller has already decided the
# refusal is policy, so a missing sentence costs a blank cell in a report and
# never a wrong verdict.
policy_refusal_reason() {
  printf '%s' "$1" \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('error',{}).get('message',''))" 2>/dev/null \
    | tr -d '\n' | cut -c1-80
}
