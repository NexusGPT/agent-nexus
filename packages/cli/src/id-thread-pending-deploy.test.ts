/**
 * A PRODUCER WHOSE ROUTE IS DECLARED ABSENT BLOCKS ITS CONSUMERS AS
 * PENDING_DEPLOY — AND NOTHING ELSE DOES.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE SECOND CONSUMER OF ONE DECLARATION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `cli-sweep` runs TWO sweeps. `scripts/sweep.sh` executes a declared leaf
 * directly and reports it PENDING — that half is held by
 * `sweep-routes-pending-deploy-self-retire.test.ts`. `scripts/id-thread-sweep.ts`
 * then threads CONSUMERS from producer leaves, and a producer that cannot be
 * served blocks every one of them.
 *
 * 🔴 MEASURED on the promotion's own run, job 112571200244: the first sweep
 * passed `59 pass · 5/5 declared skip · 0 warn · 0 fail · 1/1 pending deploy`,
 * and the second failed in the SAME JOB —
 * `FAILED mcp-server get   producer ``mcp-server list`` failed: { "error": {
 * "message": "Not found: Cannot GET /api/public/v1/mcp-servers" …`. One
 * undeployed route, two sweeps, and only one of them knew about the declaration.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE DANGEROUS DIRECTION IS A PRODUCER FAILURE WRONGLY EXCUSED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A missing excuse is loud: the consumer goes red and somebody looks. An excuse
 * that is too WIDE is silent and permanent, and it is worse here than in the
 * first sweep, because ONE producer blocks SEVERAL consumers — so a broadened
 * matcher turns a whole fan-out green at once. `mcp-server list` feeding
 * `mcp-server get` is one consumer today; `agentId` feeds three.
 *
 * So the cases are lopsided on purpose: one proves the declared absence is
 * accepted, and the rest prove that things resembling it are not.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY `planThread` IS THE SUBJECT AND NOT THE RUNNER
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `scripts/id-thread-sweep.ts` ends in `main()`, so importing it RUNS the sweep
 * and nothing in it can be reached by a spec — that module's own header says so,
 * and it is why the refusal parser, the outcome mapping, the race verdict and the
 * thread plan have each had to move into `src/`. The decision under test is the
 * thread plan's, and it is pure.
 *
 * The runner's half — asking the matcher, and only for a DECLARED producer — is
 * covered by `routeAbsenceVerdict`'s own arms below, which execute the shell file
 * `sweep.sh` sources rather than a copy of its pattern.
 */
import { describe, expect, it } from "vitest";

import { SWEEP_ROUTES_PENDING_DEPLOY } from "./command-universe";
import type { ThreadableLeaf } from "./id-graph.model";
import { resolvePendingDeployProducers, type RouteAbsenceReader } from "./id-graph.pending-deploy";
import { planThread } from "./id-graph.thread";
import { type RouteAbsenceVerdict, routeAbsenceVerdict } from "./route-not-deployed";

/**
 * A consumer threading one id from one producer — the shape that occurs.
 *
 * 🚨 BUILT, NEVER CAST. The first version of this helper asserted `as
 * ThreadableLeaf` over an object missing `method`, `route` and `fullyResolved`,
 * and `tsc` refused it with "neither type sufficiently overlaps" — correctly. A
 * cast would have silenced a real statement about the fixture: that it was not
 * the thing the subject receives. Every field is supplied, so the subject under
 * test is handed what the runner hands it.
 */
function consumer(path: string, producer: string, param = "serverId"): ThreadableLeaf {
  return {
    path,
    method: "GET",
    route: `/public/v1/${path.split(" ")[0]}s/:${param}`,
    sources: [
      {
        kind: "producer-leaf",
        param,
        leaf: producer,
        // `ParamSource`'s producer arm carries the producer's OWN route, which is
        // the collection prefix the consumer's route extends. tsc refused the
        // fixture three times for missing a field, and each refusal was a true
        // statement: a cast would have asserted this object IS what the subject
        // receives while it demonstrably was not.
        route: `/public/v1/${producer.split(" ")[0]}s`
      }
    ],
    fullyResolved: true
  };
}

