import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { shrinkOnlyLedger } from "@nexus/types/testing/shrink-only-ledger";
import { describe, expect, it } from "vitest";

import { collectRoutes, reachedBySdk } from "./v1-route-scan.conformance";

/**
 * THE GATE between a Public API v1 route and an SDK method that can reach it.
 *
 * A v1 endpoint arrives in three steps — backend route, SDK method, CLI command
 * — and each step is hand-written. Two of the three seams already have a gate:
 * `types-match-the-v1-contract.test.ts` proves the SDK's TYPES equal the
 * contract's schemas, and `../../../cli/src/sdk-methods-reach-the-cli.test.ts`
 * proves every SDK method has a CLI caller. This file closes the first seam:
 * every route the contract DECLARES must have an SDK method that calls it.
 *
 * Without it, a route can ship on the server, be absent from the SDK, and be
 * unreachable from the terminal with `tsc`, ESLint and every suite green — the
 * type gate only compares the types that EXIST, so a route with no SDK method
 * has nothing to disagree with. `multipart-routes-have-an-sdk-method.test.ts`
 * proves exactly this shape for upload routes; this is the same argument over
 * the whole surface.
 *
 * The unreached routes are ledgered below, and the ledger's SIZE is a fact this
 * gate keeps true rather than a measurement that rots: it is asserted in both
 * directions, so a route that gains a method or disappears reds this file. They
 * are not evenly spread: the rows cluster by reason, several of them naming a
 * whole domain the SDK never grew a resource for. Group the ledger by its reason
 * string to see the spread; nothing asserts that breakdown, so read it rather
 * than trusting a figure.
 *
 * The largest cluster this gate ever held was `agent-evals` — 33 rows, one
 * reason, an entire domain that shipped on the public API and reached neither
 * the SDK nor the CLI. It is gone: `client.agentEvals` reaches all 33. Kept here
 * because it is the worked example of what the ceiling below is FOR — the block
 * arrived one row at a time with every arm green, and an equality asserted in
 * both directions cannot refuse that.
 *
 * **The size of the v1 surface, and how much of it the SDK reaches, are
 * deliberately NOT written here.** Both grow with every route landed, so a
 * figure goes stale with nothing to catch it — this paragraph carried one that
 * had drifted by more than twenty routes. `collectRoutes().length` is the live
 * total and `collectRoutes().filter((r) => reachedBySdk(r.method, r.path))` the
 * live reached set; the failure message below prints the delta that matters.
 *
 * ## Shape: a ledger that may only shrink
 *
 * Every descriptor either has an SDK call or is named in
 * {@link V1_ROUTES_WITHOUT_AN_SDK_METHOD} with a reason. Adding a route and no
 * method therefore fails until someone writes down which of the two it is — a
 * deliberate omission or the defect above.
 *
 * Checked in BOTH directions. An entry naming a descriptor that no longer
 * exists, or one that has since gained a method, fails too: an exemption list
 * nobody prunes silently grows into a list of everything.
 *
 * ## It scans text, and that bounds what it can prove
 *
 * The scan pairs the VERB with the path, because `GET /agents` and `POST
 * /agents` are different routes at one path. It proves a call site exists that
 * names this verb and this path; it cannot prove the call is reachable from a
 * public method, and it cannot see a path assembled from fragments. So it
 * catches the route with no call site at all — the shape every ledgered row has
 * — and claims nothing beyond it. The count is deliberately not written here:
 * it is the ledger's own length, which the ceiling below already pins.
 *
 * There is no CLI generator to regenerate from: the CLI's 91 command files are
 * hand-written `commander` registrations, and the only generator scripts in
 * that package build the skills bundle and the vibe audit event types. Detection
 * is therefore the whole of what is available here, which is why this is a gate
 * rather than a codemod.
 *
 * ## The one way this gate goes wrong, stated so nobody has to rediscover it
 *
 * It FAILS CLOSED. The scan needs a literal `"GET", \`/agents/${id}\`` pair in
 * the source, so an SDK refactor that assembles paths from a constant, a helper
 * or a builder would turn many routes red at once with no real drift behind it.
 * That direction is the safe one — a false red is read and dismissed by a human,
 * where a false green ships an unreachable route — but it is a genuine cost and
 * it lands on whoever does that refactor.
 *
 * If that day comes, the fix is to make the SDK's routes ENUMERABLE rather than
 * to loosen this regex: match on a structure the refactor produces (a route
 * table, a manifest) instead of on call-site text. Widening the pattern until it
 * stops complaining is how a gate becomes decorative.
 *
 * Measured against 10 merged PRs that touch neither `packages/sdk/**` nor the v1
 * contract: **0 false positives**. Extended to the whole population of such PRs
 * in that window — 93 of them, collapsing to 14 distinct gate-input states — all
 * 14 executed green. The window contained no change to the route set, so it does
 * not exercise "the contract grew"; that PR class touches the contract by
 * definition and is what the gate is FOR.
 *
 * ## The route table and the matcher now live in `./v1-route-scan.conformance`
 *
 * `../types/v1-response-types-match-the-contract.test.ts` takes the REACHED set
 * as its population — it asks whether the method that reaches a route declares
 * the right return type — so both gates have to agree on what "reached" means.
 * A second copy of the regex would be two spellings of one rule, and the drift
 * would be silent in both directions. The fixtures below still live here,
 * because they are assertions about this gate's own bound.
 */

