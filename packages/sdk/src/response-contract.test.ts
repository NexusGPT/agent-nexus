import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { describe, expect, it } from "vitest";

import { HttpClient } from "./http-client";
import {
  checkResponse,
  compileManifest,
  type ContractReport,
  formatContractReport,
  matchRoute,
  type RouteShapeManifest
} from "./response-contract";

/**
 * The checker, against a manifest written by hand.
 *
 * A hand-written manifest rather than the shipped one, deliberately: a case
 * built from `V1_RESPONSE_CONTRACT` moves whenever the contract does, and a
 * fixture that changes underneath its assertion is how a suite starts testing
 * whatever the tree happens to hold. The shipped manifest has its own gate in
 * `response-contract.codegen.test.ts`.
 */
const MANIFEST: RouteShapeManifest = {
  "GET /widgets/:widgetId": {
    name: "WidgetGet",
    method: "GET",
    path: "/widgets/:widgetId",
    payload: {
      kind: "object",
      fields: { id: "s", label: "0s", size: "n", createdAt: "" },
      required: ["id", "label", "size"]
    }
  },
  "GET /widgets/archived": {
    name: "WidgetListArchived",
    method: "GET",
    path: "/widgets/archived",
    payload: { kind: "object", fields: { total: "n" }, required: ["total"] }
  },
  "GET /widgets": {
    name: "WidgetList",
    method: "GET",
    path: "/widgets",
    payload: {
      kind: "array",
      items: { kind: "object", fields: { id: "s" }, required: ["id"] }
    }
  },
  "DELETE /widgets/:widgetId": {
    name: "WidgetDelete",
    method: "DELETE",
    path: "/widgets/:widgetId",
    payload: { kind: "undeclared", why: "noResponse" }
  },
  "GET /widgets/:widgetId/export": {
    name: "WidgetExport",
    method: "GET",
    path: "/widgets/:widgetId/export",
    payload: { kind: "undeclared", why: "rawResponse" }
  }
};

const compiled = compileManifest(MANIFEST);
const check = (method: string, path: string, payload: unknown): ContractReport =>
  checkResponse(compiled, method, path, payload);

const VALID_WIDGET = { id: "w1", label: null, size: 3, createdAt: "2026-01-01" };

describe("matching a path to the route that publishes its shape", () => {
  const CASES: readonly { method: string; path: string; expected: string | null }[] = [
    { method: "GET", path: "/widgets/w1", expected: "WidgetGet" },
    // A LITERAL segment outranks a `:param` one. Resolving this to `WidgetGet`
    // would check one route's payload against another route's shape, which
    // reads as drift and is not.
    { method: "GET", path: "/widgets/archived", expected: "WidgetListArchived" },
    { method: "GET", path: "/widgets", expected: "WidgetList" },
    // `HttpClient` builds the query onto the URL rather than into `path`, but a
    // caller reaching `request()` directly may not.
    { method: "GET", path: "/widgets?limit=5", expected: "WidgetList" },
    { method: "get", path: "/widgets/w1", expected: "WidgetGet" },
    { method: "GET", path: "/widgets/w1/extra", expected: null },
    { method: "POST", path: "/widgets/w1", expected: null },
    { method: "GET", path: "/nothing-here", expected: null }
  ];

  it.each(eachOrRefuse(CASES, "the paths this matcher is pinned on"))(
    "$method $path",
    ({ method, path, expected }) => {
      expect(matchRoute(compiled, method, path)?.name ?? null).toBe(expected);
    }
  );
});

describe("a payload that matches its published shape", () => {
  it("passes", () => {
    expect(check("GET", "/widgets/w1", VALID_WIDGET)).toMatchObject({
      state: "passed",
      route: "WidgetGet"
    });
  });

  it("passes with an extra field the shape does not mention", () => {
    // A NEWER server adding a field is forward-compatible, and the CLI prints
    // it. Reporting it would train a reader to ignore the warning that matters.
    expect(check("GET", "/widgets/w1", { ...VALID_WIDGET, newField: 1 }).state).toBe("passed");
  });

  it("passes with an optional field absent", () => {
    const { createdAt: _absent, ...withoutOptional } = VALID_WIDGET;
    expect(check("GET", "/widgets/w1", withoutOptional).state).toBe("passed");
  });

  it("passes each sampled element of a list", () => {
    expect(check("GET", "/widgets", [{ id: "a" }, { id: "b" }]).state).toBe("passed");
  });
});

