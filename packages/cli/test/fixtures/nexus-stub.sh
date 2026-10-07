#!/usr/bin/env bash
# A stand-in `nexus` binary for `sweep-promotes-warn-only-under-strict.test.ts`.
#
# ══════════════════════════════════════════════════════════════════════════════
# WHY A STUB BINARY IS THE WHOLE POINT
# ══════════════════════════════════════════════════════════════════════════════
#
# `sweep.sh` reads `NEXUS_BIN` from the environment and splits it on whitespace
# into an argv array, so whatever that names IS the CLI as far as the sweep can
# tell. That is what lets the sweep's exit policy be EXECUTED in CI with no
# credential, no tenant and no network — which is the only way to prove the
# policy runs rather than merely that its source contains the right line.
#
# `sweep-skips-only-a-declared-opt-out.test.ts` already named this rig in its own
# "WHAT THIS SPEC CANNOT DO" section. This file is that rig.
#
# ⚠️ IT IS INVOKED AS `bash <this file>`, NEVER BY PATH. A stub without the exec
# bit is `exec`d, fails, and `sweep.sh` FATALs at its preflight with exit 3 —
# which is indistinguishable at a glance from "three leaves failed", because the
# refusal codes share a number space with the FAIL count. The spec names `bash`
# explicitly so the exec bit is not load-bearing.
#
# ══════════════════════════════════════════════════════════════════════════════
# THE KNOBS
# ══════════════════════════════════════════════════════════════════════════════
#
# Each is a newline-separated list of leaf paths. The spec derives every one of
# them from `classifyCommandUniverse()` rather than naming a command here, so a
# renamed or deleted leaf cannot leave this fixture quietly describing a CLI that
# no longer exists.
#
#   STUB_SKIP_LEAVES   exit 1 with the backend's policy opt-out sentence
#   STUB_WARN_LEAVES   exit 0 and emit PLAIN TEXT — the JSON-contract defect
#   STUB_FAIL_LEAVES   exit 1 with an error that is NOT policy (a 500)
#   STUB_UNAUTH_LEAVES exit 1 with the CLI's own 401 sentence
#   STUB_ROUTE_MISSING `leaf<TAB>path` per line — exit 1 with the deployed API's
#                      route-absence 404 naming THAT path
#
# ⚠️ `STUB_ROUTE_MISSING` CARRIES THE PATH RATHER THAN DERIVING IT, and that is
# what makes it an instrument. The sweep accepts a route-absence 404 only when it
# names the path the leaf is DECLARED for, so a fixture that always echoed the
# declared path could not produce the case that discriminates — a 404 naming some
# OTHER path, which must stay a FAIL. The spec supplies both.
#
# Everything else answers exit 0 with a valid, non-empty, secret-free document,
# which is what a healthy leaf looks like to `scan-response.py`.
set -u

argv=("$@")

# Rebuild the leaf path the way `sweep.sh` assembled it: drop `--profile <name>`
# and the trailing `--json`, and treat `--version` as the preflight probe.
path_parts=()
i=0
while [[ $i -lt ${#argv[@]} ]]; do
  case "${argv[$i]}" in
    --profile) i=$((i + 2)); continue ;;
    --json) i=$((i + 1)); continue ;;
    --version)
      echo "0.0.0-stub"
      exit 0
      ;;
  esac
  path_parts+=("${argv[$i]}")
  i=$((i + 1))
done

leaf="${path_parts[*]-}"

# The preflight's auth probe. A non-zero here is exit 4 and the sweep never
# reaches a single leaf.
if [[ "$leaf" == "auth status" ]]; then
  echo '{"data":{"profile":"stub","authenticated":true}}'
  exit 0
fi

in_list() {
  local needle="$1" listing="$2" line
  while IFS= read -r line; do
    [[ -n "$line" && "$line" == "$needle" ]] && return 0
  done <<< "$listing"
  return 1
}

if in_list "$leaf" "${STUB_SKIP_LEAVES:-}"; then
  # Matched by `policy-refusal.sh`, so `sweep.sh` scores it SKIP.
  echo '{"error":{"code":"FEATURE_NOT_ENABLED","message":"API error (403): This organization has opted out of this feature"}}'
  exit 1
fi

if in_list "$leaf" "${STUB_FAIL_LEAVES:-}"; then
  # Deliberately NOT policy: a 500 must stay a FAIL in every mode.
  echo '{"error":{"code":"INTERNAL","message":"API error (500): Internal server error"}}'
  exit 1
fi

if in_list "$leaf" "${STUB_UNAUTH_LEAVES:-}"; then
  # The CLI's own 401 line, verbatim from `src/errors.ts` — the most expensive
  # false acceptance available, because an expired CI key refuses every leaf at
  # once and a mechanism that absorbed it would report a clean, vacuous sweep.
  echo '{"error":{"code":"UNAUTHENTICATED","message":"Authentication failed — invalid or missing API key."}}'
  exit 1
fi

# The deployed API has no such route. Two owners in one sentence, and the stub
# reproduces both halves: `Not found: ` is prepended by the CLI's own 404 branch
# in `src/errors.ts`, and `Cannot GET <path>` is the deployed API's own 404 body —
# measured 2026-10-07, `GET /api/public/v1/zzz-nonexistent-noun-9f3` answering
# `{"success":false,"error":{"code":"NOT_FOUND","message":"Cannot GET
# /api/public/v1/zzz-nonexistent-noun-9f3"}}`, with live paths answering 401
# instead. The measured path is a COINED one on purpose: 404 is no route and 401
# is a route, so the 404 half of that oracle only stays true when it is measured
# on a path nobody can register.
#
# `exit 1`, not `exit 4`: the sweep records the code the CLI returns and the real
# binary returns 4 for this class, but nothing in the classification reads it —
# `route-not-deployed.sh` refuses the exit-code shape outright. A stub that exited
# 4 would make this fixture agree with a matcher keyed on the status.
route_missing_path=""
while IFS=$'\t' read -r stub_leaf stub_path; do
  [[ -n "$stub_leaf" && "$stub_leaf" == "$leaf" ]] && route_missing_path="$stub_path"
done <<< "${STUB_ROUTE_MISSING:-}"

if [[ -n "$route_missing_path" ]]; then
  printf '{"error":{"code":"NOT_FOUND","message":"Not found: Cannot GET %s","hint":null}}\n' \
    "$route_missing_path"
  exit 1
fi

if in_list "$leaf" "${STUB_WARN_LEAVES:-}"; then
  # THE DEFECT THIS GATE EXISTS FOR: a leaf that ignores `--json` and renders a
  # human table. It exits 0, so only the JSON scan can catch it, and only
  # `--strict` can make that catch fail the build.
  echo "NAME                        VALUE"
  echo "stub-row                    ok"
  exit 0
fi

echo '{"data":[{"id":"stub-1","name":"stub"}],"meta":{"total":1,"page":1,"limit":20}}'
exit 0
