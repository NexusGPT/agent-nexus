import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it, vi } from "vitest";

/**
 * 🚨 HOISTED, BEFORE THE IMPORT BELOW. `config.ts` computes its config directory
 * from `os.homedir()` at MODULE LOAD, so moving `HOME` inside a `beforeAll` is
 * too late — the profile cases then read the developer's real config, find
 * neither profile, and fall through to the ambient env var. Measured: the named
 * profile case answered `https://ambient.test` and read as a genuine failure of
 * the code rather than of the fixture.
 */
const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-dashboard-url-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import { DASHBOARD_PATHS, dashboardUrlFor } from "./dashboard-url";

/**
 * THE GATE UNDER `dashboard-url.ts` — every pattern is a route the SPA declares.
 *
 * The whole argument for returning a `dashboardUrl` field rather than printing
 * a pattern into `--help` is that ONE copy of the pattern is something a gate
 * can hold. This is that gate. Without it the field is the same hand-copied
 * pattern as before, one package further from the router, and wearing the
 * authority of a computed value.
 *
 * ── WHY IT READS THE ROUTE TABLE AND NOT A LIST ─────────────────────────────
 *
 * `apps/frontend/src/routes.tsx` is an explicit literal `path -> import` table
 * by deliberate design — its own header says so — so the paths can be read out
 * of it without a bundler, a parser or a running app. A hand-written list of
 * "routes we believe exist" beside it is the exact defect this file exists to
 * catch, one directory over.
 *
 * ⚠️ THIS IS A CI GATE, NOT A RUNTIME ONE. A published tarball carries `dist/`
 * and no `apps/`, so the check SKIPS when the monorepo is absent — and it skips
 * LOUDLY rather than passing, because a green tick over a check that read
 * nothing is the reading this repository refuses everywhere else.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const ROUTES = path.resolve(here, "../../../apps/frontend/src/routes.tsx");

/** Every `"app/..."` literal the SPA registers, normalised to a leading slash. */
function declaredRoutes(): string[] {
  const text = fs.readFileSync(ROUTES, "utf8");
  return [...text.matchAll(/"(app\/[A-Za-z0-9:/*.-]+)"/g)].map((m) => `/${m[1]}`);
}

/**
 * Would the SPA's `route` match a URL built from `pattern`?
 *
 * 🚨 THIS IS AN INSTANCE TEST, NOT AN EQUALITY, AND THE DIFFERENCE IS THE AGENT
 * LINK. The SPA declares `/app/my-agents/:agent-id/tabs/:tab-key`, and the
 * pattern this CLI ships pins the second parameter to a LITERAL — `prompt`.
 * Comparing normalised shapes reports that as a mismatch, which is the opposite
 * of the truth: a concrete value in a parameter slot is exactly what the route
 * is for.
 *
 * So a route segment matches when it is a parameter (`:x`), or when it is the
 * same literal. `{id}` on this side is a parameter too. The control below is
 * what keeps that from degenerating into "everything matches": a renamed first
 * segment is a literal-vs-literal mismatch and still fails.
 */
function routeAccepts(route: string, pattern: string): boolean {
  const left = route.split("/");
  const right = pattern.split("/");
  if (left.length !== right.length) return false;

  return left.every((segment, index) => {
    if (segment.startsWith(":")) return true;
    return segment === right[index] || right[index] === "{id}";
  });
}

describe("dashboard-url — every pattern is a route the SPA actually declares", () => {
  const monorepo = fs.existsSync(ROUTES);

  it("finds the SPA route table (this gate is worthless without it)", () => {
    // A skip that reads as a pass is how a check dies quietly. If the file moves,
    // this case names the path it looked for.
    expect(monorepo, `no route table at ${ROUTES} — running outside the monorepo?`).toBe(true);
  });

  it("reads a plausible number of routes, so a broken regex cannot pass", () => {
    if (!monorepo) return;
    // CONTROL. A regex that matched nothing would make every case below vacuous:
    // an empty haystack contains no counter-example either.
    expect(declaredRoutes().length).toBeGreaterThan(50);
  });

  for (const [resource, pattern] of Object.entries(DASHBOARD_PATHS)) {
    it(`${resource} -> ${pattern}`, () => {
      if (!monorepo) return;
      const accepted = declaredRoutes().filter((route) => routeAccepts(route, pattern));
      expect(accepted, `no SPA route matches ${pattern}`).not.toHaveLength(0);
    });
  }

  it("CONTROL — a route the SPA does not declare is NOT matched", () => {
    if (!monorepo) return;
    const renamed = "/app/my-agents-renamed/{id}/tabs/prompt";
    expect(declaredRoutes().filter((route) => routeAccepts(route, renamed))).toHaveLength(0);
  });

  it("CONTROL — a tab key the agent page does not offer is NOT matched", () => {
    if (!monorepo) return;
    // The route table alone cannot catch a wrong tab: `:tab-key` accepts any
    // string, so `/tabs/promt` passes the check above. The tab list is the only
    // place that knows, and both keys this CLI links to must be in it.
    const view = path.resolve(here, "../../../apps/frontend/src/modules/Profiles/ProfileView.tsx");
    expect(fs.existsSync(view), `no ProfileView at ${view}`).toBe(true);

    const keys = [...fs.readFileSync(view, "utf8").matchAll(/key:\s*"([a-z-]+)"/g)].map(
      (m) => m[1]
    );
    expect(keys.length).toBeGreaterThan(3);
    expect(keys).toContain("prompt");
    expect(keys).toContain("skills");
    expect(keys).not.toContain("promt");
  });
});