const CONSUMER = consumer("mcp-server get", "mcp-server list");
const ROUTE = "/api/public/v1/mcp-servers";

/**
 * The document `printCliError` emits under `--json`, built rather than spelled.
 *
 * 🚨 EVERY KEY THE EMITTER CARRIES, AND THAT IS NOT TIDINESS.
 * `error-envelope-help-is-true.test.ts` scans this package for descriptions of
 * the error envelope and refuses any fragment that names SOME of the live keys —
 * on the grounds that a partial description is a false one. It caught two
 * fixtures here that named `message` alone, and it was right twice over: they
 * were also less like real CLI output than the thing they stood in for, which is
 * the whole value of a fixture.
 */
function cliError(message: string, code: string): string {
  return JSON.stringify({ error: { message, hint: null, code } });
}

const ABSENCE = cliError(`Not found: Cannot GET ${ROUTE}`, "NOT_FOUND");

/** A producer that broke, with nothing declared about it. */
const BROKE = new Map([["mcp-server list", ABSENCE]]);
/** …and the runner's verdict that the break IS the declared absence. */
const DECLARED = new Map([["mcp-server list", ROUTE]]);

describe("a declared-absent producer blocks its consumers as PENDING_DEPLOY", () => {
  it("blocks the consumer PENDING_DEPLOY, naming the route and the producer", () => {
    const plan = planThread(CONSUMER, new Map(), BROKE, new Map(), DECLARED);

    expect(plan.kind).toBe("blocked");
    if (plan.kind !== "blocked") throw new Error("unreachable — asserted above");
    expect(plan.status).toBe("PENDING_DEPLOY");
    // The report has to name both: which producer could not be served, and which
    // path is absent. A note with neither sends the reader to the consumer.
    expect(plan.note).toContain("mcp-server list");
    expect(plan.note).toContain(ROUTE);
    expect(plan.note).toContain("DECLARED pending-deploy");
  });

  // ── The ones that must stay FAILED ────────────────────────────────────────

  it("FAILS a broken producer that is UNDECLARED — nothing is exempt by shape", () => {
    // 🔴 THE LOAD-BEARING ONE. Same producer, same refusal, same sentence — the
    // only difference is that nobody declared it. A branch keyed on the SHAPE of
    // the refusal rather than on the declaration would turn every absent route
    // green, including the ones nobody has accepted.
    const plan = planThread(CONSUMER, new Map(), BROKE, new Map(), new Map());

    expect(plan.kind).toBe("blocked");
    if (plan.kind !== "blocked") throw new Error("unreachable — asserted above");
    expect(plan.status).toBe("FAILED");
    expect(plan.note).toContain("producer `mcp-server list` failed");
  });

  it("FAILS a DIFFERENT producer that broke, even while another is declared", () => {
    // A leaf threading a producer nobody declared must not inherit a sibling's
    // acceptance. A map lookup keyed on the wrong thing — or a boolean "something
    // is pending" flag — passes the case above and fails this one.
    const other = consumer("workflow node-type", "workflow list", "workflowId");
    const broke = new Map([["workflow list", ABSENCE]]);
    const plan = planThread(other, new Map(), broke, new Map(), DECLARED);

    expect(plan.kind).toBe("blocked");
    if (plan.kind !== "blocked") throw new Error("unreachable — asserted above");
    expect(plan.status).toBe("FAILED");
  });

  it("threads NORMALLY when the producer did not break — so it cannot go stale", () => {
    // 🔴 THE SELF-RETIRING HALF, AND IT IS STRUCTURAL RATHER THAN A SECOND
    // DETECTOR. This branch is reachable only while the producer is FAILING, so
    // the day the route deploys the producer answers, the plan is `ready`, and
    // the consumer is actually tested — the acceptance expires by construction
    // and cannot be left excusing anything.
    //
    // The DECLARATION outliving its reason is caught by `sweep.sh`, which
    // executes the producer leaf directly and reds with STALE PENDING-DEPLOY in
    // this same job. One stale detector, not two — a second would be a second
    // place for the same verdict to live.
    const bodies = new Map([
      ["mcp-server list", JSON.stringify({ data: [{ serverId: "srv-1" }] })]
    ]);
    const plan = planThread(CONSUMER, bodies, new Map(), new Map(), DECLARED);

    expect(plan.kind).toBe("ready");
    if (plan.kind !== "ready") throw new Error("unreachable — asserted above");
    expect(plan.args).toEqual(["srv-1"]);
  });

  it("keeps SKIPPED_NO_ID for a producer that ANSWERED with no rows", () => {
    // An empty list is not an absent route, and the declaration must not blur
    // them: "nothing existed to test with" and "the route is not deployed" are
    // different facts with different remedies.
    const bodies = new Map([["mcp-server list", JSON.stringify({ data: [] })]]);
    const plan = planThread(CONSUMER, bodies, new Map(), new Map(), DECLARED);

    expect(plan.kind).toBe("blocked");
    if (plan.kind !== "blocked") throw new Error("unreachable — asserted above");
    expect(plan.status).toBe("SKIPPED_NO_ID");
  });
});

