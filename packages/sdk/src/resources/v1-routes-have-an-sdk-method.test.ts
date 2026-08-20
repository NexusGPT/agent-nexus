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
 * are not evenly spread — over half carry one reason, `agent-evals`, an entire
 * domain (runs, batches, templates, schedules, triggers, webhooks) that shipped
 * on the public API and never reached the SDK or the CLI. That is the drift this
 * ticket was filed about, and it was already this large before anyone measured
 * it. Group the ledger by its reason string to see the spread; nothing asserts
 * that breakdown, so read it rather than trusting a figure.
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
 * catches the route with no call site at all — which is the shape all 57 have —
 * and claims nothing beyond it.
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
 * 58 → 59 for `ChatSendMessageStream`, and that raise is the honest ending
 * rather than the lazy one. Every other row here is a route whose SDK method has
 * not been WRITTEN YET, so the row is debt and this figure falls when somebody
 * writes it. That one cannot fall: the route is authenticated by a chat-session
 * token in `x-chat-session-token` and `HttpClient.requestSSE` hardcodes
 * `"api-key": this.apiKey`, so a method there could not present the credential
 * the route admits. Writing one would be writing a method that cannot succeed.
 */
const V1_ROUTES_WITHOUT_AN_SDK_METHOD_CEILING = 59;

const V1_ROUTES_WITHOUT_AN_SDK_METHOD: Record<string, string> = {
  // ── Conversation evals: an entire domain, no SDK surface at all ──────────
  // 34 routes. Not a deliberate omission — the domain shipped on the public API
  // and the SDK was never extended to it, so none of it is reachable from the
  // CLI. Tracked as the largest single block of drift this gate found.
  ConversationEvalRunCreate: "agent-evals domain has no SDK resource yet",
  ConversationEvalRunList: "agent-evals domain has no SDK resource yet",
  ConversationEvalRunGet: "agent-evals domain has no SDK resource yet",
  ConversationEvalRunDelete: "agent-evals domain has no SDK resource yet",
  ConversationEvalRunExecute: "agent-evals domain has no SDK resource yet",
  ConversationEvalRunAbort: "agent-evals domain has no SDK resource yet",
  ConversationEvalRunTranscript: "agent-evals domain has no SDK resource yet",
  ConversationEvalRunResults: "agent-evals domain has no SDK resource yet",
  ConversationEvalRunCompare: "agent-evals domain has no SDK resource yet",
  ConversationEvalBatchCreate: "agent-evals domain has no SDK resource yet",
  ConversationEvalBatchList: "agent-evals domain has no SDK resource yet",
  ConversationEvalBatchGet: "agent-evals domain has no SDK resource yet",
  ConversationEvalTemplateList: "agent-evals domain has no SDK resource yet",
  ConversationEvalTemplateListImportable: "agent-evals domain has no SDK resource yet",
  ConversationEvalTemplateCreate: "agent-evals domain has no SDK resource yet",
  ConversationEvalTemplateGet: "agent-evals domain has no SDK resource yet",
  ConversationEvalTemplateUpdate: "agent-evals domain has no SDK resource yet",
  ConversationEvalTemplateDelete: "agent-evals domain has no SDK resource yet",
  ConversationEvalTemplateClone: "agent-evals domain has no SDK resource yet",
  ConversationEvalTemplateAttach: "agent-evals domain has no SDK resource yet",
  ConversationEvalTemplateDetach: "agent-evals domain has no SDK resource yet",
  ConversationEvalScheduleCreate: "agent-evals domain has no SDK resource yet",
  ConversationEvalScheduleList: "agent-evals domain has no SDK resource yet",
  ConversationEvalScheduleUpdate: "agent-evals domain has no SDK resource yet",
  ConversationEvalScheduleDelete: "agent-evals domain has no SDK resource yet",
  ConversationEvalSchedulePause: "agent-evals domain has no SDK resource yet",
  ConversationEvalScheduleResume: "agent-evals domain has no SDK resource yet",
  ConversationEvalTriggerUpsert: "agent-evals domain has no SDK resource yet",
  ConversationEvalTriggerList: "agent-evals domain has no SDK resource yet",
  ConversationEvalTriggerDelete: "agent-evals domain has no SDK resource yet",
  ConversationEvalWebhookUpsert: "agent-evals domain has no SDK resource yet",
  ConversationEvalWebhookGet: "agent-evals domain has no SDK resource yet",
  ConversationEvalWebhookDelete: "agent-evals domain has no SDK resource yet",

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

  // ── Scores ───────────────────────────────────────────────────────────────
  ScoreRecord: "score recording has no SDK resource yet",
  ScoreList: "score recording has no SDK resource yet",

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
  DeploymentChatSessionCreate:
    "browser chat-session handshake — the SDK resource lands with the streaming surface it credentials",
  // Not an omission. This route is authenticated by a chat-session token in
  // `x-chat-session-token`, and `HttpClient.requestSSE` hardcodes `"api-key":
  // this.apiKey` — so this SDK cannot present the credential the route admits.
  // Its client is the browser, holding a token this SDK's caller minted for it,
  // and the frames are Vercel AI SDK chunks read by that library's own
  // transport rather than by a typed resource method.
  ChatSendMessageStream:
    "browser-authenticated SSE — the caller is a chat-session token in a browser, not this server-side SDK",
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
