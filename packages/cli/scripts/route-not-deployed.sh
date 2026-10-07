# route-not-deployed.sh — the ONE definition of "the DEPLOYED API has no such
# route", sourced by `sweep.sh` and by nothing else today.
#
# ══════════════════════════════════════════════════════════════════════════════
# WHY A LEAF CAN BE CORRECTLY CLASSIFIED `safe` AND STILL BE UNSERVEABLE
# ══════════════════════════════════════════════════════════════════════════════
#
# The `cli-sweep` job builds the CLI from the PULL REQUEST's own sources and
# sweeps it against the DEPLOYED staging API. Those are two different trees. So a
# branch that adds a CLI noun AND the route it calls is red from the moment it
# opens until it is merged and deployed — the classification is right, the
# command is right, and the environment simply cannot answer yet.
#
# That is structural and recurs for every CLI-noun-plus-new-route pairing. The
# tree already carries one by hand: `tracks list` sits parked at
# `registration-only` with a block comment naming the probe that would promote
# it. A comment is not a mechanism — nothing reddens when the route starts
# answering, so the leaf stays unswept after its own reason has expired, which
# that comment calls "the silent half of this disposition" in its own words.
#
# `SWEEP_ROUTES_PENDING_DEPLOY` in `src/command-universe.ts` is the declared
# form, and it SELF-RETIRES: a leaf whose declared route answers is a FAIL naming
# the entry to delete. This file is the half that decides whether the refusal in
# front of the sweep is that absence, or something else.
#
# ══════════════════════════════════════════════════════════════════════════════
# 🚨 MATCH THE SENTENCE, NEVER THE STATUS — AND BIND IT TO THE DECLARED PATH
# ══════════════════════════════════════════════════════════════════════════════
#
# The sentence has two owners and both halves are load-bearing:
#
#   `Not found: `        prepended by `src/errors.ts`, this package's own 404
#                        branch. In-repo, and the spec asserts it.
#   `Cannot GET <path>`  the DEPLOYED API's own 404 body. Measured 2026-10-07:
#                        GET /api/public/v1/zzz-nonexistent-noun-9f3 answers 404
#                        {"success":false,"error":{"code":"NOT_FOUND","message":
#                        "Cannot GET /api/public/v1/zzz-nonexistent-noun-9f3"}},
#                        against live paths — /api/public/v1/agents and
#                        /api/public/v1/tracks — which answer 401 instead.
#                        🚨 THE SUBJECT IS A COINED PATH ON PURPOSE. 404 is NO
#                        ROUTE and 401 is A ROUTE, and that contrast is the whole
#                        oracle — so the 404 half has to be measured on a path
#                        nobody can register. A real noun deploys, starts
#                        answering 401, and takes this measurement false while
#                        still reading as checked.
#                        That half is an English sentence owned by the backend and
#                        `packages/cli` is mirrored to a public repository on its
#                        own, so nothing here may reach across to assert it. A
#                        reword re-reds this gate silently — the coupling is
#                        documented, not enforced, exactly as `policy-refusal.sh`
#                        says of its own phrases.
#
# Each tempting broadening is silent and permanent, and the first two are what a
# reader reaches for first:
#
#   - `404 means pending deploy` — a 404 is also "that id does not exist", which
#     is the single commonest REAL failure a read-only sweep can surface. It
#     would turn every one of them green.
#   - `exit=4 means pending deploy` — the CLI's exit code for the whole
#     not-found class. Same hole, one layer down, and `policy-refusal.sh` already
#     refuses the exit-code shape for the same reason.
#   - any `Not found:` — matches `Not found: Agent not found`, a resource refusal
#     from a route that is deployed and working.
#   - `Cannot GET` with no path — satisfied by a TYPO'd route. A branch that
#     renames `/mcp-servers` to `/mcp-server` in the CLI and nowhere else is a
#     real defect whose 404 reads identically to this one. Binding to the
#     declared path is the whole difference, and the closing `"` is what makes
#     the bind exact rather than a prefix: `…/mcp-servers-typo"` must not satisfy
#     a declaration for `…/mcp-servers`.
#
# ⚠️ THE VERB IS `[A-Z]+` AND THAT IS NOT A LOOSENING. The path is what
# discriminates — one path belongs to one route module — so pinning the verb as
# well would add a second field to keep in step with the declaration while
# excluding nothing the path does not already exclude. A route deployed for POST
# and absent for GET is pending-deploy under either spelling.
#
# ⚠️ THE DECLARED PATH IS WRITTEN AS THE MESSAGE SPELLS IT, `/api/...` PREFIX
# INCLUDED, and not as the generated contract spells it (`/public/v1/...`). The
# message is what is matched here, so declaring anything else would need a
# prefix transformation that nothing checks — and `DriftReport`'s own docblock
# refuses a v1-contract binding in this module on purpose.

# The ERE the matcher builds, with the declared path spliced in. Kept here rather
# than inlined at the call site so a reader — and the spec — has exactly one
# place to look, and so no caller is tempted to assemble its own.
#
# `%s` is the escaped path, never the raw one. See the guard below.
ROUTE_NOT_DEPLOYED_PATTERN_FORMAT='"message":[[:space:]]*"Not found: Cannot [A-Z]+ %s"'

# What a declared path may contain. A path is spliced into an ERE, so an
# unvalidated one is the broadening this file exists to prevent: a declaration
# reading `.*` would match every 404 there is. The set is deliberately smaller
# than RFC 3986 allows — it is what a Public API v1 path uses — and anything
# outside it REFUSES rather than being escaped on a best-effort basis.
ROUTE_NOT_DEPLOYED_PATH_CHARSET='^/[A-Za-z0-9/_.~-]+$'

# is_route_not_deployed <captured output> <declared path>
#
#   0  the refusal IS this exact path being absent from the deployed API
#   1  it is not — the caller must score the failure on its own merits
#   2  REFUSED: the declared path is not a literal path, so nothing was measured
#
# 🚨 2 IS NOT 1. A malformed declaration means the question was never asked, and
# collapsing it into "no match" would turn a typo in the declaration into a leaf
# that fails for a reason nobody can read. The caller distinguishes them.
is_route_not_deployed() {
  local transcript="$1" route="$2" escaped pattern

  # An absent declaration is a clean "no", not a refusal: the caller asks this of
  # every leaf and most leaves are undeclared.
  [[ -n "$route" ]] || return 1

  if [[ ! "$route" =~ $ROUTE_NOT_DEPLOYED_PATH_CHARSET ]]; then
    return 2
  fi

  # `.` is the one character in the charset above that is also an ERE
  # metacharacter, so it is escaped rather than excluded — a path segment with a
  # dot in it is legitimate, and refusing one would be a gate refusing correct
  # work.
  escaped=${route//./\\.}
  # shellcheck disable=SC2059
  pattern=$(printf "$ROUTE_NOT_DEPLOYED_PATTERN_FORMAT" "$escaped")

  printf '%s' "$transcript" | grep -qE "$pattern"
}
