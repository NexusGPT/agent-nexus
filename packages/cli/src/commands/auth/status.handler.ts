import type { Command } from "commander";

import { resolveBaseUrl, resolveOrganization, resolveProfile } from "../../config";
import { reportFailure } from "../../errors";
import { isJsonMode } from "../../output";
import { isCrossOrgToken, PLATFORM_OPERATOR_TOKEN_PREFIX } from "./_shared/token-prefixes";
import { verifyStatusCredential } from "./status.probe";
import { printStatusHuman, printStatusJson } from "./status.render";
import type { StatusView } from "./status.view";

/** The whole of `nexus auth status`: resolve, verify, then render one document. */
export async function runStatus(options: { verify: boolean }, program: Command): Promise<void> {
  try {
    const globals = program.optsWithGlobals();
    const resolved = resolveProfile(globals);

    const sourceExplanation: Record<string, string> = {
      flag: "--profile flag",
      env: "NEXUS_PROFILE environment variable",
      directory: `.nexusrc at ${resolved.rcPath}`,
      active: "active profile in config",
      default: 'fallback to "default" profile',
      override: "--api-key flag or NEXUS_API_KEY env"
    };

    const isCrossOrg =
      resolved.profile.personalToken === true || isCrossOrgToken(resolved.profile.apiKey);
    const isOperator = resolved.profile.apiKey.startsWith(PLATFORM_OPERATOR_TOKEN_PREFIX);

    // The organization the NEXT request will name, not the one the profile
    // happens to store: NEXUS_ORGANIZATION_ID is the per-shell org selector
    // and every command already obeys it. Reporting `profile.orgId` here
    // while the client sent the env's value made this command — the one
    // asked "which org am I in" — the only place that answered wrongly
    // (NEX-2525).
    const org = resolveOrganization(resolved.profile);
    // A stored orgName describes the PROFILE's organization. When the env
    // selects a DIFFERENT one, that name belongs to another tenant, and
    // printing it beside this id names the wrong customer — the same trap
    // `setProfileOrganization` documents. No name is better than a wrong one.
    const orgName =
      org.organizationId === resolved.profile.orgId ? resolved.profile.orgName : undefined;
    // Never the key itself, on either channel — the same eight-and-four
    // masking the human line has always used.
    const maskedKey = `${resolved.profile.apiKey.slice(0, 8)}...${resolved.profile.apiKey.slice(-4)}`;
    // Hoisted: the probe, the document and the human line must all name the
    // SAME host. Resolving it three times is three chances to disagree, and
    // a verdict reported against a host the reader was not shown is the
    // defect this command exists to close, one level down.
    //
    // 🚨 THROUGH THE CANON, WITH BOTH GLOBALS. This read `resolved.profile
    // .baseUrl ?? resolveBaseUrl()` — a third precedence that put the profile
    // above `NEXUS_BASE_URL` and dropped `--base-url` on the floor entirely.
    // Measured: `auth status --base-url <A> --profile beta` reported beta's
    // stored host while `agent list` with the same flags reached <A>. The one
    // command whose job is answering "where am I pointed" computed it a second
    // way and was the only surface that could not answer (NEX-2525's shape,
    // one dimension over).
    const baseUrl = resolveBaseUrl(globals.baseUrl, globals.profile);

    const { probe, refusal } = await verifyStatusCredential(options, globals, baseUrl, resolved);

    const view: StatusView = {
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
    };
    if (isJsonMode()) {
      printStatusJson(view);
      return;
    }
    printStatusHuman(view);
  } catch (err) {
    // `resolveProfile` refusing to find a credential at all — no profiles
    // configured, or a named one that does not exist. The probe itself never
    // throws; every one of its failures is a member of its return union.
    process.exitCode = reportFailure("not-authenticated", (err as Error).message);
  }
}
