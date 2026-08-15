import fs from "node:fs";
import path from "node:path";

import { ZPublicApiV1 } from "@nexus/types/public-api-v1";

/**
 * The v1 route table and the "does an SDK method call this route" matcher,
 * shared by the two gates that both need to know which routes the SDK reaches.
 *
 * `v1-routes-have-an-sdk-method.test.ts` asks whether a route is reached AT ALL.
 * `../types/v1-response-types-match-the-contract.test.ts` asks whether the
 * method that reaches it declares the right RETURN TYPE, and its population is
 * therefore the reached set. Two copies of this matcher would be two spellings
 * of one rule, and the drift between them would be silent in both directions —
 * a route counted reached by one gate and unreached by the other is a route
 * neither gate is really watching.
 *
 * ## Why `.conformance.ts` rather than a plain module
 *
 * This file imports `@nexus/types` and `node:fs`, and neither may reach the
 * published bundle. `wire-types-bundle.test.ts` matches unpublishable files by
 * SUFFIX — `.test.ts` and `.conformance.ts` — so this extension is what makes
 * the import legal rather than a comment promising nobody will import it from
 * `src/index.ts`.
 */

/** Source root of this package, scanned for call sites. */
const SDK_SRC = path.resolve(__dirname, "..");

/** A v1 descriptor carrying a verb and a path. */
export interface V1Route {
  name: string;
  method: string;
  path: string;
  /** True when the descriptor declares a `Response` schema. */
  hasResponse: boolean;
}

export function collectRoutes(): V1Route[] {
  const routes: V1Route[] = [];
  for (const [name, descriptor] of Object.entries(ZPublicApiV1 as Record<string, unknown>)) {
    const candidate: { method?: unknown; path?: unknown } = descriptor as {
      method?: unknown;
      path?: unknown;
    };
    if (typeof candidate.method === "string" && typeof candidate.path === "string") {
      routes.push({
        name,
        method: candidate.method,
        path: candidate.path,
        hasResponse: "Response" in (descriptor as object)
      });
    }
  }
  return routes;
}

/**
 * Every non-spec source file in this package, concatenated.
 *
 * 🚨 `.conformance.ts` is excluded and that exclusion is LOAD-BEARING, not
 * tidiness. This very file's docblocks quote call sites verbatim
 * (`"DELETE", \`/skills/external-tools/${id}${query}\``) to explain the matcher,
 * and a scan that read them would count those routes as reached BY THE
 * DOCUMENTATION — a false green produced by describing the gate. `.test.ts` was
 * already excluded for the same reason.
 *
 * It is behaviour-neutral for the sibling gate today: `packages/sdk/src` held no
 * `.conformance.ts` before this file, so nothing that was being scanned stopped
 * being scanned. The control is the unreached count, which must stay at the
 * ledger's size.
 */
function readSource(dir: string): string {
  let out = "";
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out += readSource(full);
    else if (
      full.endsWith(".ts") &&
      !full.endsWith(".test.ts") &&
      !full.endsWith(".conformance.ts")
    )
      out += fs.readFileSync(full, "utf8");
  }
  return out;
}

const SDK_SOURCE = readSource(SDK_SRC);

/**
 * Does a call site name this verb at this path?
 *
 * The contract spells a path `/public/v1/agents/:agentId`; the SDK strips the
 * `/public/v1` prefix (the http client re-adds it) and writes the parameter as
 * a template expression, so the same route reads `"GET", \`/agents/${id}\``.
 * Both transforms are applied here rather than in the ledger, so the ledger
 * stays a list of names.
 *
 * ## The trailing-expression clause, and why it is narrow
 *
 * A method that takes query parameters appends them inside the same template:
 * `"DELETE", \`/skills/external-tools/${id}${query}\``. Requiring the closing
 * delimiter immediately after the rewritten path therefore reported two real,
 * CLI-reachable methods as unreached, and they were ledgered — which is worse
 * than a missing gate, because a ledgered route is a route this gate has
 * stopped watching. Deleting either method would have gone unnoticed.
 *
 * So a trailing run of `${…}` expressions is allowed. **Literal characters are
 * not**, and that is what keeps the clause from swallowing a longer route: every
 * additional path segment begins with a literal `/`, so `/agents` still cannot
 * match a call site for `/agents/${id}` or `/agents/${id}/tools`.
 *
 * The change LOOSENS the matcher — strictly more call sites count as reached.
 * Since both gates built on it fail closed, loosening moves them toward
 * under-reporting, so the bound above is the load-bearing part rather than a
 * nicety. The prefix-collision fixture in the sibling test is what holds it.
 *
 * @param source - the text to search. Defaults to this package's own source;
 * the fixtures pass a literal so they assert about the MATCHER rather than
 * about whatever the SDK happens to contain today.
 */
export function reachedBySdk(
  method: string,
  routePath: string,
  source: string = SDK_SOURCE
): boolean {
  const relative = routePath.replace(/^\/public\/v1/, "");
  const escaped = relative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withParams = escaped.replace(/:[A-Za-z0-9_]+/g, "\\$\\{[^}]+\\}");
  return new RegExp(`"${method}",\\s*[\`"]${withParams}(?:\\$\\{[^}]+\\})*[\`"]`).test(source);
}
