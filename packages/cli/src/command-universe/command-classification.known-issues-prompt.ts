/**
 * DECLARED DISPOSITIONS, `known-issues` … `prompt graph`.
 *
 * ONE SLICE of the single table `./command-classification.ts` assembles. DATA,
 * and nothing else: one `"<path>": "<disposition>"` line per leaf, held in the
 * order the table has always carried them, so which slice a leaf sits in is
 * invisible to every reader of `COMMAND_CLASSIFICATION`.
 *
 * WHAT BELONGS HERE: a leaf whose path falls inside the span above, with a
 * comment where its disposition is surprising. The promotion rules live on
 * `COMMAND_CLASSIFICATION` itself, so there is exactly one copy of them.
 *
 * WHAT DOES NOT: logic of any kind, and no second table —
 * `./sweep-expected-skips.ts` answers what one ENVIRONMENT does, which is a
 * different question from what may be done with a leaf.
 *
 * ⚠️ FILING A LEAF IN THE WRONG SLICE COSTS TIDINESS AND NOTHING ELSE, because
 * the assembler unions them. DECLARING ONE LEAF IN TWO SLICES THROWS, and that
 * refusal is what replaces the `ts(1117)` a single object literal used to get
 * from the compiler for free.
 */

import type { CommandDisposition } from "./disposition";

/** 45 leaves, `known-issues` … `prompt graph`. */
export const KNOWN_ISSUES_TO_PROMPT: Readonly<Record<string, CommandDisposition>> = {
  // ── known-issues ───────────────────────────────────────────────────────────
  // A read, and it mutates nothing — but it takes a REQUIRED positional, so the
  // sweep has no value it could supply. `registration-only` is what a required
  // argument means here, not a judgement about the call being unsafe.
  "known-issues": "registration-only",

  // ── mcp ────────────────────────────────────────────────────────────────────
  // `call` dispatches whatever tool name it is handed against the real Public
  // API, so it is `nexus api`'s class rather than a typed verb's: unbounded by
  // construction, and the sweep must never fire one blind. `serve` reads stdin
  // until it closes and speaks a wire protocol on stdout — nothing a sweep can
  // drive. `install` writes a config file outside this directory under --apply.
  "mcp call": "never-execute",
  "mcp install": "registration-only",
  "mcp serve": "never-execute",
  "mcp tools get": "registration-only",
  "mcp tools list": "safe",

  // ── mcp-server ── THE OPPOSITE DIRECTION FROM `mcp` ABOVE ───────────────
  // `list` is a bounded org-scoped read needing nothing, and an empty answer is
  // its ordinary one, so `safe` rather than `safe-with-fixture` — an organization
  // with no connected server is not a missing fixture. `get` is a read that needs
  // a server id. `call` DIALS A THIRD-PARTY SERVER holding this organization's
  // stored credential and runs whatever that remote does, so it is `mcp call`'s
  // class and not a typed write's: a sweep must never fire one, at any blast
  // radius, and `probe-barrier.ts` carries the same fact on its own axis.
  //
  // 🔴 `sync` IS `registration-only` ON ITS OWN SHAPE, AND IT IS NOT PARKED. The two
  // are easy to run together and they want opposite follow-ups. A PARKED leaf is one
  // whose shape fits `safe` and whose ROUTE is not deployed yet — it carries a
  // promotion condition somebody later discharges, which is what
  // `SWEEP_ROUTES_PENDING_DEPLOY` exists to hold with an arm instead of a comment. This
  // leaf fails `safe` on two counts that no deploy can change: it is a MUTATION, and it
  // needs a required `<serverId>` the sweep has no value for. So there is NO promotion
  // condition and nothing to discharge — `mcp-server get` sits beside it at the same
  // disposition for the second of those reasons alone, and carries no such comment
  // either. A reader who "promotes" this when the route goes live would have the sweep
  // POST a discovery request at a third-party server on every CLI pull request.
  //
  // It is not `never-execute`: that is for a self-modifying, interactive,
  // credential-destroying or unbounded-arbitrary surface, and `mcp-server call` is here
  // because the remote runs whatever it likes. A discovery asks `tools/list` and nothing
  // else, so a human may legitimately run this by hand — which is the whole point of the
  // verb.
  "mcp-server call": "never-execute",
  "mcp-server get": "registration-only",
  "mcp-server list": "safe",
  "mcp-server sync": "registration-only",

  // ── model ──────────────────────────────────────────────────────────────────
  "model list": "safe",

  // ── permissions ────────────────────────────────────────────────────────────
  "permissions access": "registration-only",
  "permissions grant": "registration-only",
  "permissions org-settings": "safe",
  "permissions revoke": "registration-only",
  "permissions set-visibility": "registration-only",

  // ── phone-number ───────────────────────────────────────────────────────────
  "phone-number buy": "registration-only",
  "phone-number get": "registration-only",
  "phone-number list": "safe",
  "phone-number release": "registration-only",
  "phone-number search": "registration-only",

  // ── prompt-assistant ───────────────────────────────────────────────────────
  // Read-only, but it takes a thread id AND holds the connection for up to 55s
  // — a sweep that ran it would spend a minute per invocation waiting on a
  // thread that does not exist.
  "prompt-assistant await-thread": "registration-only",
  "prompt-assistant chat": "never-execute", // interactive REPL
  "prompt-assistant delete-thread": "registration-only",
  "prompt-assistant get-thread": "registration-only",
  "prompt-assistant list-threads": "safe",

  // ── role ───────────────────────────────────────────────────────────────────
  "role access-requests": "registration-only",
  "role add-member": "registration-only",
  "role add-permission-set-member": "registration-only",
  "role add-responsibility": "registration-only",
  "role attach": "registration-only",
  "role automation-settings": "safe",
  "role collection-grants": "registration-only",
  "role coverage": "registration-only",
  // Both score verbs take REQUIRED anchors (`--scorable-type`, `--scorable-id`),
  // so neither can be swept — the read is no exception, exactly as `role boards`
  // above. `record` is a mutation as well.
  "score record": "registration-only",
  "score list": "registration-only",
  // Every prompt verb takes a REQUIRED --agent-id (and the writes mutate), so
  // none can run unanchored in the docs probe.
  "prompt variant list": "registration-only",
  "prompt variant create": "registration-only",
  "prompt variant rename": "registration-only",
  "prompt variant archive": "registration-only",
  "prompt save": "registration-only",
  "prompt history": "registration-only",
  "prompt promote": "registration-only",
  "prompt compare": "registration-only",
  "prompt graph": "registration-only"
};
