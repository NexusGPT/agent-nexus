/**
 * THE CONFIG LAYER'S ONE SPECIFIER. Roughly seventy files import `./config`,
 * and this file is what keeps that true while each concern lives in its own
 * leaf below.
 *
 * ── WHY THIS INDEX DECLARES NOTHING ─────────────────────────────────────────
 *
 * 🔴 `import/no-cycle` IS ARMED ON THIS PACKAGE — from
 * `packages/config/eslint/base-flat.js`, not from the root `eslint.config.js`,
 * so grepping the root config for `import/` finds nothing and reads as "no
 * import rules exist". A re-export index that declares a shared value and whose
 * leaves then import it back costs ONE WARNING PER LEAF, against a package cap
 * of 9 with 8 already spent. So every value and every type is declared in a
 * LEAF, and this file holds `export … from` lines and nothing else.
 *
 * ── WHERE EACH RULE LIVES, BECAUSE TWO GATES NAME THEM BY PATH ──────────────
 *
 * Each precedence chain is ONE rule in ONE file, and the two gates that pin
 * them read that file off disk rather than importing it:
 *
 * | the rule                  | the file                 | its gate                                   |
 * | ------------------------- | ------------------------ | ------------------------------------------ |
 * | profile, API key, API host| `config-resolve.ts`      | `base-url-precedence-is-one-rule.test.ts`  |
 * | organization              | `config-organization.ts` | `organization-precedence-is-one-rule.test.ts` |
 * | dashboard host            | `config-dashboard-url.ts`| `config-nexus-env.test.ts` (behavioural)   |
 *
 * ⚠️ MOVING A RESOLVER OUT OF ITS FILE REDS ITS GATE RATHER THAN SLIPPING PAST
 * IT — both locate their subject by name and refuse a `null` region — but the
 * gate's hand-written path has to move WITH the code, or the census it runs is
 * a census of the wrong file.
 *
 * ── MODULE-LOAD TIMING IS PRESERVED AND IS LOAD-BEARING ─────────────────────
 *
 * `config-store.ts` resolves `~/.nexus-mcp/config.json` ONCE, from
 * `os.homedir()`, at module load. Several suites move `HOME` in a `vi.hoisted`
 * block before importing `./config` for that reason. Importing this index still
 * loads that leaf at the same instant, so the hoist keeps working.
 */

// The surface below is EXACTLY what `config.ts` exported before the split —
// nothing added. `URL_MAP`, `DASHBOARD_URL_MAP`, `isNexusEnvName` and
// `resolveEnvName` were private to this module and stay unreachable through it;
// they are exported from their leaf only because the two canon resolvers sit in
// different files from the tables, and `config-env-hosts.ts`'s own header says
// what importing them anywhere else would cost.
export {
  type DashboardUrlSource,
  resolveDashboardUrl,
  resolveDashboardUrlWithSource,
  type ResolvedDashboardUrl
} from "./config-dashboard-url";
export { dashboardHostPairedWith, NEXUS_ENV_NAMES, type NexusEnvName } from "./config-env-hosts";
export { assertKnownNexusEnv } from "./config-env-resolve";
export { findNexusRc, type NexusRcFile, removeNexusRc, writeNexusRc } from "./config-nexusrc";
export {
  type OrganizationSource,
  type ResolvedOrganization,
  resolveOrganization
} from "./config-organization";
export { slugifyProfileName, validateProfileName } from "./config-profile-name";
export {
  getProfile,
  listProfiles,
  removeProfile,
  saveProfile,
  setActiveProfile,
  setProfileOrganization
} from "./config-profiles";
export { resolveBaseUrl, resolveProfile } from "./config-resolve";
export { resolveApiKey } from "./config-resolve-api-key";
export { clearConfig, configFileState, loadConfig, saveConfig } from "./config-store";
export {
  type NexusConfigV2,
  type NexusProfile,
  type ProfileSource,
  type ResolvedProfile
} from "./config-types";
