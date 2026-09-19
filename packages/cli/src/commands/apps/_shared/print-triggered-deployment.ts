import { color, printEnvelope, printRecord } from "../../../output";
import { type TriggerDeploymentResponse } from "../../../vibe-wire-types";
import { formatTimestamp } from "./format-timestamp";

export function printTriggeredDeployment(data: TriggerDeploymentResponse, appId: string): void {
  // 🚨 THE CALLBACK IS INLINE, AND EXTRACTING IT TO A NAMED HELPER BREAKS THE
  // GATE WITHOUT BREAKING THE CODE. `envelope-narrowing.scan.ts` exempts a
  // printer call SYNTACTICALLY INSIDE a `printEnvelope` callback; a printer one
  // function call away is not inside it, so a tidy `printTriggeredDeploymentFor
  // Human(data, appId)` here reads as an uncured narrowing and reds the build
  // while emitting exactly the same bytes. Measured, not guessed.
  printEnvelope(data, () => {
    // Defensive: the caller only reaches here after answering the question, so
    // a second confirmation_required means the org's state changed mid-flight.
    if (data.status === "confirmation_required") {
      console.log(color.yellow("Spend confirmation required — nothing was deployed."));
      console.log(`  ${data.reason.message}`);
      return;
    }

    const d = data.deployment;
    if (data.status === "reused") {
      // Say what did NOT happen, and why that is the right outcome. Without
      // this the operator sees a version number they did not expect and
      // re-runs, which is the exact loop that produced the duplicate.
      console.log(color.green("✓") + " Already deploying this commit — reusing it");
      console.log(
        color.dim(
          "  Nothing new was started: an app rolls out one deployment at a time, so a second\n" +
            "  one for the same commit leaves the first unplaced and it fails on the health\n" +
            "  timeout. Use --force-rebuild to build this commit again."
        )
      );
    } else {
      console.log(color.green("✓") + " Deployment triggered");
    }
    // No Builder row here on purpose: the build has not run yet, and which
    // strategy it will use is decided inside the executor over a checkout that
    // has not been cloned. It shows up on `apps deployment get` once the build
    // reports. This line used to print the requested builder, which the executor
    // never read.
    printRecord(d, [
      { key: "id", label: "Deployment" },
      { key: "versionNumber", label: "Version", format: (v) => `v${String(v)}` },
      { key: "status", label: "Status" },
      { key: "triggerSha", label: "Commit", format: (v) => String(v).slice(0, 7) },
      { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) }
    ]);

    if (data.approvalRequest !== null) {
      const r = data.approvalRequest;
      console.log(
        color.yellow(
          `\nApproval gate: ${r.status} — ${r.requiredApprovals} approval(s) required before it deploys.`
        )
      );
      console.log(color.dim("Review pending gates: nexus apps approvals pending"));
    }

    // Path B — surface tool registration at the natural moment. A hint, not a
    // blocking prompt: registration needs the app's OpenAPI spec (no auto-fetch
    // yet) and a HEALTHY deployment, which this trigger does not await.
    // Suppressed by NEXUS_NO_PROMPTS for non-interactive / scripted use.
    if (!process.env.NEXUS_NO_PROMPTS) {
      console.log(
        color.dim(
          `\nOnce healthy, register this app as an agent tool:\n  nexus apps register-as-tool ${appId} --spec-file ./openapi.json`
        )
      );
    }
  });
}
