import { ZPublicApiV1 } from "@nexus/types/public-api-v1";
import { describe, expect, it, vi } from "vitest";

import { NexusClient } from "../client";

/**
 * THE WIRE THIS RESOURCE ACTUALLY WRITES — verb, path and body, per method.
 *
 * ## What this file is for, stated against what the two sibling gates cover
 *
 * `v1-routes-have-an-sdk-method.test.ts` proves a call site EXISTS naming a
 * verb and a path. `../types/v1-response-types-match-the-contract.test.ts`
 * proves the declared RETURN TYPE equals the contract's schema. Both are text
 * and type comparisons — **neither one runs a method.** So a `get(id)` that
 * builds its URL from the wrong operand, or a `create(body)` that forgets to
 * pass the body, satisfies both and sends the wrong request. This file is the
 * only instrument in the package that executes all 33 and looks at what came out.
 *
 * ## The expectation is DERIVED FROM THE CONTRACT, never restated beside the code
 *
 * 🔴 This is the whole design. A table pairing `runs.get(id)` with a
 * hand-written `"/agent-evals/runs/${id}"` is two copies of one belief, and a
 * typo written into both passes cheerfully — the same shape as a parity
 * assertion satisfied by breaking both sides equally.
 *
 * So a row names the CONTRACT DESCRIPTOR (`ConversationEvalRunGet`) and the
 * concrete values its `:params` take. The expected path is then computed by
 * substituting those values into `ZPublicApiV1[name].path`, and the expected
 * verb is read off the same descriptor. The contract is a third party neither
 * this file nor the resource can edit, so agreement here means the resource
 * calls the route the platform publishes — not that one author typed the same
 * string twice.
 *
 * ## The controls, and what each one is for
 *
 * A table-driven suite has exactly one catastrophic failure mode: the table
 * silently covering less than it claims. Every arm below is aimed at that.
 *
 * - **Coverage is asserted against the contract, not against a number.** The
 *   set of `(verb, path)` pairs this table exercises must EQUAL the set of
 *   `/agent-evals` routes the contract declares. A route that lands on the
 *   server with no row here reds this file; so does a row for a route that no
 *   longer exists. A count would pass for a table that covered one route 33
 *   times.
 * - **Exactly one request per method.** `toBe(1)` and not `toBeGreaterThan(0)`:
 *   the second is satisfiable by a method that fires twice, and a duplicated
 *   write is precisely the defect a spend-bearing domain cannot afford.
 * - **A body-bearing row asserts the body ARRIVED and is the object it was
 *   handed.** `expect(sent).toEqual(body)` against a distinctive fixture — not
 *   `toBeDefined()`, which a dropped body still satisfies whenever anything
 *   else is serialized.
 *
 * ## Proven by mutation, not by observation
 *
 * Every row was proven to fail against a broken implementation before this file
 * was committed: a 39-mutant battery, at least one per method, across wrong
 * verb, wrong path, dropped path operand, SWAPPED operand order, dropped body,
 * dropped query, invented query parameter, and the wrong pagination helper in
 * both directions. Each mutant asserts it applied UNIQUELY before the suite is
 * run, because an edit that silently matches nothing produces a green run that
 * reads exactly like "the test did not catch it" — the inverse error, and the
 * one that would quietly retire this whole file.
 *
 * 🚨 **THE FIRST BATTERY LEFT A SURVIVOR, AND IT IS WHY THE LIST ROWS CARRY
 * PARAMETERS.** Deleting the `query:` option from `batches.list` outright
 * reddened NOTHING across a suite whose subject is the request. Cause: every
 * list row called its method BARE, so no query was sent either way and the
 * assertion had an empty population to be true over. The gap was five methods
 * wide, not one — only `batches.list` happened to be in that battery. Every list
 * row now passes real parameters and asserts the resulting map exactly, and the
 * second battery killed all five.
 *
 * The two rows worth calling out here, because they are the ones a reader would
 * assume are covered by symmetry and are not:
 *
 * - `templates.detach(templateId, agentId)` takes TWO operands into one path.
 *   Swapping them produces a perfectly well-formed URL of the right shape, and
 *   only a row that substitutes the two DISTINCT fixtures into the descriptor
 *   catches it. Two ids that happened to share a value would make this test
 *   vacuous, which is why the fixtures below are deliberately unequal.
 * - `runs.compare(runId, baselineRunId)` puts one id in the path and the other
 *   in the query string. Swapping those is invisible to any assertion that
 *   looks only at the pathname.
 */