describe("a payload that has drifted from its published shape", () => {
  it("names a renamed required field", () => {
    const { id: _gone, ...renamed } = VALID_WIDGET;
    const report = check("GET", "/widgets/w1", { ...renamed, widgetId: "w1" });

    expect(report.state).toBe("mismatch");
    expect(report.route).toBe("WidgetGet");
    expect(report.issues?.[0]?.at).toBe("id");
    expect(report.issues?.[0]?.message).toContain("omits it");
  });

  it("names a retyped field, and says both types", () => {
    const report = check("GET", "/widgets/w1", { ...VALID_WIDGET, size: "3" });

    expect(report.state).toBe("mismatch");
    expect(report.issues).toHaveLength(1);
    expect(report.issues?.[0]?.at).toBe("size");
    expect(report.issues?.[0]?.message).toBe(
      "the route publishes number and the payload holds string"
    );
  });

  it("accepts every branch of a field the shape publishes as a union", () => {
    expect(check("GET", "/widgets/w1", { ...VALID_WIDGET, label: "x" }).state).toBe("passed");
    expect(check("GET", "/widgets/w1", { ...VALID_WIDGET, label: null }).state).toBe("passed");
    expect(check("GET", "/widgets/w1", { ...VALID_WIDGET, label: 7 }).state).toBe("mismatch");
  });

  it("names a payload that is the wrong kind entirely", () => {
    expect(check("GET", "/widgets/w1", [VALID_WIDGET])).toMatchObject({ state: "mismatch" });
    expect(check("GET", "/widgets", VALID_WIDGET).issues?.[0]?.message).toContain(
      "publishes an array"
    );
  });

  it("names the element, and its index, inside a list", () => {
    const report = check("GET", "/widgets", [{ id: "a" }, { widgetId: "b" }]);

    expect(report.state).toBe("mismatch");
    expect(report.issues?.[0]?.at).toBe("[1].id");
  });

  it("caps the issues it carries and keeps the true total", () => {
    const wide: RouteShapeManifest = {
      "GET /wide": {
        name: "Wide",
        method: "GET",
        path: "/wide",
        payload: {
          kind: "object",
          fields: Object.fromEntries([...Array(30)].map((_, i) => [`f${i}`, "s"])),
          required: [...Array(30)].map((_, i) => `f${i}`)
        }
      }
    };
    const report = checkResponse(compileManifest(wide), "GET", "/wide", {});

    expect(report.issues).toHaveLength(10);
    expect(report.issueCount).toBe(30);
    expect(formatContractReport(report)).toContain("and 20 more");
  });
});

describe("a payload nothing checked says so, and never says it passed", () => {
  const UNCHECKED: readonly { why: string; method: string; path: string }[] = [
    { why: "the route publishes no response schema", method: "DELETE", path: "/widgets/w1" },
    { why: "the route writes a raw response", method: "GET", path: "/widgets/w1/export" },
    { why: "no route matches the path at all", method: "GET", path: "/nothing-here" }
  ];

  it.each(eachOrRefuse(UNCHECKED, "the three ways a read goes unchecked"))(
    "$why",
    ({ method, path }) => {
      const report = check(method, path, { anything: true });
      expect(report.state).toBe("unchecked");
      expect(report.reason).toBeTruthy();
    }
  );

  it("makes an unchecked route distinguishable from one that passed", () => {
    // The whole point of the third state. A boolean verdict would report the
    // 113 schema-less routes as clean, which is the silence this replaces.
    expect(check("DELETE", "/widgets/w1", {}).state).not.toBe("passed");
    expect(check("GET", "/widgets/w1", VALID_WIDGET).state).toBe("passed");
  });

  it("makes no claim about a field the projection could not type", () => {
    // `createdAt` carries the empty code. It matches every value BY DESIGN — a
    // false red in a user's terminal teaches them to stop reading the warning.
    for (const value of [1, "x", null, {}, []]) {
      expect(check("GET", "/widgets/w1", { ...VALID_WIDGET, createdAt: value }).state).toBe(
        "passed"
      );
    }
  });
});

