/**
 * The dashboard routes the web console publishes, as `@nexus/types` declares them.
 *
 * `dashboard-url.ts` builds the links this CLI returns, and `dashboard-url.test.ts`
 * holds every link it builds against these routes. That test cannot import
 * `@nexus/types` itself: `wire-types-bundle.test.ts` allows the import only in a
 * `*.conformance.ts` module, which the binary never reaches. So the contract is
 * re-exported here and the test reads it from this file.
 */
export { DASHBOARD_ROUTES, dashboardPathMatches } from "@nexus/types/api-envelope";
