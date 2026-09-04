#!/usr/bin/env bash
# seed-sweep-fixtures.sh — put one row behind every `safe-with-fixture` leaf.
#
# ══════════════════════════════════════════════════════════════════════════════
# WHY THIS EXISTS
# ══════════════════════════════════════════════════════════════════════════════
#
# `sweep.sh` runs each `safe` leaf and asserts exit 0 plus parseable JSON. Six
# leaves passed that bar while returning an EMPTY collection, which exercises
# auth, routing, tenancy scoping and the response envelope and asserts NOTHING
# about item shape. `safe-with-fixture` turns an empty read into a FAIL; this
# script is what makes those leaves pass honestly.
#
# 🚨 IT IS NOT RUN BY THE SWEEP'S OWN GATE, AND THAT IS DELIBERATE RATHER THAN
# UNFINISHED. `cli-sweep` authenticates with NEXUS_STAGING_API_KEY, which is
# READ-ONLY precisely so the gate cannot mutate the environment it is measuring.
# Seeding is a write, so the repair can never live inside the job that measures
# the thing being repaired.
#
# ⚠️ IT IS RUN BY CI, IN A DIFFERENT JOB, AND KNOWING WHICH ONE IS THE WHOLE
# POINT OF THIS PARAGRAPH. `cli-e2e.yml`'s `CLI: E2E flows` runs it as step
# "Reseed sweep fixtures if empty — maintenance, never on a PR", on
# schedule/push/workflow_run/workflow_dispatch, with that job's write-scoped
# NEXUS_E2E_API_KEY. So a non-zero exit here REDS A CI JOB. It is not a script
# whose failures only a human standing in front of it will see, and a refusal
# nobody can act on therefore reds that job forever — which is exactly what
# happened, and what the declared-policy-skip subtraction below exists to stop.
# Run it BY HAND too, with a write-scoped key, when the sweep reports
# FIXTURE MISSING and you do not want to wait for the schedule.
#
# ══════════════════════════════════════════════════════════════════════════════
# IDEMPOTENT, AND WHAT THAT COSTS
# ══════════════════════════════════════════════════════════════════════════════
#
# Every step LISTS first and creates only when the list is empty. So a second
# run is a no-op, and a run against a half-seeded org fills only the holes.
# A seed that fails the second time is a seed nobody runs.
#
# It does NOT delete and recreate, and it does not reconcile: a row somebody
# else created that satisfies the leaf is left alone. The assertion is "this
# leaf returns rows", never "this leaf returns MY rows".
#
# ══════════════════════════════════════════════════════════════════════════════
# WHAT IT REFUSES TO SEED, AND WHY EACH ONE IS A REFUSAL RATHER THAN A GAP
# ══════════════════════════════════════════════════════════════════════════════
#
#   role creation-requests / role deletion-requests
#       Seeding these leaves PENDING APPROVALS in a shared organisation for a
#       human to action. A fixture must not create work for a person.
#
#   channel whatsapp-template approvals
#       Needs a template submitted to Meta and awaiting review. A fixture must
#       not reach a third party.
#
#   apps approvals pending
#       Needs a gated deployment, which provisions infrastructure that costs
#       money and outlives the command.
#
#   emulator scenario list
#       A scenario cannot be saved from an EMPTY session — the API refuses with
#       `Cannot save scenario from empty session`. Filling one means `emulator
#       send`, which runs the agent, which spends model inference on every sweep
#       the fixture ever has to be rebuilt for. Same class as the gated
#       deployment above, and it is only visible by TRYING: nothing in the
#       create verb's help says a session must have messages in it.
#
#   workspace status
#       Reads the LOCAL machine's recorded mounts, never the server. On a CI
#       runner it is empty by construction and no seed anywhere can change
#       that. It stays `registration-only` permanently — this is not a to-do.
#
# ══════════════════════════════════════════════════════════════════════════════
# AND ONE CATEGORY THAT IS NOT A LIST HERE, BECAUSE IT IS AN ENVIRONMENT FACT
# ══════════════════════════════════════════════════════════════════════════════
#
# A leaf can be `safe-with-fixture` and still be unseedable by ANYONE, because
# the environment refuses it by policy — a feature the organization has opted out
# of, a feature configured only on production. `SWEEP_EXPECTED_SKIPS` in
# `src/command-universe.ts` is where this repository declares that it has
# accepted losing that coverage, and `sweep.sh` already reads it. This script
# reads the SAME producer (`--print-expected-skips`), and subtracts such a leaf
# from its own contract.
#
# 🚨 THE SUBTRACTION IS CONDITIONAL ON THE REFUSAL BEING LIVE, AND THE
# UNCONDITIONAL VERSION IS THE SAME BUG ONE LEVEL UP. A declaration that stops
# firing — because the organization was opted back IN — is invisible to every
# static check: `staleExpectedSkips` catches a declaration that was renamed,
# deleted or reclassified, and nothing catches one that simply stopped applying.
# So an unconditional subtraction would silently stop asserting a leaf that had
# become assertable again, which is precisely the dark-coverage failure the
# declaration mechanism was built to make visible. A leaf that ANSWERS and is
# empty is therefore reported as BOTH an unsatisfied fixture and a stale
# declaration, and only a leaf still returning the refusal is subtracted.
#
# Usage:
#   NEXUS_PROFILE=<write-scoped profile> bash scripts/seed-sweep-fixtures.sh
#   NEXUS_BIN="node packages/cli/dist/index.js" ... (same override sweep.sh uses)

