import type { WaitForThreadResult } from "@agent-nexus/sdk";

import { waitDocumentFields } from "../../channel/template-wait.document-fields";

/**
 * The one document a wait produces, on every outcome including the timeout.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE WAITING KEYS ARE THE PACKAGE'S, NOT THIS VERB'S
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `timedOut` used to be spread in only when it was `true`, so an absent key meant
 * EITHER "this run did not time out" OR "this build of the CLI cannot say". A
 * consumer could not tell those apart and had to guess, and the guess breaks in
 * silence the day the key is renamed or dropped.
 *
 * That is the same defect `COMPATIBILITY.md` already forbids in the error
 * document, and `src/errors-document.ts` states the rule this file now follows:
 * "EVERY KEY IS REQUIRED. AN OPTIONAL KEY IS A SECOND SHAPE WEARING ONE NAME" —
 * "a field that is present for some failures and absent for others forces every
 * consumer to write a presence check before it can branch."
 *
 * The three keys and their derivation are NOT redeclared here. They are the ones
 * `channel/template-wait.document-fields.ts` already publishes for the three
 * WhatsApp-template verbs — `wait`, `waited`, `timedOut` — and that module's own
 * argument is why this file imports it rather than copying it: "Correcting the
 * two laggards in place would leave three copies that happen to agree, and the
 * defect was never that they disagreed on a particular day — it is that nothing
 * stopped them." A fourth caller spelling its own version is that same defect
 * with a fourth copy.
 *
 * ── WHY `waited` IS A LITERAL `true` ──────────────────────────────────────────
 *
 * This document only exists on the branch of `chat.handler.ts` that has already
 * called `waitForThread`, so there is no `WaitForThreadResult` to hand this
 * function without a poll having run. `not-requested` is therefore unreachable
 * HERE and the key ships anyway, for the reason `template-create.document.ts`
 * gives at its own unconditional poll: a consumer reading every verb with one
 * expression is the point.
 *
 * ── WHY EVERY NON-TIMEOUT OUTCOME IS `settled` ────────────────────────────────
 *
 * `settled` asks whether the poll got the answer it was waiting for, never
 * whether the answer was good news — the same reading the shared module defends,
 * where a `failed` delivery is `resolved` because no further wait moves it.
 *
 * `WaitForThreadResult.outcome` has four members and three of them are the poll
 * reaching its declared target:
 *
 *   · `terminal`          — the thread reached a status it never leaves.
 *   · `assistant-replied` — the reply this turn was waiting for arrived.
 *   · `generating`        — the assistant answered and the PROMPT is still being
 *                           written. The SDK returns this ONLY under
 *                           `until: "assistant-reply"`, which is exactly the
 *                           target the no-`--wait` path declares; `--wait` asks
 *                           `until: "prompt"` and polls straight through it. So
 *                           it is a wait that ended ON its target, not one that
 *                           gave up short of it.
 *   · `timed-out`         — the budget was spent with the status still moving.
 *
 * ⚠️ A TIMEOUT IS NOT A FAILURE. The server is still working and the caller
 * resumes with `nexus prompt-assistant get-thread <id> --wait`;
 * `wait-exit-code.ts` turns the same fact into exit `8`, off this same outcome,
 * so the number and this `wait` key cannot disagree.
 *
 * ── WHY `promptResult` STAYS CONDITIONAL ──────────────────────────────────────
 *
 * 🔴 IT IS NOT THE SAME CASE, AND THE LINE BETWEEN THEM IS WHETHER ABSENCE HAS TO
 * BE READ AS A VALUE. `timedOut` absent had to be decoded as `false` — absence
 * was carrying a boolean, which is the guess this change removes. `promptResult`
 * absent carries nothing: it is a PAYLOAD that genuinely does not exist until the
 * prompt is written, and "no payload" is what absence natively means. The
 * terminal state a consumer branches on is already spelled out by `status` and
 * `wait`, so nothing is inferred from this key's absence. Making it `null` would
 * add a second spelling of "no prompt" beside the one `status` already gives.
 */
export function waitDocument(result: WaitForThreadResult): Record<string, unknown> {
  const { thread } = result;
  const lastAssistant = [...(thread.messages ?? [])].reverse().find((m) => m.role === "assistant");
  return {
    threadId: thread.threadId,
    status: thread.status,
    response: lastAssistant?.content ?? "",
    ...(thread.promptResult ? { promptResult: thread.promptResult } : {}),
    // Both parameters are booleans, so the shared helper takes them by NAME:
    // transposed positionally they type-check and invert the document.
    ...waitDocumentFields({ waited: true, settled: result.outcome !== "timed-out" })
  };
}