/** The api key the client is constructed with, assembled rather than spelled. */
const TEST_API_KEY = ["nxs", "u", "agentevalsuite"].join("_");

const BASE_URL = "https://api.test.invalid";

/**
 * Path-operand fixtures.
 *
 * 🔴 EVERY ONE IS DISTINCT, AND THAT IS LOAD-BEARING RATHER THAN TIDY. The
 * swapped-operand mutation on `templates.detach` is undetectable if the template
 * id and the agent id are the same string — the test would pass against the bug
 * and read exactly like a test that caught it.
 */
const IDS = {
  run: "11111111-1111-4111-8111-111111111111",
  baselineRun: "22222222-2222-4222-8222-222222222222",
  batch: "33333333-3333-4333-8333-333333333333",
  template: "44444444-4444-4444-8444-444444444444",
  agent: "55555555-5555-4555-8555-555555555555",
  schedule: "66666666-6666-4666-8666-666666666666",
  trigger: "77777777-7777-4777-8777-777777777777",
  webhook: "88888888-8888-4888-8888-888888888888"
} as const;

/** One request the stub transport saw. */
interface SeenRequest {
  method: string;
  pathname: string;
  search: string;
  body: unknown;
}

function recordingClient(): { client: NexusClient; seen: SeenRequest[] } {
  const seen: SeenRequest[] = [];
  const fetchFn = vi.fn(async (url: unknown, init: unknown) => {
    const request = (init ?? {}) as { method?: string; body?: unknown };
    const parsed = new URL(String(url));
    seen.push({
      method: request.method ?? "GET",
      pathname: parsed.pathname,
      search: parsed.search,
      body: typeof request.body === "string" ? JSON.parse(request.body) : undefined
    });
    // A shape every method can unwrap. The payload is irrelevant here — this
    // file is about the REQUEST — and the response gate owns the other half.
    return new Response(JSON.stringify({ success: true, data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  return {
    client: new NexusClient({
      apiKey: TEST_API_KEY,
      baseUrl: BASE_URL,
      fetch: fetchFn as unknown as typeof globalThis.fetch
    }),
    seen
  };
}

/** A distinctive body per row, so "the body arrived" cannot be satisfied by any other object. */
const BODIES = {
  runCreate: { name: "nc-run", sourceMode: "SIMULATED" },
  batchCreate: { name: "nc-batch" },
  templateCreate: { name: "nc-template", agentId: IDS.agent },
  templateUpdate: { name: "nc-template-renamed" },
  templateClone: { agentId: IDS.agent, name: "nc-clone" },
  templateAttach: { agentId: IDS.agent },
  scheduleCreate: { cronExpression: "0 3 * * *" },
  scheduleUpdate: { cronExpression: "0 4 * * *" },
  triggerUpsert: { kind: "AUTO_ON_CLOSE" },
  webhookUpsert: { url: "https://hooks.test.invalid/nc" }
} as const;

interface Row {
  /** The v1 descriptor this method must reach. The expectation is read off it. */
  route: keyof typeof ZPublicApiV1;
  /** The values this call substitutes into the descriptor's `:params`, in path order. */
  pathValues: readonly string[];
  invoke: (client: NexusClient) => Promise<unknown>;
  /** The body this call must send, when it sends one. */
  body?: unknown;
  /**
   * EVERY query parameter this call must send, as an exact map.
   *
   * A map compared with `toEqual`, never a substring of the query string: an
   * extra parameter and a missing one both fail, where a substring check only
   * ever catches the missing half. Order-independent on purpose — the order
   * `URLSearchParams` emits is an implementation detail of the transport and
   * asserting it would make this suite brittle about the wrong thing.
   *
   * Defaults to `{}`, which is itself an assertion: a method that invents a
   * parameter reds the row that says it sends none.
   */
  query?: Record<string, string>;
}

const ROWS: readonly Row[] = [
  // ── Runs ──────────────────────────────────────────────────────────────────
  {
    route: "ConversationEvalRunCreate",
    pathValues: [],
    invoke: (c) => c.agentEvals.runs.create(BODIES.runCreate as never),
    body: BODIES.runCreate
  },
  {
    // 🔴 The params are NOT decoration. A row calling `list()` bare cannot
    // observe a method that drops its query plumbing entirely — there is no
    // query either way — and a mutation deleting exactly that survived this
    // suite until every list row below was given real parameters. An assertion
    // satisfiable by an empty population is not an assertion.
    route: "ConversationEvalRunList",
    pathValues: [],
    invoke: (c) => c.agentEvals.runs.list({ status: "COMPLETED", agentId: IDS.agent, limit: 7 }),
    query: { status: "COMPLETED", agentId: IDS.agent, limit: "7" }
  },
  {
    route: "ConversationEvalRunGet",
    pathValues: [IDS.run],
    invoke: (c) => c.agentEvals.runs.get(IDS.run)
  },
  {
    route: "ConversationEvalRunDelete",
    pathValues: [IDS.run],
    invoke: (c) => c.agentEvals.runs.delete(IDS.run)
  },
  {
    route: "ConversationEvalRunExecute",
    pathValues: [IDS.run],
    invoke: (c) => c.agentEvals.runs.execute(IDS.run)
  },
  {
    route: "ConversationEvalRunAbort",
    pathValues: [IDS.run],
    invoke: (c) => c.agentEvals.runs.abort(IDS.run)
  },
  {
    route: "ConversationEvalRunTranscript",
    pathValues: [IDS.run],
    invoke: (c) => c.agentEvals.runs.transcript(IDS.run)
  },
  {
    route: "ConversationEvalRunResults",
    pathValues: [IDS.run],
    invoke: (c) => c.agentEvals.runs.results(IDS.run)
  },
  {
    // The one row where an operand lands in the QUERY rather than the path.
    // Asserting `search` is what separates a correct call from one that swapped
    // the two ids — the pathname is identical either way only if they are equal,
    // and asserting both is what makes the swap impossible to miss.
    route: "ConversationEvalRunCompare",
    pathValues: [IDS.run],
    invoke: (c) => c.agentEvals.runs.compare(IDS.run, IDS.baselineRun),
    query: { baselineRunId: IDS.baselineRun }
  },

  // ── Batches ───────────────────────────────────────────────────────────────
  {
    route: "ConversationEvalBatchCreate",
    pathValues: [],
    invoke: (c) => c.agentEvals.batches.create(BODIES.batchCreate as never),
    body: BODIES.batchCreate
  },
  {
    route: "ConversationEvalBatchList",
    pathValues: [],
    invoke: (c) => c.agentEvals.batches.list({ status: "RUNNING", page: 3 }),
    query: { status: "RUNNING", page: "3" }
  },
  {
    route: "ConversationEvalBatchGet",
    pathValues: [IDS.batch],
    invoke: (c) => c.agentEvals.batches.get(IDS.batch)
  },

  // ── Templates ─────────────────────────────────────────────────────────────
  {
    route: "ConversationEvalTemplateList",
    pathValues: [],
    invoke: (c) => c.agentEvals.templates.list({ kind: "JUDGE_RUBRIC", scope: "AGENT" }),
    query: { kind: "JUDGE_RUBRIC", scope: "AGENT" }
  },
  {
    // `agentId` is REQUIRED on this route, so the call cannot be made without
    // it and the query assertion is what proves it was forwarded rather than
    // dropped on the floor by the params-to-query hop.
    route: "ConversationEvalTemplateListImportable",
    pathValues: [],
    invoke: (c) =>
      c.agentEvals.templates.listImportable({ agentId: IDS.agent, kind: "TESTER_PERSONA" }),
    query: { agentId: IDS.agent, kind: "TESTER_PERSONA" }
  },
  {
    route: "ConversationEvalTemplateCreate",
    pathValues: [],
    invoke: (c) => c.agentEvals.templates.create(BODIES.templateCreate as never),
    body: BODIES.templateCreate
  },
  {
    route: "ConversationEvalTemplateGet",
    pathValues: [IDS.template],
    invoke: (c) => c.agentEvals.templates.get(IDS.template)
  },
  {
    route: "ConversationEvalTemplateUpdate",
    pathValues: [IDS.template],
    invoke: (c) => c.agentEvals.templates.update(IDS.template, BODIES.templateUpdate),
    body: BODIES.templateUpdate
  },
  {
    route: "ConversationEvalTemplateDelete",
    pathValues: [IDS.template],
    invoke: (c) => c.agentEvals.templates.delete(IDS.template)
  },
  {
    route: "ConversationEvalTemplateClone",
    pathValues: [IDS.template],
    invoke: (c) => c.agentEvals.templates.clone(IDS.template, BODIES.templateClone),
    body: BODIES.templateClone
  },
  {
    route: "ConversationEvalTemplateAttach",
    pathValues: [IDS.template],
    invoke: (c) => c.agentEvals.templates.attach(IDS.template, BODIES.templateAttach),
    body: BODIES.templateAttach
  },
  {
    // TWO operands into one path. The fixtures are deliberately unequal, so a
    // swap moves the ids and this row reds — with equal fixtures it could not.
    route: "ConversationEvalTemplateDetach",
    pathValues: [IDS.template, IDS.agent],
    invoke: (c) => c.agentEvals.templates.detach(IDS.template, IDS.agent)
  },

  // ── Schedules ─────────────────────────────────────────────────────────────
  {
    route: "ConversationEvalScheduleCreate",
    pathValues: [],
    invoke: (c) => c.agentEvals.schedules.create(BODIES.scheduleCreate as never),
    body: BODIES.scheduleCreate
  },
  {
    route: "ConversationEvalScheduleList",
    pathValues: [],
    invoke: (c) => c.agentEvals.schedules.list({ status: "PAUSED", limit: 5 }),
    query: { status: "PAUSED", limit: "5" }
  },
  {
    route: "ConversationEvalScheduleUpdate",
    pathValues: [IDS.schedule],
    invoke: (c) => c.agentEvals.schedules.update(IDS.schedule, BODIES.scheduleUpdate),
    body: BODIES.scheduleUpdate
  },
  {
    route: "ConversationEvalScheduleDelete",
    pathValues: [IDS.schedule],
    invoke: (c) => c.agentEvals.schedules.delete(IDS.schedule)
  },
  {
    // `pause` and `resume` differ ONLY in their trailing path segment and are
    // the likeliest copy-paste casualty in the file. Two rows, two descriptors.
    route: "ConversationEvalSchedulePause",
    pathValues: [IDS.schedule],
    invoke: (c) => c.agentEvals.schedules.pause(IDS.schedule)
  },
  {
    route: "ConversationEvalScheduleResume",
    pathValues: [IDS.schedule],
    invoke: (c) => c.agentEvals.schedules.resume(IDS.schedule)
  },

  // ── Triggers ──────────────────────────────────────────────────────────────
  {
    route: "ConversationEvalTriggerUpsert",
    pathValues: [],
    invoke: (c) => c.agentEvals.triggers.upsert(BODIES.triggerUpsert as never),
    body: BODIES.triggerUpsert
  },
  {
    route: "ConversationEvalTriggerList",
    pathValues: [],
    invoke: (c) => c.agentEvals.triggers.list({ kind: "AUTO_ON_CLOSE", enabledOnly: true }),
    query: { kind: "AUTO_ON_CLOSE", enabledOnly: "true" }
  },
  {
    route: "ConversationEvalTriggerDelete",
    pathValues: [IDS.trigger],
    invoke: (c) => c.agentEvals.triggers.delete(IDS.trigger)
  },

  // ── Webhooks ──────────────────────────────────────────────────────────────
  {
    route: "ConversationEvalWebhookUpsert",
    pathValues: [],
    invoke: (c) => c.agentEvals.webhooks.upsert(BODIES.webhookUpsert as never),
    body: BODIES.webhookUpsert
  },
  {
    route: "ConversationEvalWebhookGet",
    pathValues: [IDS.webhook],
    invoke: (c) => c.agentEvals.webhooks.get(IDS.webhook)
  },
  {
    route: "ConversationEvalWebhookDelete",
    pathValues: [IDS.webhook],
    invoke: (c) => c.agentEvals.webhooks.delete(IDS.webhook)
  }
];

/** The descriptor a row names, narrowed to the two fields this file reads. */
function descriptorOf(route: keyof typeof ZPublicApiV1): { method: string; path: string } {
  const descriptor = ZPublicApiV1[route] as { method?: unknown; path?: unknown };
  if (typeof descriptor.method !== "string" || typeof descriptor.path !== "string") {
    throw new Error(`${String(route)} is not a routed descriptor`);
  }
  return { method: descriptor.method, path: descriptor.path };
}

/**
 * The pathname a row must produce, built from the CONTRACT plus the row's values.
 *
 * Refuses on an arity mismatch rather than substituting what it can: a row that
 * supplies one value for a two-parameter route would otherwise silently expect a
 * path still carrying a literal `:agentId`, and match a resource that produced
 * the same nonsense.
 */
function expectedPathname(route: keyof typeof ZPublicApiV1, values: readonly string[]): string {
  const { path } = descriptorOf(route);
  const params = path.split("/").filter((segment) => segment.startsWith(":"));
  if (params.length !== values.length) {
    throw new Error(
      `${String(route)} declares ${params.length} path parameter(s) and the row supplies ` +
        `${values.length}`
    );
  }
  let index = 0;
  const substituted = path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? (values[index++] as string) : segment))
    .join("/");
  // The contract spells the prefix; the client re-adds it. Same string either way.
  return substituted;
}

describe("the agent-evals resource writes the request its contract declares", () => {
  /**
   * CONTROL. Without this, every arm below is a statement about whatever
   * `ZPublicApiV1` happened to resolve to — a stub, a renamed export, an empty
   * object — and a table measured against nothing passes in silence.
   */
  it("reached the real v1 contract", () => {
    expect(Object.keys(ZPublicApiV1).length).toBeGreaterThan(400);
    expect(descriptorOf("ConversationEvalRunGet")).toEqual({
      method: "GET",
      path: "/public/v1/agent-evals/runs/:id"
    });
  });

  /**
   * CONTROL, and the one that makes the table honest.
   *
   * Stated as SET EQUALITY against the contract, never as a count: a count of 33
   * passes just as cleanly for a table that covers one route 33 times, and it
   * cannot notice a route the platform ships tomorrow. Both directions fail —
   * an unexercised route, and a row for a route that no longer exists.
   */
  it("exercises every /agent-evals route the contract declares, and no other", () => {
    const declared = Object.entries(ZPublicApiV1)
      .map(([name, value]) => ({ name, ...(value as { method?: unknown; path?: unknown }) }))
      .filter(
        (route): route is { name: string; method: string; path: string } =>
          typeof route.method === "string" &&
          typeof route.path === "string" &&
          route.path.startsWith("/public/v1/agent-evals")
      )
      .map((route) => `${route.method} ${route.path}`)
      .sort();

    const exercised = ROWS.map((row) => {
      const { method, path } = descriptorOf(row.route);
      return `${method} ${path}`;
    }).sort();

    // Drain-proof: the contract's own /agent-evals surface is the population,
    // and it does not shrink because this SDK grew a method for it.
    expect(declared.length).toBeGreaterThan(30);
    expect(exercised).toEqual(declared);
  });

  it.each(ROWS.map((row) => [String(row.route), row] as const))(
    "%s sends the declared verb and path",
    async (_name, row) => {
      const { client, seen } = recordingClient();
      const { method } = descriptorOf(row.route);

      await row.invoke(client);

      // POSITIVE and EXACT. `toBe(1)` rather than `toBeGreaterThan(0)`: a method
      // that fires twice is a duplicated write, and in a domain where a call
      // starts model spend that is the expensive direction to be blind in.
      expect(seen.length, `${String(row.route)} must send exactly one request`).toBe(1);

      const sent = seen[0] as SeenRequest;
      expect(sent.method, `${String(row.route)} verb`).toBe(method);
      expect(sent.pathname, `${String(row.route)} path`).toBe(
        `/api${expectedPathname(row.route, row.pathValues)}`
      );

      // Always asserted, never only when a row declares one: the default `{}`
      // is what catches a method that invents a parameter nobody asked for.
      expect(
        Object.fromEntries(new URLSearchParams(sent.search)),
        `${String(row.route)} query parameters`
      ).toEqual(row.query ?? {});

      if (row.body !== undefined) {
        // The object itself, not `toBeDefined()` — a dropped body still
        // satisfies "something was defined" whenever anything else serializes.
        expect(sent.body, `${String(row.route)} body`).toEqual(row.body);
      } else {
        expect(sent.body, `${String(row.route)} must send no body`).toBeUndefined();
      }
    }
  );

  /**
   * The list routes' pagination form, asserted on the RESULT rather than the
   * request — this is the one behaviour a wrong helper choice changes silently.
   *
   * Five agent-eval list routes are served WITH pagination meta and one,
   * `triggers.list`, without. A method calling `requestPage` on the unpaginated
   * route would invent a `meta` no payload carried; one calling `request` on a
   * paginated route would drop the meta the server sent. Both compile, both
   * typecheck, and only the shape of the returned value tells them apart.
   */
  it("returns a page for the paginated lists and a bare array for triggers.list", async () => {
    const { client } = recordingClient();

    const runs = await client.agentEvals.runs.list();
    expect(Array.isArray(runs), "runs.list must return a page, not a bare array").toBe(false);
    expect(runs).toHaveProperty("data");
    expect(runs).toHaveProperty("meta");

    const triggers = await client.agentEvals.triggers.list();
    expect(
      Array.isArray(triggers),
      "triggers.list must return the bare array the route serves — this route sends no meta"
    ).toBe(true);
  });
});