set -uo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)

# The policy-refusal matcher, shared with `sweep.sh`. Sourced rather than copied
# because the two scripts must agree to the character about what "the backend
# declared this unavailable by policy" means; a copy here would keep agreeing
# with itself after the original was broadened.
#
# GUARDED, because `set -e` is deliberately not on. A missing file would leave
# `is_policy_refusal` undefined, every call would fail, and every policy refusal
# would fall through to the UNSATISFIED arm below — the script would keep
# reporting the permanently-unseedable leaf as a fixture somebody has to fix.
# shellcheck source=./policy-refusal.sh
if ! . "$SCRIPT_DIR/policy-refusal.sh"; then
  echo "FATAL: could not source $SCRIPT_DIR/policy-refusal.sh" >&2
  echo "Refusing to seed without it — a leaf the environment refuses by policy" >&2
  echo "would be reported as an unsatisfied fixture, which is not actionable." >&2
  exit 8
fi

read -ra NEXUS_CMD <<< "${NEXUS_BIN:-nexus}"
NEXUS_ARGS=()
[[ -n "${NEXUS_PROFILE:-}" ]] && NEXUS_ARGS+=(--profile "$NEXUS_PROFILE")

nx() {
  "${NEXUS_CMD[@]}" ${NEXUS_ARGS[@]+"${NEXUS_ARGS[@]}"} "$@"
}

SEEDED=0
PRESENT=0
FAILED=0
SKIPPED=0
STALE_DECLARATIONS=()

# ─────────────────────────────────────────────────────────────────────────────
# THE DECLARED SKIPS — DERIVED FROM THE SAME PRODUCER `sweep.sh` READS
# ─────────────────────────────────────────────────────────────────────────────
#
# 🚨 THIS IS THE DEFECT THIS BLOCK CLOSES. `SWEEP_EXPECTED_SKIPS` names the
# leaves whose coverage this repository has ACCEPTED losing to environment
# policy, and `sweep.sh` reads it so a declared skip is not a red. Nothing told
# the SEEDER. So a leaf the sweep already accepts as dark-by-policy still landed
# in `--print-fixture-leaves`, got POSTed, was refused 403 by the very policy the
# declaration describes, and exited non-zero — forever, by construction. Two
# consumers derived from one table and only one accounted for policy skips.
#
# Same producer as `sweep.sh`, deliberately: a second list here would be a second
# thing to get out of step, which is the whole shape of the bug being fixed.
#
# Emptiness is legitimate — an environment answering every leaf declares nothing
# — so it is not treated as a refusal. A non-zero EXIT is, and for the direction
# that matters: a derivation that failed would leave every declared skip
# undeclared, and this script would go back to failing on exactly the leaf it
# cannot ever seed. Both streams are printed, for the reason the fixture
# derivation below already records.
SKIPS_STDERR=$(mktemp)
EXPECTED_SKIPS_RAW=$(cd -- "$SCRIPT_DIR/.." && pnpm exec tsx scripts/command-universe.ts --print-expected-skips 2>"$SKIPS_STDERR")
SKIPS_EXIT=$?
if [[ $SKIPS_EXIT -ne 0 ]]; then
  {
    echo "  FATAL: could not derive the expected-skip set; refusing to report anything."
    echo "    command : pnpm exec tsx scripts/command-universe.ts --print-expected-skips"
    echo "    exit    : $SKIPS_EXIT"
    echo "    --- its stdout ---"
    printf '%s\n' "$EXPECTED_SKIPS_RAW"
    echo "    --- its stderr ---"
    cat "$SKIPS_STDERR"
  } >&2
  rm -f "$SKIPS_STDERR"
  exit 9
