import { color } from "../../../output";
import type { WatchAppVisibility } from "./watch-deployment-status";

/**
 * Say who may reach the URL that was just confirmed served.
 *
 * Apps are created PRIVATE, so the first thing an operator does after a
 * successful deploy — curl the URL — returns 401, the one status code that
 * reads as a broken deploy. Nothing in the success path said otherwise, so a
 * marker-watch could loop on MISS forever over a perfectly healthy rollout.
 *
 * This is the right place to intercept it and the only one: by the time this
 * prints, the watcher has already confirmed the app is served THROUGH the
 * tenant's own edge (see `wait-for-edge.ts`), so a 401 arriving after this
 * line is authorization and never reachability. The verdict itself was never
 * fooled — the edge prober matches a marker body on its own probe path rather
 * than fetching the app's URL — only the operator was.
 *
 * **A bare `curl -sI` is deliberately not offered as the private-app check.**
 * The response stamp naming the build (`X-Vibe-Deployment`) is set by a
 * middleware chained AFTER the authorizer — `middlewares=<authz>,<stamp>` in
 * `buildTraefikServiceTags` — and Traefik unwinds a chain right-to-left on the
 * response, so a denied request never reaches the stamp. A 401 therefore
 * carries no stamp at all, and pointing someone at one would hand them a
 * second absent signal to misread.
 *
 * Neither header is named literally here. `edge-token` prints the header to
 * send the token in, and the stamp is only meaningful once that token is
 * accepted — so the command is the durable reference and a hardcoded string
 * would be one more copy to drift.
 */
export function printServedVisibility(visibility: WatchAppVisibility, appId: string): void {
  if (visibility === "PUBLIC") {
    console.log(color.dim("  Public — anyone with the URL reaches it."));
    return;
  }

  console.log(color.dim("  Private — a plain GET of that URL answers 401 by design (the edge"));
  console.log(color.dim("  authorizer), not a failed deploy. Two checks that do work:"));
  console.log(color.dim(`    nexus apps edge-token ${appId}`));
  console.log(color.dim("      the token, and the header to send it in"));
  console.log(color.dim("    nexus --json apps list"));
  console.log(
    color.dim(`      .apps[] | select(.id == "${appId}") | .servingDeployment.triggerSha`)
  );
}