/**
 * Routes with no SDK method, on purpose or pending. Each line says WHY, because
 * "unexposed" and "forgotten" look identical from here.
 *
 * Shrinking this list is the point. Every entry that gains an SDK method must be
 * deleted from it in the same change, or this gate fails in its second
 * direction.
 */
/**
 * THE MOST ROUTES THIS LEDGER MAY HOLD, AS A LITERAL SOMEBODY RAISES BY HAND.
 *
 * The header above says "the ledger's SIZE is a fact this gate keeps true rather
 * than a measurement that rots", and what kept it true was an equality asserted
 * in both directions. An equality refuses DIVERGENCE, never GROWTH: a new route
 * with no SDK method, plus the row that ledgers it, land in one commit and do
 * not diverge. So the list could reach the whole v1 surface one row at a time
 * with every arm green — which is how it reached 58, over half of them one
 * domain, before anybody measured it.
 *
 * A ledgered route is a route this gate has STOPPED WATCHING, so this figure is
 * how much of the surface is unwatched. An UPPER BOUND, so writing the SDK
 * method takes its row and this figure down together, in silence.
 *
 * 59 → 57. Two rows left together — `DeploymentChatSessionCreate` and
 * `ChatSendMessageStream` — because `client.chat` now writes both hops.
 *
 * 🔑 **THE ROW FOR `ChatSendMessageStream` WAS ARGUED AS PERMANENT AND IT WAS
 * NOT.** Its reason read: *"the route is authenticated by a chat-session token
 * in `x-chat-session-token` and `HttpClient.requestSSE` hardcodes `"api-key":
 * this.apiKey`, so a method there could not present the credential the route
 * admits."* Every clause was true when it was written. The conclusion was a
 * property of ONE LINE OF THIS SDK, not of the route — `credentialHeaders()`
 * resolves the credential in one place now and returns exactly one header, so
 * the method that "cannot succeed" is four lines and streams.
 *
 * The lesson is about the LEDGER, not about chat: a reason that reads
 * "impossible" and is really "our client cannot do it yet" retires the route
 * from this gate for ever, and nothing re-tests it. Prefer a reason naming what
 * would have to change.
 *
 * 57 → 58. `DeploymentAnonymousChatSessionCreate` is one row up, and the
 * argument is deliberately NOT "no caller yet". `NexusClient`'s constructor
 * throws without an API key — `opts.apiKey ?? getEnv("NEXUS_API_KEY")`, then
 * `if (!apiKey) throw` — and the whole contract of that route is a caller who
 * presents none. So this SDK cannot represent its principal at all, and a
 * method here would be an inferior duplicate of `chat.createSession`: same
 * credential in the constructor, same response, and strictly less capability,
 * since the anonymous door can neither resume a conversation nor carry an
 * identity.
 *
 * Per the lesson directly above, the row names what would have to change: a
 * `NexusClient` constructible with NO credential. On the day that exists the
 * method is three lines and this figure comes back down.
 *
 * 58 → 61 for `ChatResumeStream`, `ChatStopTurn` and `ChatTurnStatus`, the
 * resume half of the browser chat surface. THREE ORDINARY DEBT ROWS, and the
 * lesson above is why they were written that way: the branch that added them
 * first ledgered them as browser-authenticated and therefore impossible, which
 * is the exact reason this gate had just finished retiring.
 * `credentialHeaders()` presents `x-chat-session-token`, so the only thing
 * missing was the method.
 *
 * 61 → 58. Somebody wrote it. `ChatResource.resume` / `.resumeRaw` / `.stop` /
 * `.status` reach all three, and all three rows left in the same commit — which
 * is the whole shape this ledger was arguing for: a row whose reason names what
 * would have to change is a row that can be retired, and one that says
 * "impossible" never is.
 *
 * 58 → 56. `ScoreRecord` and `ScoreList` left together: `client.scores.record` /
 * `.list` reach both. Their reason ended in "yet", which is what marked them as
 * a pending gap rather than a decision — the distinction this ledger's reasons
 * exist to carry, and the one that told a sweep which of its candidates were
 * actually buildable.
 *
 * 56 → 23. THE `agent-evals` BLOCK, ALL OF IT (NEX-3909). `client.agentEvals`
 * reaches all 33 routes — runs, batches, templates, schedules, triggers and
 * webhooks — so every row left in one commit and this figure fell by the same
 * 33. It was the largest single block this ledger ever held and the reason the
 * ceiling existed: 33 rows, one reason, landed one at a time with every arm
 * green, which is exactly the growth an equality cannot refuse.
 *
 * ⚠️ The deleted block's own comment read "34 routes" against 33 rows. The rows
 * were right — `grep -oE '"(GET|POST|PATCH|PUT|DELETE) /agent-evals[^"]*"'` over
 * `../response-contract.generated.ts` returns 33 distinct routes, and all 33 are
 * now reached. A prose count beside a list nothing sums is a count that drifts;
 * this note is the last one, because the list is gone.
 *
 * ⚠️ AND THE ROW COUNT IS THE ONLY THING THAT SETTLES THIS FIGURE, BECAUSE TWO
 * REDUCTIONS COMPOSED HERE. Both entries above deleted rows from the same
 * baseline of 58, so neither branch's own arithmetic survives the merge: 25 and
 * 56 are each true of one side alone and false of the tree. Write the count, not
 * the subtraction — and count key-anchored (`^\s{2}[A-Za-z0-9_]+\s*:`), because
 * a line-based `key: "value"` scan reads 57 against 58:
 * `DeploymentAnonymousChatSessionCreate`'s reason is a concatenated string
 * prettier wrapped onto the following lines.
 *
 * `shrinkOnlyLedger` does hold both directions — too high throws at
 * construction, too low reds its "the ledger never grows" arm — so the merge
 * cannot land a wrong number here in silence. It is the FLOOR in
 * `../types/v1-response-types-match-the-contract.test.ts` that has no such
 * second direction, and the same two-lane composition applies to it; that file
 * carries the rule at its own literal.
 */