describe("the client hands back what the server sent, whatever the verdict", () => {
  const DRIFTED = { widgetId: "w1", label: "x", size: 3, brandNewField: [1, 2] };

  function clientReading(body: unknown, reports: ContractReport[]): HttpClient {
    return new HttpClient({
      baseUrl: "https://example.invalid",
      apiKey: "k",
      fetch: (async () =>
        new Response(JSON.stringify({ success: true, data: body }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })) as unknown as typeof globalThis.fetch,
      onResponseContract: (report) => reports.push(report)
    });
  }

  it("returns the drifted payload UNTOUCHED, every field of it", async () => {
    // The load-bearing assertion of the whole design. A checker that returned
    // its own parsed output would strip `brandNewField` — the exact drift this
    // exists to detect, wearing the cure.
    const reports: ContractReport[] = [];
    const data = await clientReading(DRIFTED, reports).request("GET", "/agents/abc");

    expect(data).toEqual(DRIFTED);
  });

  it("reports the mismatch on a real route of the shipped manifest", async () => {
    const reports: ContractReport[] = [];
    await clientReading(DRIFTED, reports).request("GET", "/agents/abc");

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ state: "mismatch", route: "AgentGet" });
  });

  it("checks nothing and reports nothing when no reporter is installed", async () => {
    // A published SDK must not start spending cycles because it was upgraded.
    const client = new HttpClient({
      baseUrl: "https://example.invalid",
      apiKey: "k",
      fetch: (async () =>
        new Response(JSON.stringify({ success: true, data: DRIFTED }), {
          status: 200
        })) as unknown as typeof globalThis.fetch
    });

    await expect(client.request("GET", "/agents/abc")).resolves.toEqual(DRIFTED);
  });

  it("survives a reporter that throws", async () => {
    // An observer that can fail a successful read is worse than no observer.
    const client = new HttpClient({
      baseUrl: "https://example.invalid",
      apiKey: "k",
      fetch: (async () =>
        new Response(JSON.stringify({ success: true, data: DRIFTED }), {
          status: 200
        })) as unknown as typeof globalThis.fetch,
      onResponseContract: () => {
        throw new Error("the sink is broken");
      }
    });

    await expect(client.request("GET", "/agents/abc")).resolves.toEqual(DRIFTED);
  });

  it("says a stream was unchecked, so an unexamined read is never silent", async () => {
    // The third read boundary. There is nothing to check a frame against, and
    // saying so is the difference between a named absence and a silent pass.
    const reports: ContractReport[] = [];
    const client = new HttpClient({
      baseUrl: "https://example.invalid",
      apiKey: "k",
      fetch: (async () =>
        new Response('data: {"delta":"hi"}\n\n', {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        })) as unknown as typeof globalThis.fetch,
      onResponseContract: (report) => reports.push(report)
    });

    const frames: unknown[] = [];
    for await (const frame of client.requestSSE("POST", "/agents/abc/stream")) frames.push(frame);

    expect(frames).toEqual([{ delta: "hi" }]);
    expect(reports).toHaveLength(1);
    expect(reports[0].state).toBe("unchecked");
    expect(reports[0].reason).toContain("per-frame schema");
  });

  it("says a 204 was unchecked rather than scoring a synthesized payload", async () => {
    const reports: ContractReport[] = [];
    const client = new HttpClient({
      baseUrl: "https://example.invalid",
      apiKey: "k",
      fetch: (async () =>
        new Response(null, { status: 204 })) as unknown as typeof globalThis.fetch,
      onResponseContract: (report) => reports.push(report)
    });

    await client.request("DELETE", "/agents/abc");

    expect(reports[0]).toMatchObject({ state: "unchecked" });
    expect(reports[0].reason).toContain("204");
  });
});
