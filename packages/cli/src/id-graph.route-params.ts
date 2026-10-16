/**
 * THE ROUTE VOCABULARY THE ID GRAPH DERIVES FROM. String work only — no leaves,
 * no contract, no commander, so a reader can check each rule against a route
 * literal and nothing else.
 *
 * `id-graph.ts` owns why a producer is found this way at all; these are the
 * three readings of a route that the two derived rules are built out of.
 */

/** The `:param` names of a route, in route order. */
export function routeParams(route: string): string[] {
  return route
    .split("/")
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.slice(1));
}

/** The route prefix ending immediately before `:param`. */
export function collectionPrefix(route: string, param: string): string | undefined {
  const segments = route.split("/");
  const index = segments.indexOf(`:${param}`);
  return index < 0 ? undefined : segments.slice(0, index).join("/");
}

/**
 * The plural resource spellings a param name could identify.
 *
 * `customModelId` -> `custom-models`; `roleId` -> `roles`. Both the camel and
 * the kebab spelling of the id suffix are stripped, because the tree carries
 * both (`agent-id` beside `agentId` beside a bare `id`).
 */
export function pluralsFor(param: string): Set<string> {
  const base = param.replace(/Id$/, "").replace(/-id$/, "");
  const kebab = base.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return new Set([`${kebab}s`, `${kebab}es`, kebab.replace(/y$/, "ies")]);
}
