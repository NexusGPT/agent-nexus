import { refuse } from "../../errors";
import { color } from "../../output";
import { openUrl } from "../../util/open-url";
import { isCrossOrgToken, PLATFORM_OPERATOR_TOKEN_PREFIX } from "./_shared/token-prefixes";
import type { Prompter } from "./login.prompter";
import { SETTINGS_URL } from "./login.settings-url";

export interface ResolvedKey {
  readonly apiKey: string;
  readonly isPersonalToken: boolean;
  readonly isPlatformOperatorKey: boolean;
}

/**
 * Step 1 — obtain the API key and classify it.
 *
 * `null` means the run is over and the caller must return immediately: the exit
 * code is already set, exactly as the inline `return` this replaces did.
 */
export async function resolveApiKey(
  ask: Prompter["ask"],
  provided: string | undefined
): Promise<ResolvedKey | null> {
  // ── Step 1: Get API key ──────────────────────────────────────────
  let apiKey = provided;

  if (!apiKey) {
    console.log(`Opening ${color.cyan(SETTINGS_URL)} ...`);
    console.log("Create or copy an API key from the settings page.\n");
    openUrl(SETTINGS_URL);

    apiKey = (await ask("Paste your API key (nxs_...): ")).trim();
  }

  if (!apiKey) {
    process.exitCode = refuse("No key entered. Aborting.");
    return null;
  }

  if (!apiKey.startsWith("nxs_")) {
    process.exitCode = refuse(
      'Invalid key format — API keys start with "nxs_".\n' +
        "  nexus auth login --api-key nxs_YOUR_KEY"
    );
    return null;
  }

  // Both kinds are org-unbound and share every code path below; the flag
  // means "selects its org via the header", not "is a personal token".
  const isPersonalToken = isCrossOrgToken(apiKey);
  const isPlatformOperatorKey = apiKey.startsWith(PLATFORM_OPERATOR_TOKEN_PREFIX);

  return { apiKey, isPersonalToken, isPlatformOperatorKey };
}