fi
rm -f "$SKIPS_STDERR"

is_expected_skip() {
  local needle="$1" line
  while IFS= read -r line; do
    [[ "$line" == "$needle" ]] && return 0
  done <<< "$EXPECTED_SKIPS_RAW"
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# ONE READ, FOUR ANSWERS — and the fourth is the one that used to be missing
# ─────────────────────────────────────────────────────────────────────────────
#
# `already_has_rows` collapsed everything that is not "rows" into one `false`.
# That is enough to decide whether to CREATE, and not enough to decide whether a
# leaf that cannot be created is a problem:
#
#   rows    the leaf returned a non-empty collection.
#   empty   it ANSWERED, exit 0, and returned nothing. Seedable, or unsatisfied.
#   policy  the backend declared the feature unavailable BY POLICY. Nothing this
#           script can write changes that, so a DECLARED one is subtracted.
#   error   any other non-zero — a 500, an expired key, an unknown subcommand.
#
# 🚨 `empty` AND `error` MUST NOT MERGE, AND THAT IS WHY THIS IS FOUR STATES AND
# NOT TWO. A 500 on a declared leaf is not evidence the organization opted back
# in; reporting it as a stale declaration would send a reader to delete a line
# that is still true, and the next run would re-red with no declaration left to
# excuse it. Only `empty` — the leaf ANSWERING and holding nothing — says the
# refusal has lifted.
LEAF_STATE=""
LEAF_REASON=""

classify_leaf() {
  local leaf="$1" out code
  LEAF_STATE=""
  LEAF_REASON=""
  # shellcheck disable=SC2086
  out=$(nx $leaf --json 2>&1)
  code=$?

  if [[ $code -ne 0 ]]; then
    if is_policy_refusal "$out"; then
      LEAF_STATE="policy"
      LEAF_REASON=$(policy_refusal_reason "$out")
    else
      LEAF_STATE="error"
      LEAF_REASON=$(printf '%s' "$out" | tr '\n' ' ' | cut -c1-90)
    fi
    return
  fi

  # Emptiness is asked with the SAME instrument the sweep uses, so "seeded" and
  # "the sweep is satisfied" cannot drift apart. A second emptiness rule here is
  # a second thing to get wrong.
  if printf '%s' "$out" | python3 "$SCRIPT_DIR/scan-response.py" --require-non-empty >/dev/null 2>&1; then
    LEAF_STATE="rows"
  else
    LEAF_STATE="empty"
  fi
}

# Is this leaf's response already non-empty? A projection of `classify_leaf`,
# never a second read of the API: two probes over one leaf is how the create
# path and the verification path start disagreeing about the same row.
already_has_rows() {
  classify_leaf "$1"
  [[ "$LEAF_STATE" == "rows" ]]
}

# ensure <leaf> <human label> <create command...>
ensure() {
  local leaf="$1" label="$2"
  shift 2

  classify_leaf "$leaf"

  if [[ "$LEAF_STATE" == "rows" ]]; then
    printf '  ok      %-26s already has rows\n' "$label"
    PRESENT=$((PRESENT + 1))
    return
  fi

  # A leaf the environment refuses BY POLICY cannot be seeded by anybody. POSTing
  # into it produces a 403 that is the product working correctly, and counting
  # that as a failed seed reds this script permanently with no action available
  # to whoever reads the red. Subtract it — but only when somebody DECLARED the
  # coverage loss, because the phrase says the refusal is policy and says nothing
  # about anyone having accepted it. An undeclared one keeps failing, exactly as
  # `sweep.sh` fails an undeclared skip, and for the same reason: a leaf going
  # dark is an event somebody has to see.
  #
  # It PRINTS and does not COUNT, exactly as the verification loop prints `ok`
  # without touching PRESENT. The loop below is total over the derived set and is
  # the authority on `$SKIPPED`; counting here as well would double every leaf
  # that has both an `ensure` call and a derivation, which is all of them.
  if [[ "$LEAF_STATE" == "policy" ]]; then
    if is_expected_skip "$leaf"; then
      printf '  skipped %-26s %s — DECLARED policy refusal, unseedable by anyone\n' "$label" "$LEAF_REASON"
    else
      printf '  FAILED  %-26s UNDECLARED policy refusal: %s — add this leaf to SWEEP_EXPECTED_SKIPS in src/command-universe.ts with the CAUSE, or restore the environment\n' \
        "$label" "$LEAF_REASON"
      FAILED=$((FAILED + 1))
    fi
    return
  fi

  local out
  if out=$("$@" 2>&1); then
    if already_has_rows "$leaf"; then
      printf '  seeded  %-26s created\n' "$label"
      SEEDED=$((SEEDED + 1))
    else
      # The create returned 0 and the leaf is STILL empty. That is not a seed
      # that half worked; it is a create that went somewhere the read cannot
      # see — a different org, a different scope, a soft-deleted row. Reporting
      # it as seeded is the failure this whole disposition exists to prevent.
      printf '  FAILED  %-26s create exited 0 but the leaf is still empty\n' "$label"
      FAILED=$((FAILED + 1))
    fi
  else
    printf '  FAILED  %-26s %s\n' "$label" "$(printf '%s' "$out" | tr '\n' ' ' | cut -c1-90)"
    FAILED=$((FAILED + 1))
  fi
}

echo "seeding sweep fixtures · profile=${NEXUS_PROFILE:-default}"
echo ""

# ── the two that need nothing but a name ────────────────────────────────────
ensure "user-group list" "user-group" \
  nx user-group create --name "sweep-fixture"

ensure "template folder list" "template folder" \
  nx template folder create --name "sweep-fixture"

# ── a file on disk, and nothing else ────────────────────────────────────────
# The API refuses by EXTENSION before it looks at anything else, and `.txt` is
# refused. A 1x1 PNG, written from a base64 literal so the seed needs no fixture
# file checked into the repo and no network to fetch one.
FIXTURE_FILE=$(mktemp -d)/sweep-fixture.png
printf '%s' \
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' \
  | base64 -d > "$FIXTURE_FILE"
ensure "asset list" "asset" \
  nx asset upload "$FIXTURE_FILE"
rm -f "$FIXTURE_FILE"

# ── a nested body, so it goes in as JSON ────────────────────────────────────
# Eleven required fields, from `--print-contract`. The flag-level help lists
# four, which is how this took two failed runs to get right: `--help` describes
# the FLAGS, and the body has fields no flag covers.
ensure "role job-types" "role job-type" \
  nx role create-job-type --body '{"name":"sweep-fixture","basis":"HOURLY","group":"PLATFORM","category":"sweep-fixture","quantityUnit":"hour","note":"sweep fixture","fte":1,"parts":[{"key":"base","label":"Base","unit":"hour","source":{"kind":"fixed","value":1}}],"costExpression":"0","hoursExpression":"0","revenueExpression":"0"}'

# ── the two that need an existing deployment ────────────────────────────────
# Resolved rather than hardcoded: a deployment id pinned in this file is a
# fixture that rots the first time somebody deletes that deployment, and it
# would fail here as "create refused" with nothing saying why.
DEPLOYMENT_ID=$(nx deployment list --type EMBED --limit 1 --json 2>/dev/null \
  | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
rows=d.get('data') if isinstance(d,dict) else d
for row in rows or []:
    print(row.get('id','')); break
" 2>/dev/null)

# THE ORDER HERE IS THE WHOLE POINT: PRESENCE FIRST, REACHABILITY SECOND.
# This branch used to SKIP the moment no EMBED deployment was found, without
# asking whether the leaf already had rows. Two false greens came out of that:
#
#   1. An org that already HAS templates got a SKIP and a create-a-deployment
#      warning it did not need, and `PRESENT` never counted the leaf.
#   2. When the leaf was genuinely empty, the script still exited 0 — the seed
#      reported SUCCESS while a `safe-with-fixture` leaf stayed unsatisfied, and
#      the sweep's `FIXTURE MISSING` remedy pointed back at a seed that had
#      already said it was fine.
#
# A fixture-backed leaf that is unsatisfied AND unseedable is a FAILURE of this
# script's contract, never a skip. It counts into FAILED and the exit code
# carries it, because the caller's next move is to fix the precondition rather
# than to re-run.
if already_has_rows "html-template list"; then
  printf '  ok      %-26s already has rows\n' "html-template"
  PRESENT=$((PRESENT + 1))
elif [[ -z "$DEPLOYMENT_ID" ]]; then
  printf '  BLOCKED %-26s empty, and no EMBED deployment to attach one to\n' "html-template"
  echo ""
  echo "  Create an EMBED deployment, then re-run — this script is idempotent, so"
  echo "  the rows already seeded above are left alone. Until then the sweep keeps"
  echo "  reporting FIXTURE MISSING for html-template list, correctly."
  FAILED=$((FAILED + 1))
else
  ensure "html-template list" "html-template" \
    nx html-template create \
      --name "sweep-fixture" \
      --html "<p>sweep fixture</p>" \
      --deployment-id "$DEPLOYMENT_ID"

fi

# ─────────────────────────────────────────────────────────────────────────────
# THE CONTRACT, CHECKED AGAINST THE DERIVED SET RATHER THAN AGAINST MY OWN LIST
# ─────────────────────────────────────────────────────────────────────────────
#
# 🚨 EVERYTHING ABOVE IS A HARDCODED LIST OF `ensure` CALLS, AND A HARDCODED
# LIST IS THE DEFECT THIS WHOLE DISPOSITION EXISTS TO DELETE. Two ways it goes
# wrong, and both leave this script exiting 0 while the sweep keeps failing:
#
#   1. A leaf is added to COMMAND_CLASSIFICATION as `safe-with-fixture` and
#      nobody adds an `ensure` here. Nothing above knows the leaf exists.
#   2. An `ensure` is deleted or renamed during a refactor. Same silence.
#
# In both, the sweep reports FIXTURE MISSING and points the reader at a remedy
# that has already told them everything is fine — the exact dead end this file's
# header describes, arriving by a different door.
#
# So the EXIT CODE is decided here, by asking the same derivation `sweep.sh`
# asks, and checking every leaf it names. The `ensure` calls above are how rows
# get created; THIS is the contract.
echo ""
echo "verifying every derived safe-with-fixture leaf..."

# BOTH STREAMS ARE KEPT, AND THAT IS A LESSON `sweep.sh` ALREADY PAID FOR.
# Its own header records it: `pnpm exec` reports an unresolvable tool on STDOUT,
# which `$(...)` captures into the variable — so a refusal that prints neither
# stream discards the only sentence naming the cause, and every failure reads
# identically to every other. Nine consecutive red runs there looked the same.
# Writing `2>/dev/null` here rebuilt that dead end inside the check that exists
# to prevent one.
FIXTURE_STDERR=$(mktemp)
FIXTURE_LEAVES=$(cd -- "$SCRIPT_DIR/.." && pnpm exec tsx scripts/command-universe.ts --print-fixture-leaves 2>"$FIXTURE_STDERR")
DERIVE_EXIT=$?

if [[ $DERIVE_EXIT -ne 0 ]]; then
  # An empty list read as "nothing to check" would make this whole section
  # vacuous and the script would exit 0 having verified nothing.
  {
    echo "  FATAL: could not derive the safe-with-fixture set; refusing to report success."
    echo "    command : pnpm exec tsx scripts/command-universe.ts --print-fixture-leaves"
    echo "    exit    : $DERIVE_EXIT"
    echo "    --- its stdout ---"
    printf '%s\n' "$FIXTURE_LEAVES"
    echo "    --- its stderr ---"
    cat "$FIXTURE_STDERR"
  } >&2
  rm -f "$FIXTURE_STDERR"
  exit 7
fi
rm -f "$FIXTURE_STDERR"

UNSATISFIED=0
while IFS= read -r leaf; do
  [[ -z "$leaf" ]] && continue
  # `already_has_rows` runs `classify_leaf`, so `$LEAF_STATE` and `$LEAF_REASON`
  # describe THIS leaf for the rest of the iteration. Deliberate and documented:
  # the alternative is a second API call per leaf, and two probes over one leaf
  # is how the two arms start disagreeing about the same row.
  if already_has_rows "$leaf"; then
    printf '  ok      %s\n' "$leaf"
    continue
  fi

  # ── THE CONDITIONAL SUBTRACTION, AND WHY IT IS CONDITIONAL ────────────────
  #
  # 🚨 AN UNCONDITIONAL SUBTRACTION CLOSES TODAY'S RED AND OPENS TOMORROW'S
  # SILENT HOLE — the same defect this script is being fixed for, one level up.
  # `staleExpectedSkips` in `src/command-universe.ts` catches a declaration that
  # was renamed, deleted or reclassified. It cannot catch one that stops FIRING,
  # because the environment answering again is invisible to any static check.
  # So "the declaration exists" is not sufficient grounds to subtract; the leaf
  # has to still be REFUSED.
  #
  #   declared + still refused  → subtract. Nothing can seed it. Not a failure.
  #   declared + ANSWERS, empty → the refusal has lifted. That is a real
  #                               unsatisfied fixture AND a stale declaration,
  #                               and this must name BOTH: fixing only the
  #                               fixture leaves the declaration standing, ready
  #                               to excuse the next leaf that goes dark.
  #   declared + errors         → NOT a stale declaration. A 500 or a dead key
  #                               says nothing about the feature flag, and
  #                               reporting it as stale sends a reader to delete
  #                               a line that is still true.
  if [[ "$LEAF_STATE" == "policy" ]] && is_expected_skip "$leaf"; then
    printf '  skipped %s — %s (DECLARED in SWEEP_EXPECTED_SKIPS; no write can satisfy it)\n' \
      "$leaf" "$LEAF_REASON"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [[ "$LEAF_STATE" == "empty" ]] && is_expected_skip "$leaf"; then
    printf '  UNSATISFIED  %s — declared safe-with-fixture and still returns no rows\n' "$leaf"
    printf '  STALE        %s — SWEEP_EXPECTED_SKIPS still excuses this leaf, and it ANSWERED. The policy refusal has lifted, so the declaration is now excusing nothing and will silently excuse the next leaf that goes dark.\n' \
      "$leaf"
    UNSATISFIED=$((UNSATISFIED + 1))
    STALE_DECLARATIONS+=("$leaf")
    continue
  fi

  printf '  UNSATISFIED  %s — declared safe-with-fixture and still returns no rows\n' "$leaf"
  UNSATISFIED=$((UNSATISFIED + 1))
done <<< "$FIXTURE_LEAVES"

if [[ $UNSATISFIED -gt 0 ]]; then
  echo ""
  echo "  $UNSATISFIED leaf/leaves are declared safe-with-fixture and have no rows."
  echo "  If one of them has no 'ensure' call above, that is the bug — add it."
fi

if [[ ${#STALE_DECLARATIONS[@]} -gt 0 ]]; then
  echo ""
  echo "  ${#STALE_DECLARATIONS[@]} STALE declaration(s) — these leaves ANSWER again and"
  echo "  SWEEP_EXPECTED_SKIPS still excuses them:"
  for stale in "${STALE_DECLARATIONS[@]}"; do
    echo "    · $stale"
  done
  echo ""
  echo "  Seed the row AND delete the line from SWEEP_EXPECTED_SKIPS in"
  echo "  src/command-universe.ts. Doing only the first leaves a declaration"
  echo "  standing over a leaf that no longer needs it, which is exactly the"
  echo "  blanket amnesty the declaration mechanism exists to prevent."
fi

echo ""
# Non-zero whenever a fixture-backed leaf is left unsatisfied, counted from the
# DERIVED set. A seed that exits 0 over an unsatisfied leaf is the false green
# this disposition exists to delete, reintroduced inside its own remedy.
#
# `$SKIPPED` is a numerator with its own denominator standing beside it: every
# skip counted here is one this repository DECLARED, so the line separates the
# coverage nobody can restore from the coverage somebody has to. A subtraction
# that printed nothing would be indistinguishable from a leaf that was never
# derived at all, which is the shape of the bug this script was fixed for.
echo "Summary: $SEEDED seeded · $PRESENT already present · $SKIPPED declared policy skip · $FAILED failed or blocked · $UNSATISFIED unsatisfied"
exit $(( FAILED + UNSATISFIED ))
