/**
 * THE `--json` DOCUMENTS THAT STILL DROP A FIELD THE SERVER SENT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * SHRINK-ONLY. AN ENTRY MAY BE DELETED. ONE MAY NOT BE ADDED.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `envelope-narrowing.scan.ts` derives this population from the type checker.
 * Every site it finds must appear below with the exact keys it loses, or
 * `envelope-narrowing.test.ts` fails. So a NEW narrowing turns the build red on
 * the day it is written, and the only way to make it green is to fix it or to
 * argue for it here in a sentence a reviewer reads.
 *
 * 🚨 A LEDGER IS NOT A FIX, AND THE DISTINCTION IS THE WHOLE POINT OF WRITING
 * ONE. What the ledger buys is that the number is MEASURED rather than
 * remembered, that it cannot grow while nobody is looking, and that each
 * survivor carries the reason it survived instead of reading as an oversight
 * nobody noticed. The defects it measured are cured; what is left below is the
 * one site that was never a defect.
 *
 * ── DRAINING IS SILENTLY LEGAL, AND THAT IS A DESIGN DECISION ───────────────
 *
 * 🔴 THERE IS NO "THIS ENTRY IS STALE" ASSERTION, DELIBERATELY, AND THIS FILE
 * SHIPPED WITH ONE UNTIL IT WAS TAKEN OUT.
 *
 * "every ledger key must still be a finding" is a LOWER BOUND on draining data.
 * Under it, fixing one command reds the build until its entry is deleted in the
 * same edit, and the person who fixes the LAST one deletes the gate. Every entry
 * below marked `breaking` is ticketed to a separate pull request that moves one
 * command's published envelope — a lower bound would turn each of those into a
 * conflict with a red build attached, which is how a gate gets switched off.
 *
 * The two assertions that hold instead are safe under draining in both
 * directions:
 *
 *   · **SUBSET** — every finding is a key here. A new one is red, by name.
 *   · **NON-GROWTH** — the number of keys never exceeds
 *     {@link ENVELOPE_NARROWING_LEDGER_CEILING}. Deleting entries only ever
 *     moves it further under the ceiling.
 *
 * A key left behind after its command is cured is harmless: it exempts a site
 * the scan no longer reports. Delete it when you notice; nothing forces you to,
 * and nothing breaks if you do it in a later pass.
 *
 * ⚠️ ONE ASSERTION IS STILL EXACT, AND IT IS EXACT IN THE SAFE DIRECTION. The
 * `lost` set below is compared against the scan's — but ONLY for a key the scan
 * still reports. A cured command drops out of the comparison entirely; a command
 * whose response GAINS a key while the printer still takes one is red, which is
 * the widening case this gate is for.
 *
 * ── WHAT IS LEFT, AND WHY IT IS NOT A DEFECT ────────────────────────────────
 *
 * The cure is `printEnvelope`, and it moved each cured command's published
 * `--json` envelope — from a bare array, or from `{data, meta}`, to the
 * response object itself. `COMPATIBILITY.md` puts the per-command envelope in
 * the EVOLVING tier: it may change, and it changes with a changelog entry
 * naming the old shape and the new one.
 *
 * An entry marked `by-design` is not a defect at all. It is here because the
 * scan cannot tell it from one, and deleting it would make the gate red over
 * correct code.
 *
 * ⚠️ THE SCAN ALSO REPORTED TWO SITES THAT WERE ALREADY COMPLETE, AND THE
 * LEDGER RECORDED KEYS THEY NEVER LOST. `known-issues` and `apps`'s trigger
 * printer both opened with `if (isJsonMode()) { console.log(JSON.stringify(x));
 * return; }` — the whole response reached `--json` and the printer below was
 * the human branch, which is the shape `json-shape.scan.ts` needs
 * `SELF_JSON_MARKERS` to see and this walk does not model. Both now call
 * `printEnvelope` instead, which produces the same bytes and is a shape both
 * scans read correctly. So a `lost` set here is what the WALK computes, never
 * an observation of the shipped document: `envelope-restored-fields.test.ts`
 * is the half that reads stdout.
 */

/** One surviving narrowing, keyed as `narrowingKey()` spells it. */
export interface LedgeredNarrowing {
  /** `<file> <printer> <taken>` — see `narrowingKey`. */
  readonly key: string;
  /** Why it is still here. `breaking` is ticketed; `by-design` is not a defect. */
  readonly verdict: "breaking" | "by-design";
  /** Every key the scan reports lost at this key, sorted. */
  readonly lost: readonly string[];
  /** One sentence a reviewer reads. */
  readonly note: string;
}

/**
 * The most entries this ledger may hold. An UPPER bound, never an exact count.
 *
 * Lower it when a command is cured and its entry deleted — that is a one-line
 * ratchet nobody has to make. Raising it is the single edit that lets this class
 * grow, and it needs a reason a reviewer can read in the same diff.
 *
 * 🚨 NEVER ASSERT EQUALITY HERE. An unrelated merge that removes one entry would
 * red a build with no defect in it, and the cure for the class would red every
 * build until the number was chased down to match.
 */
export const ENVELOPE_NARROWING_LEDGER_CEILING = 1;

export const ENVELOPE_NARROWING_LEDGER: readonly LedgeredNarrowing[] = [
  {
    key: "commands/conversation.ts printRecord metadata",
    verdict: "by-design",
    lost: [
      "assignedUserIds",
      "channelType",
      "contact",
      "createdAt",
      "deploymentId",
      "deploymentName",
      "id",
      "lastMessageAt",
      "lastMessageId",
      "lastMessagePreview",
      "lastMessageUpdatedAt",
      "memberCount",
      "nanoId",
      "responseHandling",
      "satisfaction",
      "status",
      "ticketStatus",
      "topic",
      "unread",
      "updatedAt"
    ],
    note:
      "`conversation metadata set` answers with the metadata it just wrote. The " +
      "conversation around it is the SUBJECT of the request, not its result — echoing " +
      "twenty unrelated fields back would be the surprise, not the omission."
  }
];
