import {
  type BaseUrlSource,
  loadConfig,
  resolveBaseUrlWithSource,
  resolveOrganization
} from "../config";

/**
 * Print the current configuration: base URL, masked API key, env.
 */
export async function whoamiCommand(): Promise<void> {
  const config = loadConfig();

  // The LABEL comes out of the same call as the value, for the same reason the
  // organization's does below: asking the environment a second time to decide
  // what to print is a second copy of the precedence, and a label derived
  // independently of the thing it labels is how a status surface names one host
  // while the bridge talks to another.
  //
  // It also fixes a case the old chain got wrong outright. `NEXUS_ENV=banana`
  // is not in the URL map, so the resolver fell through to production while the
  // label read `NEXUS_ENV=banana` — the one line whose job is saying where the
  // host came from, naming a selector that did not choose it.
  const { baseUrl, source: baseUrlSource } = resolveBaseUrlWithSource();
  const urlSource = labelFor(baseUrlSource);

  // Determine API key source + mask
  let keyDisplay = "(none)";
  let keySource = "";
  if (process.env.NEXUS_API_KEY) {
    keyDisplay = mask(process.env.NEXUS_API_KEY);
    keySource = "NEXUS_API_KEY env";
  } else if (config.apiKey) {
    keyDisplay = mask(config.apiKey);
    keySource = "config file";
  }

  // An org-unbound key (`nxs_p_` personal, `nxs_o_` platform-operator) carries no
  // organization at all, so with none selected the SERVER decides the tenant.
  // An org-scoped key answers from its own. Saying "the key's own organization
  // decides" for both hides the wrong-tenant case this block exists to surface.
  const apiKey = process.env.NEXUS_API_KEY ?? config.apiKey;
  const keyIsCrossOrg = apiKey !== undefined && /^nxs_[po]_/.test(apiKey);
  const orgFallbackLabel = (): string =>
    keyIsCrossOrg
      ? "(NONE SELECTED — this key is org-unbound, so the server picks the tenant)"
      : "(none — the key's own organization decides)";

  // The organization is a SECOND resolution and does not follow the key: an
  // org-unbound token acts on whichever one `organization-id` names. Printing
  // "which key" without "which organization" is how a bridge could look
  // correctly configured while answering from another tenant (NEX-3022).
  //
  // The LABEL comes out of the same call as the value. Asking the environment
  // a second time to decide what to print is a second copy of the precedence,
  // and a label derived independently of the thing it labels is how a status
  // surface reports one organization while the bridge talks to another
  // (NEX-2525 on the CLI side, NEX-4621 here).
  const { organizationId, source } = resolveOrganization();
  const orgSource = source === "env" ? "NEXUS_ORGANIZATION_ID env" : "profile (nexus auth use-org)";

  console.log(`  Base URL:  ${baseUrl} (${urlSource})`);
  console.log(`  API Key:   ${keyDisplay}${keySource ? ` (${keySource})` : ""}`);
  console.log(
    `  Org:       ${organizationId ?? orgFallbackLabel()}` +
      (organizationId ? ` (${orgSource})` : "")
  );
  console.log(`  Profile:   ${process.env.NEXUS_PROFILE ?? "(active profile)"}`);
  console.log(`  Env:       ${process.env.NEXUS_ENV ?? "(not set)"}`);
}

/**
 * The human name of the selector that chose the host.
 *
 * `env-name` interpolates the variable's VALUE, which is a read for DISPLAY and
 * not a second decision — the selection was already made by the resolver, and
 * this branch is only reached when that resolver says so.
 */
function labelFor(source: BaseUrlSource): string {
  switch (source) {
    case "env":
      return "NEXUS_BASE_URL env";
    case "config":
      return "config file";
    case "env-name":
      return `NEXUS_ENV=${process.env.NEXUS_ENV}`;
    case "default":
      return "default (production)";
  }
}

function mask(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}
