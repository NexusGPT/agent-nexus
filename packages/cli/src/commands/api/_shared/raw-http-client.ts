import { HttpClient } from "@agent-nexus/sdk";
import { V1_RESPONSE_CONTRACT } from "@agent-nexus/sdk/v1-response-contract";
import type { OptionValues } from "commander";

import { timeoutSecondsToMs } from "../../../client";
import { resolveBaseUrl, resolveOrganization, resolveProfile } from "../../../config";
import { createContractReporter } from "../../../contract-warnings";
import { createApiDeprecationReporter } from "../../../route-deprecation-warnings";

/**
 * The raw passthrough's own transport.
 *
 * Its own, rather than `createClient`'s: this command reaches a route the typed
 * commands do not, so it resolves the key, the tenant and the contract here and
 * the comments below are the reasons each of those four options is spelled the
 * way it is.
 */
export function createRawHttpClient(globals: OptionValues): HttpClient {
  // The key AND the tenant it acts on, from ONE resolution of the chain.
  // `resolveApiKey` used to stand here alone, so this command sent a key
  // with no `organization-id` beside it and every org-scoped route
  // answered 403 ORGANIZATION_REQUIRED for a personal (`nxs_p_`) token —
  // including in a shell exporting NEXUS_ORGANIZATION_ID, and while
  // `nexus agent list` on the same key in the same shell returned 200.
  // Same defect, same cure as the vibe transport's (#4845).
  //
  // `globals.apiKey` is passed THROUGH `resolveProfile` rather than
  // short-circuited: it returns on an explicit key at step 1 without
  // loading config, so a headless caller with no config file still cannot
  // be made to create one — and the key still reaches `resolveOrganization`,
  // which reads NEXUS_ORGANIZATION_ID first. That is the only way an
  // `--api-key` override can name an org at all, since `auth use-org`
  // refuses to store one for it.
  const resolved = resolveProfile({
    apiKey: globals.apiKey,
    profile: globals.profile,
    baseUrl: globals.baseUrl
  });
  const { organizationId } = resolveOrganization(resolved.profile);
  return new HttpClient({
    baseUrl: resolveBaseUrl(globals.baseUrl, globals.profile),
    apiKey: resolved.profile.apiKey,
    // Spread conditionally, never `?? ""`. The guard's
    // `extractOrganizationId` requires `length > 0`, so a blank header
    // refuses IDENTICALLY to an absent one — the cost of `?? ""` is not a
    // wrong refusal, it is a header that every proxy log, trace and
    // `curl -v` shows as a selection that was never made.
    ...(organizationId ? { defaultHeaders: { "organization-id": organizationId } } : {}),
    // The global --timeout is in seconds; this command's former local
    // --timeout <ms> was replaced by it (NEX-2760) so the flag cannot
    // mean two different units depending on where it sits in argv.
    timeout: timeoutSecondsToMs(globals.timeout),
    onResponseContract: createContractReporter(),
    // `nexus api <path>` is the ONE door that reaches a route this CLI has
    // no typed command for, so it is the likeliest door onto a deprecated
    // one — leaving it unwired would make the warning reach everything
    // except the raw caller. See `../route-deprecation-warnings.ts`.
    onDeprecation: createApiDeprecationReporter(),
    // Supplied rather than bundled — see the same pair in `../client.ts`.
    responseContract: V1_RESPONSE_CONTRACT
  });
}
