import { color, type RecordField } from "../../../output";
import { type VibeAppDto, type VibeAppEnvelopeExtras } from "../../../vibe-wire-types";
import { formatDeployability } from "./format-deployability";
import { formatShipGateMode } from "./format-ship-gate-mode";
import { formatTimestamp } from "./format-timestamp";

/**
 * The record rows `printVibeApp` prints, one builder per section, in the order
 * they are printed.
 *
 * Separate from the printer because the printer is four lines of plumbing and
 * these descriptors are where every trap lives — each one carries the reason a
 * row reads the field it reads, and those reasons are what a future edit has to
 * see before changing a row.
 */

/**
 * The row the printer reads keys off: the app, plus the envelope joins when the
 * read that produced it resolved them. `Partial` rather than an intersection,
 * because CREATE and UPDATE answer with a bare `{ app }` and the joins are
 * genuinely absent there — an intersection would type those two call sites as
 * carrying fields they do not have.
 */
export type VibeAppRow = VibeAppDto & Partial<VibeAppEnvelopeExtras>;

/** Which app this is, and where it deploys from. */
export function identityFields(): RecordField<VibeAppRow>[] {
  return [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "deployBranch", label: "Deploy branch" }
  ];
}

/**
 * The joins, and ONLY when the envelope actually carried them. CREATE and
 * UPDATE answer with a bare `{ app }`, and printing "Source: —" there would
 * assert the app has no git project when the read simply never asked.
 */
export function envelopeFields(
  extras: VibeAppEnvelopeExtras | undefined
): RecordField<VibeAppRow>[] {
  if (extras === undefined) return [];
  return [
    {
      key: "gitProject",
      label: "Source",
      format: () =>
        extras.gitProject === null
          ? color.dim("none")
          : `${extras.gitProject.name} (${extras.gitProject.status})`
    },
    {
      key: "deployability",
      label: "Deployability",
      format: () => formatDeployability(extras.deployability, extras.gitProject)
    }
  ];
}

/** What has to happen before a deploy lands. */
export function policyFields(app: VibeAppDto): RecordField<VibeAppRow>[] {
  return [
    {
      key: "requireApprovals",
      label: "Approvals",
      format: (v) => (v === true ? "required" : "off")
    },
    {
      // `shipGateMode`, NEVER the `requireVerification` boolean beside it. That
      // boolean is the server's compatibility projection of this same field and
      // it is lossy in one direction: `WARN` projects to `false`, so this row
      // printed `off` on an app that was reading its repository on every deploy
      // and writing DEPLOYMENT_VERIFICATION_WARNED. The table and the audit feed
      // disagreed and nothing said which was right.
      key: "shipGateMode",
      label: "Ship gate",
      // Read off `app` rather than the untyped `val` the printer hands in, so
      // the union — and the absent case — reach `formatShipGateMode` typed.
      format: () => formatShipGateMode(app.shipGateMode)
    }
  ];
}

/** How the app describes itself, and who is allowed to reach it. */
export function presentationFields(): RecordField<VibeAppRow>[] {
  return [
    { key: "description", label: "Description", format: (v) => (v === null ? "—" : String(v)) },
    { key: "publicUrl", label: "Public URL", format: (v) => (v === null ? "—" : String(v)) },
    {
      // "private (agent-tool only)" was true until a person could sign in to a
      // private app with their Nexus login. Printing it now would tell someone
      // their app is unreachable by humans when it is not.
      key: "visibility",
      label: "Visibility",
      format: (v) =>
        v === "PUBLIC" ? "public (no sign-in required)" : "private (sign-in or app token)"
    }
  ];
}

/**
 * `null` prints as "not checked yet", never as a tick. The probe only asks
 * about a healthy, settled deployment, so most apps are null most of the time —
 * and treating that as health is the silently-green failure the probe exists to
 * end. UNROUTED is the platform's own fault, so it says so.
 */
export function formatEdgeReachability(v: unknown): string {
  if (v === null || v === undefined) return color.dim("not checked yet");
  if (v === "UNROUTED") return color.red("running but unreachable (platform fault)");
  if (v === "ROUTED") return color.green("reachable");
  if (v === "UNAVAILABLE") return "nothing serving it yet";
  if (v === "NO_SUCH_APP") return "not published to the edge yet";
  return color.dim("last check was inconclusive");
}

/** What the platform is currently doing with the app. */
export function runtimeFields(app: VibeAppDto): RecordField<VibeAppRow>[] {
  const q = app.resourceQuotas;
  return [
    { key: "edgeReachability", label: "Edge", format: formatEdgeReachability },
    {
      key: "resourceQuotas",
      label: "Quotas",
      format: () => `cpu=${q.cpuMhz}mhz mem=${q.memoryMiB}mib max=${q.maxInstances}`
    }
  ];
}

/** When it appeared and when it last moved. */
export function timestampFields(): RecordField<VibeAppRow>[] {
  return [
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) },
    { key: "updatedAt", label: "Updated", format: (v) => formatTimestamp(String(v)) }
  ];
}
