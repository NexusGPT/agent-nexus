import { refuse } from "../../errors";
import { color } from "../../output";
import { askWouldHang, promptLine } from "../../util/confirm";
import { openUrl } from "../../util/open-url";
import { isCrossOrgToken, PLATFORM_OPERATOR_TOKEN_PREFIX } from "./_shared/token-prefixes";
import type { Prompter } from "./login.prompter";
import { SETTINGS_URL } from "./login.settings-url";
import { KEY_PROMPT, unseeableQuestionRefusal } from "./login.unseeable-question";

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
    // 🚨 THE GATE IS HERE, ABOVE `openUrl`, AND NOT AT THE `ask` BELOW. With it
    // at the ask, `nexus auth login >out.log 2>err.log` from a keyboard OPENED A
    // BROWSER WINDOW and printed a preamble for a login that then refused — a
    // side effect plus an error, which is not a refusal. `ask` keeps its own copy
    // of the test for the four later prompts; this is the one that has to fire
    // first. Inside `if (!apiKey)` on purpose: a `--api-key` run asks nothing, so
    // it must not be refused for a question it never reaches.
    if (askWouldHang()) throw unseeableQuestionRefusal(KEY_PROMPT);

    // 🚨 THE URL IS PART OF THE QUESTION. `Paste your API key (nxs_...):` is
    // unanswerable without the page the key comes from, so both branches'
    // preamble goes on the question's own stream — `nexus auth login > out.log`
    // otherwise showed the bare prompt on the terminal and put the address in
    // the file. `promptLine` exists for exactly this; see `util/confirm.stream`.
    if (process.stdin.isTTY) {
      promptLine(`Opening ${color.cyan(SETTINGS_URL)} ...`);
      promptLine("Create or copy an API key from the settings page.\n");
      openUrl(SETTINGS_URL);
    } else {
      promptLine(`Create or copy an API key at ${color.cyan(SETTINGS_URL)}\n`);
    }

    apiKey = (await ask(KEY_PROMPT)).trim();
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