const V1_ROUTES_WITHOUT_AN_SDK_METHOD_CEILING = 23;

const V1_ROUTES_WITHOUT_AN_SDK_METHOD: Record<string, string> = {
  // ── Analytics reports: scheduled-report CRUD, no SDK resource ────────────
  AnalyticsReportCreate: "analytics report scheduling has no SDK resource yet",
  AnalyticsReportList: "analytics report scheduling has no SDK resource yet",
  AnalyticsReportGet: "analytics report scheduling has no SDK resource yet",
  AnalyticsReportListRuns: "analytics report scheduling has no SDK resource yet",
  AnalyticsReportRunNow: "analytics report scheduling has no SDK resource yet",
  AnalyticsReportUpdate: "analytics report scheduling has no SDK resource yet",
  AnalyticsReportDelete: "analytics report scheduling has no SDK resource yet",

  // ── Permissions / ACL surface, no SDK resource ───────────────────────────
  PermissionsUpdateRelation: "permissions surface has no SDK resource yet",
  PermissionsListAccessible: "permissions surface has no SDK resource yet",
  PermissionsCheck: "permissions surface has no SDK resource yet",
  PermissionsRevokeImpact: "permissions surface has no SDK resource yet",
  PermissionsUpdateOrgSettings: "permissions surface has no SDK resource yet",

  // ── Agent workspaces ─────────────────────────────────────────────────────
  AgentWorkspaceList: "agent workspace attachment has no SDK resource yet",
  AgentWorkspaceAttach: "agent workspace attachment has no SDK resource yet",
  AgentWorkspaceDetach: "agent workspace attachment has no SDK resource yet",

  // ── Claude Code skill delivery ───────────────────────────────────────────
  // Served to the `claude-code` toolchain over HTTP, not driven by a CLI verb.
  ClaudeCodeSkillExists: "consumed by the Claude Code toolchain, not by an SDK caller",
  ClaudeCodeSkillDownload: "consumed by the Claude Code toolchain, not by an SDK caller",

  // ── Protocol / transport endpoints, deliberately not SDK methods ─────────
  // `POST /public/v1/mcp` is the JSON-RPC envelope every MCP client speaks;
  // @agent-nexus/mcp-server forwards to it directly rather than through a
  // typed resource method, so a resource wrapper would have no caller.
  McpRpc: "JSON-RPC transport endpoint — @agent-nexus/mcp-server forwards to it directly",

  // ── Individually unreached ───────────────────────────────────────────────
  VibeRegisterAppAsTool: "vibe app surface is driven by the vibe SDK, not this one",
  DeploymentVoiceSessionCreate: "voice session handshake is driven by the realtime client",
  DeploymentAnonymousChatSessionCreate:
    "the route's principal is a browser presenting NO credential, and NexusClient throws " +
    "without an API key — so this SDK cannot construct the caller it is for. Writable when a " +
    "credential-less client exists; until then a method would duplicate chat.createSession " +
    "with less capability.",
  // `DeploymentChatSessionCreate` and `ChatSendMessageStream` were both here and
  // are both gone: `ChatResource.createSession` / `.stream` / `.streamRaw` reach
  // them. Do not re-add either — see the ceiling's docblock for why the second
  // row's "impossible" reason was a fact about this client, not about the route.
  //
  // `ChatResumeStream`, `ChatStopTurn` and `ChatTurnStatus` were here too and
  // are gone: `ChatResource.resume` / `.resumeRaw` / `.stop` / `.status` reach
  // them, on the same chat-session token.
  WorkflowOverviewValidateNodeVariables: "editor-only validation probe, no CLI verb",
  TracingAnalyticsExport: "no SDK method — export is unexposed"
};