describe("the runner's verdict comes from the shell matcher, not a TS copy", () => {
  it("binds a route the SHELL matcher reads as a literal path", () => {
    // The vacuity control for every case below, and it asks the MATCHER rather
    // than a copy of the matcher's grammar. A route the shell cannot read as a
    // literal path answers `unmeasured` for every transcript there is, so each
    // arm below would be a question nobody put.
    //
    // 🚨 IT DOES NOT READ `SWEEP_ROUTES_PENDING_DEPLOY`, AND THAT IS THE POINT.
    // This block scores the MATCHER, whose behaviour is a function of the route
    // it is handed and of nothing the repository happens to declare — so a floor
    // on that declaration is not a control on anything here. An EMPTY map is the
    // mechanism's resting state (it fires once per declaration, at a deploy), and
    // a floor would red every arm in this block on the day the last entry
    // retires, while leaving every REFUSES arm below passing over a route of `""`
    // — a negative assertion satisfied by a haystack that could never have held
    // the string.
    expect(routeAbsenceVerdict(ABSENCE, ROUTE)).not.toBe("unmeasured");
  });

  it("holds every DECLARED route to the same bar — a drift guard, never a floor", () => {
    // Whatever is declared has to be a path this matcher can bind, or the sweep's
    // acceptance applies to nothing. Empty at rest: this loop scores the
    // declarations that exist, and the arm above is what makes the block mean
    // something when there are none.
    for (const { route } of Object.values(SWEEP_ROUTES_PENDING_DEPLOY)) {
      const absence = cliError(`Not found: Cannot GET ${route}`, "NOT_FOUND");
      expect(routeAbsenceVerdict(absence, route)).toBe("absent");
    }
  });

  it("says `absent` for the declared path", () => {
    expect(routeAbsenceVerdict(ABSENCE, ROUTE)).toBe("absent");
  });

  it("says `other` for a 404 naming a SIBLING path", () => {
    // 🔴 The discriminator. A producer calling the wrong route is a real defect,
    // and its 404 is otherwise indistinguishable from the accepted one.
    const sibling = cliError(`Not found: Cannot GET ${ROUTE}-not-this-one`, "NOT_FOUND");
    expect(routeAbsenceVerdict(sibling, ROUTE)).toBe("other");
  });

  it("says `other` for a 401 and for a 500 on the declared producer", () => {
    // An expired CI key refuses every producer at once. Excusing that would
    // report a whole fan-out as pending-deploy and exit 0.
    expect(
      routeAbsenceVerdict(
        cliError("Authentication failed — invalid or missing API key.", "UNAUTHENTICATED"),
        ROUTE
      )
    ).toBe("other");
    expect(
      routeAbsenceVerdict(cliError("API error (500): Internal server error", "INTERNAL"), ROUTE)
    ).toBe("other");
  });

  it("says `unmeasured`, never `other`, for a declaration that is not a literal path", () => {
    // 🚨 A THIRD ANSWER. `.*` would match every 404 in the sweep; a status that
    // read as `other` would leave a typo'd declaration looking like a producer
    // failing for its own reasons, and the runner must not excuse it either way.
    expect(routeAbsenceVerdict(ABSENCE, ".*")).toBe("unmeasured");
  });

  it("is the SHELL file's answer — it refuses to be satisfied by a TS regex dialect", () => {
    // The pattern is POSIX ERE and carries `[[:space:]]`, which JavaScript's
    // RegExp reads as a class of `[ : s p a c e` plus a literal `]`. So a TS twin
    // of it compiles, reads correctly, and matches no real document. This arm
    // pins the fact that makes the shell the single definition.
    const posix = new RegExp('"message":[[:space:]]*"Not found: Cannot [A-Z]+ /api/x"');
    expect(posix.test('"message": "Not found: Cannot GET /api/x"')).toBe(false);
    // …while the shell matcher, asked the same question, answers correctly.
    expect(
      routeAbsenceVerdict(cliError("Not found: Cannot GET /api/x", "NOT_FOUND"), "/api/x")
    ).toBe("absent");
  });
});

