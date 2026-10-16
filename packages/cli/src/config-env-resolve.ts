import { isNexusEnvName, NEXUS_ENV_NAMES, type NexusEnvName } from "./config-env-hosts";
import { CategorizedCliError } from "./exit-codes";

/**
 * The environment `NEXUS_ENV` names, or `production` when it is unset.
 *
 * 🔴 AN UNRECOGNISED NAME IS REFUSED, NEVER RESOLVED. The `?? URL_MAP.production`
 * this replaces sent `NEXUS_ENV=staging` to PRODUCTION — exit 0, no host on
 * screen, and `nexus admin … set` writing to the live tenant base. Every typo
 * did the same, because the fallback made a name that was TYPED
 * indistinguishable from one that was never set.
 *
 * Unset therefore still means `production`: the default was never the defect.
 *
 * ⚠️ AND SO DOES EMPTY, AND SO DOES WHITESPACE — `??` DEFAULTS ON `undefined`
 * AND `null` ONLY. `NEXUS_ENV=""` is not a typo anybody made; it is what CI
 * templating produces from a variable that does not exist
 * (`NEXUS_ENV: ${{ vars.NEXUS_ENV }}`, `NEXUS_ENV=$UNSET`, `export NEXUS_ENV=`).
 * Refusing those would break callers who never chose anything, which is the
 * opposite of this function's point. `raw || "production"` is the wrong
 * spelling of the cure: `nexus/truthy-default-swallows-zero` is a live rule in
 * this package and an explicit test says what is meant anyway.
 *
 * Case is still SIGNIFICANT: `"STAGING"` refuses. A name nobody serves reaching
 * production quietly is the defect; strictness about case is the cure.
 *
 * `"CLI_UNKNOWN_NEXUS_ENV"` is spelled literally, as `"CLI_NOT_AUTHENTICATED"`
 * is in `config-profile-lookup.ts` — `errors-cli-codes.ts` owns the registry,
 * and those two strings are the config layer's only contact with it.
 */
export function resolveEnvName(raw: string | undefined): NexusEnvName {
  const trimmed = raw?.trim();
  const value = trimmed === undefined || trimmed === "" ? "production" : trimmed;
  if (isNexusEnvName(value)) return value;
  throw new CategorizedCliError(
    "invalid-input",
    "CLI_UNKNOWN_NEXUS_ENV",
    `NEXUS_ENV is set to "${value}", which is not an environment this CLI knows. ` +
      `Accepted: ${NEXUS_ENV_NAMES.join(", ")}.`,
    `Unset NEXUS_ENV, or set it to one of ${NEXUS_ENV_NAMES.join(", ")}. ` +
      `To pin hosts directly instead: --base-url / NEXUS_BASE_URL for the API, ` +
      `--dashboard-url / NEXUS_DASHBOARD_URL for the console — they are separate ` +
      `chains, and pinning one does not answer for the other.`
  );
}

/**
 * Refuse an unrecognised `NEXUS_ENV` NOW, before a command does anything.
 *
 * 🔴 A REFUSAL THAT ARRIVES AFTER A WRITE IS WORSE THAN NO REFUSAL. The two
 * resolvers walk INDEPENDENT chains and each reaches {@link resolveEnvName}
 * last, so `resolveBaseUrl` can short-circuit on any of four earlier terms — an
 * override, a named profile, `NEXUS_BASE_URL`, or an ACTIVE PROFILE carrying a
 * `baseUrl` and no `dashboardUrl`, which needs no flag and no env var at all —
 * while `resolveDashboardUrl` falls all the way through and throws. Roughly
 * sixteen commands build their console link AFTER the mutating call, so the
 * resource was created and the process then exited non-zero: a script reads
 * that as a failed create and retries, and the retry duplicates the resource.
 *
 * The root `preAction` hook in `index.ts` calls this, so the refusal lands
 * before any action handler runs and nothing can be written first. The throws
 * inside both resolvers stay as defence in depth — with this in place they are
 * unreachable from a CLI invocation, which is the state to keep them in.
 */
export function assertKnownNexusEnv(): void {
  resolveEnvName(process.env.NEXUS_ENV);
}
