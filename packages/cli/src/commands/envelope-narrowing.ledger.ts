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
 * ONE. These commands still answer `--json` documents that are missing a field.
 * What the ledger buys is that the number is MEASURED rather than remembered,
 * that it cannot grow while nobody is looking, and that each survivor carries
 * the reason it survived instead of reading as an oversight nobody noticed.
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
 * ── WHY THESE WERE NOT FIXED IN THE SAME PASS ───────────────────────────────
 *
 * The cure is `printEnvelope`, and for every entry marked `breaking` it moves
 * that command's published `--json` envelope — from a bare array or from
 * `{data, meta}` to the response object itself. `COMPATIBILITY.md` puts the
 * per-command envelope in the EVOLVING tier: it may change, and it changes with
 * a changelog entry that names the old shape and the new one. That is one
 * deliberate act per command, not a sweep, so they are ticketed rather than
 * bundled into a release note nobody can read.
 *
 * The entries marked `by-design` are not defects at all. They are here because
 * the scan cannot tell them from one, and deleting them from the ledger would
 * make the gate red over correct code.
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
export const ENVELOPE_NARROWING_LEDGER_CEILING = 11;

export const ENVELOPE_NARROWING_LEDGER: readonly LedgeredNarrowing[] = [
  {
    key: "commands/analytics.ts printList rows",
    verdict: "breaking",
    lost: ["executionTimeMs", "rowCount", "truncated"],
    note:
      "`truncated` says the answer is PARTIAL and only the terminal is told — a " +
      "script reads a short result as a complete one. Two leaves, both `{data, meta}` " +
      "today, so the cure moves a published envelope."
  },
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
  },
  {
    key: "commands/external-tool.ts printList items",
    verdict: "breaking",
    lost: ["total"],
    note:
      "`total` is how many exist against how many `--limit` returned. It belongs in " +
      "`meta`, and `meta` is `undefined` here — filling it would change what the shared " +
      "`list` help sentence promises for 53 commands, so it goes with the envelope work."
  },
  {
    key: "commands/known-issues.ts printTable issues",
    verdict: "breaking",
    lost: ["capturedAt"],
    note: "`capturedAt` is the freshness of the published-issues snapshot. Bare array today."
  },
  {
    key: "commands/prompt-assistant.ts printRecord thread",
    verdict: "breaking",
    lost: ["outcome", "waitedMs"],
    note:
      "`outcome` is what the wait actually did — completed, timed out, still generating " +
      "— and it survives only as the process exit code. Two leaves, flat-record today."
  },
  {
    key: "commands/task.ts printTable items",
    verdict: "breaking",
    lost: ["total"],
    note:
      "The command's own help already tells a reader to run `nexus api GET /skills/tasks` " +
      "for the count. A documented workaround is what this class looks like from inside."
  },
  {
    key: "commands/template.ts printList items",
    verdict: "breaking",
    lost: ["total"],
    note: "Same shape as `external-tool list`: `total` exists, `meta` is undefined."
  },
  {
    key: "commands/tool.ts printTable tools",
    verdict: "breaking",
    lost: ["facets", "total"],
    note:
      "`facets` is the category/type breakdown a caller would narrow the next search by, " +
      "and it is reachable from no other command. Bare array today."
  },
  {
    key: "commands/tool.ts printTable skills",
    verdict: "breaking",
    lost: ["total"],
    note: "Bare array today; `total` against `--limit` is the same gap as the two above."
  },
  {
    key: "commands/tracing.ts printList entries",
    verdict: "breaking",
    lost: ["dimensions"],
    note:
      "`dimensions` echoes what the breakdown was grouped BY, in order. On a " +
      "multi-dimension request every row's `groupKey` is a composite `value0|value1` " +
      "key, so without `dimensions` a consumer cannot say which half is the model and " +
      "which is the deployment. `{data, meta}` today."
  },
  {
    key: "commands/vibe.ts printRecord deployment",
    verdict: "breaking",
    lost: ["buildJob"],
    note:
      "`vibe` is UNSTABLE in COMPATIBILITY.md, so this one is cheap to move — it waits " +
      "only because it is in the same class and should move with it."
  }
];
