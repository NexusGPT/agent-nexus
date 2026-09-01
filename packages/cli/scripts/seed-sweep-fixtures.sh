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
# 🚨 IT IS NOT RUN BY CI, AND THAT IS DELIBERATE RATHER THAN UNFINISHED.
# `cli-sweep` authenticates with NEXUS_STAGING_API_KEY, which is READ-ONLY
# precisely so the gate cannot mutate the environment it is measuring. Seeding
# is a write. Run this BY HAND, with a write-scoped key, when the sweep reports
# FIXTURE MISSING.
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
# Usage:
#   NEXUS_PROFILE=<write-scoped profile> bash scripts/seed-sweep-fixtures.sh
#   NEXUS_BIN="node packages/cli/dist/index.js" ... (same override sweep.sh uses)

set -uo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)

read -ra NEXUS_CMD <<< "${NEXUS_BIN:-nexus}"
NEXUS_ARGS=()
[[ -n "${NEXUS_PROFILE:-}" ]] && NEXUS_ARGS+=(--profile "$NEXUS_PROFILE")

nx() {
  "${NEXUS_CMD[@]}" ${NEXUS_ARGS[@]+"${NEXUS_ARGS[@]}"} "$@"
}

SEEDED=0
PRESENT=0
FAILED=0

# Is this leaf's response already non-empty? Asked with the SAME instrument the
# sweep uses, so "seeded" and "the sweep is satisfied" cannot drift apart. A
# second emptiness rule here is a second thing to get wrong.
already_has_rows() {
  local leaf="$1" out
  # shellcheck disable=SC2086
  out=$(nx $leaf --json 2>&1) || return 1
  printf '%s' "$out" | python3 "$SCRIPT_DIR/scan-response.py" --require-non-empty >/dev/null 2>&1
  [[ $? -eq 0 ]]
}

# ensure <leaf> <human label> <create command...>
ensure() {
  local leaf="$1" label="$2"
  shift 2

  if already_has_rows "$leaf"; then
    printf '  ok      %-26s already has rows\n' "$label"
    PRESENT=$((PRESENT + 1))
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
  if already_has_rows "$leaf"; then
    printf '  ok      %s\n' "$leaf"
  else
    printf '  UNSATISFIED  %s — declared safe-with-fixture and still returns no rows\n' "$leaf"
    UNSATISFIED=$((UNSATISFIED + 1))
  fi
done <<< "$FIXTURE_LEAVES"

if [[ $UNSATISFIED -gt 0 ]]; then
  echo ""
  echo "  $UNSATISFIED leaf/leaves are declared safe-with-fixture and have no rows."
  echo "  If one of them has no 'ensure' call above, that is the bug — add it."
fi

echo ""
# Non-zero whenever a fixture-backed leaf is left unsatisfied, counted from the
# DERIVED set. A seed that exits 0 over an unsatisfied leaf is the false green
# this disposition exists to delete, reintroduced inside its own remedy.
echo "Summary: $SEEDED seeded · $PRESENT already present · $FAILED failed or blocked · $UNSATISFIED unsatisfied"
exit $(( FAILED + UNSATISFIED ))
