import { color } from "../../../output";
import { type VisibilityChange } from "./visibility.handler";

// The re-register warning is the one thing a user cannot recover from by
// guessing: the old token silently stops working on a tool that looks
// configured.
//
// `register-as-tool` is deliberately NOT offered as the remedy. It
// refuses an app that already has a linked tool (409, and this warning
// fires only when one is linked), and it requires an OpenAPI spec — so
// a literal copy-paste of it fails twice over. Re-pointing the EXISTING
// tool's auth is the operation that repairs this, and it is the one
// `register-as-tool` performed when it baked the token in.
function renderToolResyncRepair(appId: string): void {
  console.log(
    color.yellow(
      "This app is registered as a tool. A fresh edge token was minted and the old one no longer works."
    )
  );
  console.log(
    color.yellow("  Re-point the tool at the new token (register-as-tool cannot — it 409s")
  );
  console.log(color.yellow("  on an app that already has one):"));
  console.log(color.dim(`    nexus apps edge-token ${appId}`));
  console.log(color.dim("      → the new token, and the header name to send it in"));
  console.log(color.dim(`    nexus --json apps get ${appId} | jq -r .linkedToolId`));
  console.log(color.dim("      → the tool to repair"));
  console.log(color.dim("    nexus external-tool update-auth <toolId> --body \\"));
  console.log(
    color.dim(
      `      '{"type":"service_http","authorization_type":"custom","custom_header_name":"<header>","apiKey":"<token>"}'`
    )
  );
}

/** The human rendering of a visibility write — silent under `--json`. */
export function renderVisibilityChange(
  appId: string,
  normalized: "private" | "public",
  target: "PRIVATE" | "PUBLIC",
  { priorVisibility, data }: VisibilityChange
): void {
  // Something actually changed iff the visibility moved, OR a token was
  // minted. The second half is not redundant: an app that is ALREADY
  // private but carries no token gets its first one here (the use case's
  // `needsFirstToken` exception), which the edge does begin enforcing —
  // so visibility alone would report that real change as a no-op.
  const tokenMinted = data.edgeToken !== null && data.edgeToken !== undefined;
  const changed = priorVisibility !== target || tokenMinted;

  if (!changed && priorVisibility !== null) {
    console.log(color.dim(`App was already ${normalized} — nothing changed.`));
    return;
  }

  console.log(
    normalized === "public"
      ? color.green("App is now public — anyone with the URL can open it.")
      : color.green("App is now private — a sign-in or the app token is required.")
  );
  // The flip is a WRITE, not an effect. What the edge enforces comes from
  // the authz table the agent republishes each reconcile pass, so until
  // that lands the edge is still applying the PREVIOUS visibility.
  //
  // Said for both directions, but it is `→ PRIVATE` that matters: an
  // operator locking an app down is doing something they believe took
  // effect on the return of this command, and for one pass it has not.
  //
  // Printed only when something really moved — see `changed` above.
  //
  // No duration is printed. The pass is `VIBE_AGENT_RECONCILE_INTERVAL_MS`
  // (default 15s) and a tenant may run any value, so a number here would
  // be this machine's default asserted as that tenant's behaviour.
  console.log(
    color.dim(
      normalized === "public"
        ? "  Not instant — until the tenant's edge picks up the change, callers without\n" +
            "  the token still get 401."
        : "  Not instant — until the tenant's edge picks up the change, the app stays\n" +
            "  reachable to anyone with the URL."
    )
  );
  if (data.toolResyncRequired) renderToolResyncRepair(appId);
}