describe("dashboard-url — building the link", () => {
  const override = { dashboardUrl: "https://example.test" };

  it("substitutes the id and honours the --dashboard-url override", () => {
    expect(dashboardUrlFor("workflow", "wf-1", override)).toBe(
      "https://example.test/app/workflows/wf-1"
    );
  });

  it("strips a trailing slash from the override rather than doubling it", () => {
    expect(dashboardUrlFor("workflow", "wf-1", { dashboardUrl: "https://example.test/" })).toBe(
      "https://example.test/app/workflows/wf-1"
    );
  });

  it("answers undefined rather than a URL with a hole in it", () => {
    // `/app/workflows/undefined` renders an error page at 200, which is a worse
    // outcome than no link at all: it looks openable.
    expect(dashboardUrlFor("workflow", undefined, override)).toBeUndefined();
    expect(dashboardUrlFor("workflow", "", override)).toBeUndefined();
  });

  it("builds the id-less library link without an id", () => {
    expect(dashboardUrlFor("documents", undefined, override)).toBe(
      "https://example.test/app/documents"
    );
  });

  it("escapes an id that would otherwise change the path", () => {
    expect(dashboardUrlFor("workflow", "a/b", override)).toBe(
      "https://example.test/app/workflows/a%2Fb"
    );
  });
});

describe("dashboard-url — the link follows --profile, like the request does", () => {
  /**
   * 🚨 THE LINK AND THE REQUEST MUST NAME THE SAME ENVIRONMENT.
   * `resolveBaseUrl(globals.baseUrl, globals.profile)` sends the request to the
   * named profile's host. A link builder that reads only `--dashboard-url`
   * resolves the ACTIVE profile instead, so `--profile staging` creates the
   * resource on staging and hands back a production URL — which opens, shows
   * the wrong org, and reads as a write that never happened.
   *
   * Driven through a real config file rather than a mock, because the defect
   * lived in `resolveProfile`'s argument list and a mocked resolver would have
   * been given the right arguments by the test itself.
   */
  fs.mkdirSync(path.join(SANDBOX, ".nexus-mcp"), { recursive: true });
  fs.writeFileSync(
    path.join(SANDBOX, ".nexus-mcp", "config.json"),
    JSON.stringify({
      activeProfile: "prod",
      profiles: {
        prod: { apiKey: "nxs_prod", dashboardUrl: "https://prod.test" },
        staging: { apiKey: "nxs_staging", dashboardUrl: "https://staging.test" }
      }
    })
  );
  // The env var must NOT win over an explicit --profile, exactly as it does not
  // for --base-url. Setting it is what makes that assertable.
  vi.stubEnv("NEXUS_DASHBOARD_URL", "https://ambient.test");

  afterAll(() => {
    vi.unstubAllEnvs();
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  });

  it("uses the NAMED profile's dashboard, not the active one", () => {
    expect(dashboardUrlFor("workflow", "wf-1", { profile: "staging" })).toBe(
      "https://staging.test/app/workflows/wf-1"
    );
  });

  it("CONTROL — with no --profile it falls back, so the case above measured something", () => {
    // Without the named profile the ambient env var wins. A green above with an
    // identical answer here would prove nothing about the profile argument.
    expect(dashboardUrlFor("workflow", "wf-1", {})).toBe("https://ambient.test/app/workflows/wf-1");
  });

  it("CONTROL — the fixture is really being read", () => {
    // If HOME had not moved before `config.ts` loaded, no profile would resolve
    // and every case here would fall through to the ambient value — including
    // the one above, which would then be green for the wrong reason.
    expect(dashboardUrlFor("workflow", "wf-1", { profile: "prod" })).toBe(
      "https://prod.test/app/workflows/wf-1"
    );
  });

  it("an explicit --dashboard-url still outranks the profile", () => {
    expect(
      dashboardUrlFor("workflow", "wf-1", { dashboardUrl: "https://flag.test", profile: "staging" })
    ).toBe("https://flag.test/app/workflows/wf-1");
  });

  it("an unknown profile falls through instead of throwing", () => {
    expect(dashboardUrlFor("workflow", "wf-1", { profile: "nope" })).toBe(
      "https://ambient.test/app/workflows/wf-1"
    );
  });
});
