import { reportFailure } from "../../errors";
import { color, printRecord } from "../../output";
import type { StatusView } from "./status.view";

/** The `--json` document for `nexus auth status`. */
export function printStatusJson(view: StatusView): void {
  const {
    resolved,
    sourceExplanation,
    isCrossOrg,
    isOperator,
    orgName,
    org,
    maskedKey,
    baseUrl,
    probe,
    refusal
  } = view;

  // ── The document ────────────────────────────────────────────────
  //
  // `auth status` is the FIRST command an agent runs, and under --json it
  // answered with seven lines of prose: unparseable, at exit 0, so the
  // caller could tell neither which profile was loaded nor that anything
  // was wrong. Every fact the human lines carry is a field here, including
  // the two the reader has to act on — whether the token reaches other
  // organizations, and whether the org identity was ever cached.
  // A failed verification is the error document and NOTHING ELSE — one
  // document on stdout is a promise of this CLI, and a caller branching
  // on `.error` must not have to also check a `verified` field it might
  // not know about. The refusal message carries the profile name and the
  // host, which is what the record would have told it.
  if (refusal) {
    process.exitCode = reportFailure(refusal.cause, refusal.message, refusal.hint);
    return;
  }
  printRecord({
    profile: resolved.name,
    source: resolved.source,
    sourceDescription: sourceExplanation[resolved.source],
    tokenType: isCrossOrg ? (isOperator ? "platform-operator" : "personal") : "organization-scoped",
    orgName: orgName ?? null,
    orgId: org.organizationId ?? null,
    // Which selector chose that org: "env" (NEXUS_ORGANIZATION_ID, this
    // shell only), "profile" (stored, shared by every session on this
    // machine), or "token" (nothing selected — the key's own org).
    orgSource: org.source,
    userEmail: resolved.profile.userEmail ?? null,
    apiKey: maskedKey,
    baseUrl,
    // 🚨 THREE VALUES, NEVER TWO. `true` means the API accepted this key
    // just now; `null` means `--no-verify` and NOBODY ASKED. A check
    // that did not run must not wear a clean result — `false` would say
    // the key was judged and failed, which is a different fact and one
    // this document never reports (a failed check is the error document
    // above, at a non-zero exit).
    verified: probe === null ? null : true,
    // The org/user fields above are the profile's CACHE. `whoami`
    // refreshes them; an absent identity means "never resolved", not
    // "no organization" — and `verified: true` says nothing about how
    // old they are.
    identityCached: Boolean(resolved.profile.orgName ?? resolved.profile.orgId)
  });
  return;
}

/** The human rendering of `nexus auth status`. */
export function printStatusHuman(view: StatusView): void {
  const {
    resolved,
    sourceExplanation,
    isCrossOrg,
    isOperator,
    orgName,
    org,
    maskedKey,
    baseUrl,
    probe,
    refusal
  } = view;

  const orgPart = orgName ? ` (${orgName})` : "";
  console.log(
    `Using profile ${color.cyan(`"${resolved.name}"`)}${orgPart} — ${color.dim(sourceExplanation[resolved.source])}`
  );
  // The stored flag is absent for a key supplied via --api-key or
  // NEXUS_API_KEY (source "override"), which writes no profile — so gating
  // on it alone meant the cross-tenant credential went unlabelled in
  // exactly the ad-hoc invocation most likely to be a one-off against
  // someone else's tenant. `use-org` already resolves this the same way.
  if (isCrossOrg) {
    // The two org-unbound kinds are NOT interchangeable to the reader:
    // one reaches your own orgs, the other reaches every tenant on the
    // platform and audits each request. Printing both as "personal token"
    // hides which credential is loaded, which is the thing `status` is for.
    console.log(
      `  ${color.dim("type:")} ${
        isOperator ? "platform-operator key (any org, audited)" : "personal token (cross-org)"
      } — ${color.dim('switch org with "nexus auth use-org <orgId>"')}`
    );
  }
  if (org.organizationId) {
    const via =
      org.source === "env" ? color.dim(" (from NEXUS_ORGANIZATION_ID, this shell only)") : "";
    console.log(`  ${color.dim("org id:")} ${org.organizationId}${via}`);
  }
  if (resolved.profile.userEmail) {
    console.log(`  ${color.dim("user:")} ${resolved.profile.userEmail}`);
  }
  console.log(`  ${color.dim("key:")} ${maskedKey}`);
  console.log(`  ${color.dim("api:")} ${baseUrl}`);

  // The human channel prints the resolution FIRST and the verdict after,
  // on both outcomes. "Which profile is dead" is the fact a reader needs
  // and the one a bare refusal cannot carry — and the `--json` funnel
  // keeps this from becoming two documents on stdout.
  if (refusal) {
    process.exitCode = reportFailure(refusal.cause, refusal.message, refusal.hint);
    return;
  }
  if (probe === null) {
    // An unrun check must announce itself. Silence here reads as a pass,
    // which is the exact false green `--no-verify` is allowed to produce.
    console.log(
      color.dim("\n  NOT VERIFIED — --no-verify skipped the live check. The key may be dead.")
    );
  } else {
    console.log(`\n  ${color.green("verified")} ${color.dim(`— the API accepted this key`)}`);
  }
  if (!resolved.profile.orgName && !resolved.profile.orgId) {
    console.log(color.dim('  Run "nexus auth whoami" to resolve and cache org/user identity.'));
  }
}