describe("every Public API v1 route has an SDK method", () => {
  const routes = collectRoutes();

  /**
   * Controls. A scan that silently matches nothing reports the entire contract
   * as drift, and a scan that matches everything reports none — both read as a
   * clean answer. Two positives and one negative pin it: one parameterless
   * route, one parameterised route (the `:param` → `${expr}` rewrite is the
   * part that broke while this was being written, and it failed as 313 false
   * drifts), and one route that does not exist.
   */
  it("the scan can tell a reached route from an unreached one", () => {
    expect(routes.length).toBeGreaterThan(300);
    expect(reachedBySdk("GET", "/public/v1/agents")).toBe(true);
    expect(reachedBySdk("GET", "/public/v1/agents/:agentId")).toBe(true);
    expect(reachedBySdk("GET", "/public/v1/not-a-real-route")).toBe(false);
  });

  /**
   * Regression fixtures for the trailing-expression clause.
   *
   * Both routes below have a real SDK method AND a CLI caller, and both were
   * reported unreached — then ledgered, which is the expensive half: a ledgered
   * route is a route this gate has stopped watching, so deleting either method
   * would have gone unnoticed. They are asserted against the LIVE source
   * because that is the claim that regresses.
   */
  it.each([
    ["SkillsDeleteExternalTool", "DELETE", "/public/v1/skills/external-tools/:externalToolId"],
    [
      "ToolConnectionInitiateClientCredentials",
      "POST",
      "/public/v1/tools/:toolId/initiate-client-credentials"
    ]
  ])("%s is reached even though the call appends a query expression", (name, method, routePath) => {
    expect(reachedBySdk(method, routePath)).toBe(true);
    // And it must NOT be ledgered — a ledgered route is one this gate no longer watches.
    expect(Object.keys(V1_ROUTES_WITHOUT_AN_SDK_METHOD)).not.toContain(name);
  });

  /**
   * The bound on that clause, asserted against a FIXTURE rather than the live
   * source — the live source cannot prove a negative stays negative once
   * somebody adds the method.
   *
   * Only `${…}` expressions may follow the path. A further path segment starts
   * with a literal `/`, so a shorter route must not match a call site for a
   * longer one. Without this, loosening the matcher would silently mark parent
   * routes reached and the gate would under-report drift — the direction that
   * ships an unreachable endpoint.
   */
  it("a trailing ${expr} counts, a further path segment does not", () => {
    const onlyTheLongRoute = 'this.http.request("GET", `/agents/${agentId}/tools`);';
    expect(reachedBySdk("GET", "/public/v1/agents/:agentId", onlyTheLongRoute)).toBe(false);
    expect(reachedBySdk("GET", "/public/v1/agents/:agentId/tools", onlyTheLongRoute)).toBe(true);

    const withQuery = 'this.http.request("GET", `/agents/${agentId}${query}`);';
    expect(reachedBySdk("GET", "/public/v1/agents/:agentId", withQuery)).toBe(true);

    const wrongVerb = 'this.http.request("POST", `/agents/${agentId}`);';
    expect(reachedBySdk("GET", "/public/v1/agents/:agentId", wrongVerb)).toBe(false);
  });

  it.each(
    eachOrRefuse(
      shrinkOnlyLedger({
        // EVERY v1 route is the drain-proof control, never the unreached ones: a
        // route that gains an SDK method is still a route, so this population
        // survives the cure and its coverage arm — at least one route IS reached —
        // gets stronger with every method written.
        population: "Public API v1 routes with no SDK method that calls them",
        findings: routes.filter((route) => !reachedBySdk(route.method, route.path)),
        keyOf: (route) => route.name,
        locate: (route) => `${route.name}  (${route.method} ${route.path})`,
        ledgerKeys: Object.keys(V1_ROUTES_WITHOUT_AN_SDK_METHOD),
        ceiling: V1_ROUTES_WITHOUT_AN_SDK_METHOD_CEILING,
        remedy:
          "Write the SDK method. A route can ship on the server, be absent from the SDK and\n" +
          "  be unreachable from the terminal with `tsc`, ESLint and every suite green — the\n" +
          "  type gate only compares the types that EXIST, so a route with no method has\n" +
          "  nothing to disagree with.\n" +
          "  A row here is a route this gate has STOPPED WATCHING: deleting its method later\n" +
          "  would go unnoticed.",
        drainProofControl: {
          name: "routes the Public API v1 contract declares",
          keys: routes.map((route) => route.name),
          floor: 300
        },
        rowCheck: {
          name: "every ledger entry carries a reason",
          offender: (name) => {
            const reason = V1_ROUTES_WITHOUT_AN_SDK_METHOD[name];
            if (reason === undefined) return `${name} — no reason at all`;
            return reason.trim().length === 0 ? `${name} — reason is blank` : null;
          }
        }
      }).checks.map((check) => [check.name, check] as const),
      "the checks shrinkOnlyLedger builds — a FIXED set of rows, never derived from the ledger, so it cannot empty when the ledger does"
    )
  )("%s", (_name, check) => {
    // vitest's `expect` takes a second message argument, unlike jest's — this
    // package runs under vitest, so the primitive's own idiom is used directly.
    expect(check.actual, check.message).toEqual(check.expected);
  });

  it("the ledger names only routes that still exist and are still unreached", () => {
    const byName = new Map(routes.map((route) => [route.name, route]));

    const stale = Object.keys(V1_ROUTES_WITHOUT_AN_SDK_METHOD).filter((name) => !byName.has(name));
    expect(stale, "ledger entries for routes the contract no longer declares").toEqual([]);

    const nowReached = Object.keys(V1_ROUTES_WITHOUT_AN_SDK_METHOD).filter((name) => {
      const route = byName.get(name);
      return route !== undefined && reachedBySdk(route.method, route.path);
    });
    expect(nowReached, "ledger entries that have since gained an SDK method — delete them").toEqual(
      []
    );
  });
});
