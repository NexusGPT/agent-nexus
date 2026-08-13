import type { KnownIssuesForRouteResponse } from "../types/known-issues";
import { BaseResource } from "./base-resource";

/**
 * "What is known to be broken on the command I just ran."
 *
 * Platform data, identical for every caller — these are defects in the product,
 * not rows belonging to an organization. The call is still authenticated and
 * needs the `tickets:read` scope.
 */
export class KnownIssuesResource extends BaseResource {
  /**
   * Published issues affecting one CLI route.
   *
   * `route` is the CLI's own dotted route id — `workflow.node.test` — derived
   * from commander's parent chain. The server constrains it to dot-separated
   * lowercase names and answers 400 on anything else, so an arbitrary search
   * term cannot be sent here and read back as "nothing is broken".
   *
   * 🔴 An empty `issues` with `polled: false` means the provider has not been
   * read yet, NOT that the route is clean. Check `polled` before you render an
   * absence as good news.
   */
  async forRoute(route: string): Promise<KnownIssuesForRouteResponse> {
    return this.http.request<KnownIssuesForRouteResponse>("GET", "/known-issues", {
      query: { route }
    });
  }
}