describe("resolvePendingDeployProducers admits only a confirmed declared absence", () => {
  const DECLARATION = {
    "mcp-server list": { route: ROUTE, cause: "lands with this branch" }
  } as const;
  /** A stub reader, so the decision is scored without a subprocess per case. */
  const says =
    (verdict: RouteAbsenceVerdict): RouteAbsenceReader =>
    () =>
      verdict;

  it("admits a declared producer whose failure IS the absence", () => {
    const pending = resolvePendingDeployProducers(BROKE, DECLARATION, says("absent"));
    expect([...pending]).toEqual([["mcp-server list", ROUTE]]);
  });

  it("refuses `other` — a declaration is not an amnesty for any other failure", () => {
    // 🔴 ONE producer blocks SEVERAL consumers, so excusing a 401 or a 500 here
    // turns a whole fan-out green at once. That is worse than the single-leaf
    // case in the first sweep, not equal to it.
    expect([...resolvePendingDeployProducers(BROKE, DECLARATION, says("other"))]).toEqual([]);
  });

  it("refuses `unmeasured` — nothing may be excused on a question nobody put", () => {
    // A declaration that is not a literal path was never asked about. Treating
    // that as an absence would splice an unvalidated string into a regex; treating
    // it as `other` is the loud direction and is what this returns.
    expect([...resolvePendingDeployProducers(BROKE, DECLARATION, says("unmeasured"))]).toEqual([]);
  });

  it("never ASKS about an undeclared producer", () => {
    // The declaration is the key, never the shape of the refusal. A reader that
    // was consulted for an undeclared producer would excuse every absent route,
    // including the ones nobody accepted — so this counts the calls.
    const asked: string[] = [];
    const reader: RouteAbsenceReader = (_transcript, route) => {
      asked.push(route);
      return "absent";
    };
    const broke = new Map([["workflow list", ABSENCE]]);
    expect([...resolvePendingDeployProducers(broke, DECLARATION, reader)]).toEqual([]);
    // 🚨 THE ARM. An empty result alone is satisfied by a reader that was asked
    // and said no; this proves the undeclared producer was never put to it.
    expect(asked).toEqual([]);
  });

  it("is EMPTY when nothing broke, however much is declared", () => {
    expect([...resolvePendingDeployProducers(new Map(), DECLARATION, says("absent"))]).toEqual([]);
  });
});
