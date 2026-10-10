/**
 * THE DECLARED TABLE — one line per leaf, saying what may be done with it.
 *
 * DATA, and nothing else. It is the largest file in this directory by a wide
 * margin and that is a SIZE BUDGET rather than a violation: its length is a
 * function of how many leaves the CLI registers, one line each, which is the
 * smallest honest representation there is. Splitting it by namespace would make
 * it several partial tables, and `classify.ts` diffs the tree against ONE table
 * — a leaf missing from whichever shard nobody updated would read as
 * unclassified, or worse, a second shard would quietly re-declare it.
 *
 * WHAT BELONGS HERE: exactly one `"<path>": "<disposition>"` line per leaf,
 * sorted, with a comment where the disposition is surprising. The promotion
 * rules live in the docblock below and are the only reason to reach for `safe`.
 *
 * WHAT DOES NOT: logic of any kind, and no second table.
 * `sweep-expected-skips.ts` holds what one ENVIRONMENT answers, which is a
 * different question from what may be done with a leaf, and the docblock below
 * is emphatic about not merging them.
 */

import type { CommandDisposition } from "./disposition";

/**
 * WHAT MAY BE DONE WITH EACH LEAF. Declared, never derived.
 *
 * ⚠️ ADDING A LINE HERE IS PART OF ADDING A COMMAND, and `command-universe.test.ts`
 * is what makes that mandatory rather than polite. Deleting a line is
 * never how a red build is fixed: a leaf that vanishes from the tree is either
 * a rename to reflect here or a regression to revert.
 *
 * Default to `registration-only` when unsure. It is the honest answer for
 * anything that mutates or needs an argument, and it costs the sweep nothing.
 * Reach for `safe` ONLY when all three hold: no required positional, no
 * required option, and `--json` on a read.
 *
 * 🚨 THOSE THREE ARE NECESSARY AND NOT SUFFICIENT, AND READING THE HELP CANNOT
 * SETTLE THEM. Measured over every `registration-only` leaf on 2026-08-18: 75
 * declared no required positional and no `(required)` option in their rendered
 * `--help`, and invoking them against staging refused four of the reads
 * outright — three `cloud-import` leaves want `--connection-id` and
 * `conversation search` wants `--query`, none of which the help text marks the
 * way the others do. The same probe read two leaves ALREADY classified `safe`
 * as needing input, so the help is wrong in both directions.
 *
 * So the promotion test is an INVOCATION against a live environment, never a
 * re-reading. A candidate earns `safe` when it exits 0, emits parseable JSON,
 * and comes back with data — and these are the shapes that pass the first two
 * and prove nothing:
 *
 *   - EXIT 0 AND NOT JSON. `--strict` promotes the WARN to a FAIL, so this
 *     turns the gate red rather than covering anything. `analytics export` and
 *     `cue export` are both this today.
 *   - A 403 the SKIP grep does not match. It matches "not configured",
 *     "feature is disabled" and "feature not enabled", and a feature-gated
 *     namespace answers "This feature is not enabled" — none of the three. So a
 *     leaf behind a gate the sweep organisation has not been granted lands as a
 *     FAIL rather than a SKIP. The remedy is to enable the feature for that
 *     organisation, never to broaden the grep: a wider grep turns a real outage
 *     into a SKIP everywhere.
 *   - AN EMPTY COLLECTION. It exercises auth, routing, tenancy scoping and the
 *     envelope, and it asserts nothing whatever about item shape. Six leaves
 *     already classified `safe` read empty against staging, so this is a REASON
 *     TO SEED A FIXTURE rather than a rule anything currently enforces.
 *
 * 🚨 AND ONE SHAPE IS REFUSED NO MATTER HOW WELL IT READS: a leaf that RETURNS
 * A CREDENTIAL. `apps git-credentials <projectId>` exits 0 and emits clean JSON
 * once given a project — it meets every test above — and what it emits is that
 * project's live git push token. `sweep.sh` prints the first 100 characters of a leaf's output
 * into the CI log on failure, and a CI log is readable by anyone with repository
 * access. It stays `registration-only` for that reason and not for any other, so
 * do not promote it on a later pass that only re-checks the input rules.
 */
export const COMMAND_CLASSIFICATION: Readonly<Record<string, CommandDisposition>> = {
  // ── access-card ────────────────────────────────────────────────────────────
  "access-card available-actions": "registration-only",
  "access-card create": "registration-only",
  "access-card delete": "registration-only",
  "access-card get": "registration-only",
  "access-card list": "registration-only",
  "access-card update": "registration-only",

  // ── admin ──────────────────────────────────────────────────────────────────
  "admin vibe-build-job claim": "registration-only",
  "admin vibe-build-job fail": "registration-only",
  "admin vibe-build-job succeed": "registration-only",
  "admin vibe-build-job time-out": "registration-only",
  "admin vibe-build-job-timeout-sweep trigger": "registration-only",
  "admin vibe-build-runner tick": "registration-only",
  "admin vibe-consumption-cap get": "registration-only",
  "admin vibe-consumption-cap set": "registration-only",
  "admin vibe-cost-safety get": "registration-only",
  "admin vibe-cost-safety list": "registration-only",
  "admin vibe-cost-safety set": "registration-only",
  "admin vibe-deployment await-approval": "registration-only",
  "admin vibe-deployment begin-deploy": "registration-only",
  "admin vibe-deployment build-succeeded": "registration-only",
  "admin vibe-deployment mark-failed": "registration-only",
  "admin vibe-deployment mark-healthy": "registration-only",
  "admin vibe-deployment mark-rolled-back": "registration-only",
  "admin vibe-deployment-runner tick": "registration-only",
  "admin vibe-rollback-sweep trigger": "registration-only",
  "admin vibe-tenant-cluster complete-teardown": "registration-only",
  "admin vibe-tenant-cluster disable": "registration-only",
  "admin vibe-tenant-cluster force-converge": "registration-only",
  "admin vibe-tenant-cluster provision": "registration-only",
  "admin vibe-tenant-cluster request-server-roll": "registration-only",

  // ── agent ──────────────────────────────────────────────────────────────────
  "agent create": "registration-only",
  "agent delete": "registration-only",
  "agent duplicate": "registration-only",
  "agent generate-profile-picture": "registration-only",
  "agent get": "registration-only",
  "agent list": "safe",
  "agent update": "registration-only",
  "agent upload-profile-picture": "registration-only",

  // ── agent-collection ───────────────────────────────────────────────────────
  "agent-collection attach": "registration-only",
  "agent-collection detach": "registration-only",
  "agent-collection list": "registration-only",

  // ── agent-skill ────────────────────────────────────────────────────────────
  "agent-skill add-preset": "registration-only",
  "agent-skill create": "registration-only",
  "agent-skill delete": "registration-only",
  "agent-skill download": "registration-only",
  "agent-skill get": "registration-only",
  "agent-skill list": "registration-only",
  "agent-skill presets": "safe",
  "agent-skill update": "registration-only",
  "agent-skill upload": "registration-only",

  // ── agent-tool ─────────────────────────────────────────────────────────────
  "agent-tool attach-collection": "registration-only",
  "agent-tool create": "registration-only",
  "agent-tool delete": "registration-only",
  "agent-tool get": "registration-only",
  "agent-tool list": "registration-only",
  "agent-tool update": "registration-only",

  // ── analytics ──────────────────────────────────────────────────────────────
  "analytics export": "registration-only",
  "analytics feedback": "safe",
  "analytics metrics": "registration-only",
  "analytics overview": "safe",
  "analytics query": "registration-only",

  // ── api ────────────────────────────────────────────────────────────────────
  api: "never-execute", // accepts any HTTP verb against any path — unbounded by construction

  // ── apps ───────────────────────────────────────────────────────────────────
  "apps approvals decide": "registration-only",
  "apps approvals get": "registration-only",
  "apps approvals pending": "registration-only",
  "apps attach-repo": "registration-only",
  "apps audit list": "safe",
  "apps cluster provision": "registration-only",
  "apps cluster status": "safe",
  "apps create": "registration-only",
  "apps delete": "registration-only",
  "apps deploy": "registration-only",
  "apps deploy-state": "registration-only",
  "apps deployments cancel": "registration-only",
  "apps deployments get": "registration-only",
  "apps deployments list": "registration-only",
  "apps edge-token": "registration-only",
  "apps domains add": "registration-only",
  "apps domains list": "registration-only",
  "apps domains primary": "registration-only",
  "apps domains remove": "registration-only",
  "apps domains verify": "registration-only",
  "apps env list": "registration-only",
  "apps env rm": "registration-only",
  "apps env set": "registration-only",
  "apps get": "registration-only",
  "apps git-credentials": "registration-only",
  "apps git-project clone": "registration-only",
  "apps git-project create": "registration-only",
  "apps git-project delete": "registration-only",
  "apps git-project get": "registration-only",
  "apps git-project list": "safe",
  "apps git-project pull": "registration-only",
  "apps git-project reprovision": "registration-only",
  "apps list": "safe",
  "apps logs": "registration-only",
  "apps provision-repo": "registration-only",
  "apps register-as-tool": "registration-only",
  "apps reprovision-repo": "registration-only",
  "apps rollback": "registration-only",
  "apps rotate-edge-token": "registration-only",
  "apps starter": "registration-only",
  "apps update": "registration-only",
  // Writes into the app directory on disk, so it is not a read whatever its
  // arguments look like. `apps starter` above is the same shape for the same
  // reason.
  "apps vendor-package": "registration-only",
  "apps visibility": "registration-only",

  // ── asset ──────────────────────────────────────────────────────────────────
  "asset delete": "registration-only",
  "asset get": "registration-only",
  "asset list": "safe-with-fixture",
  "asset upload": "registration-only",

  // ── auth ───────────────────────────────────────────────────────────────────
  "auth list": "safe",
  "auth login": "never-execute", // writes credentials
  "auth logout": "never-execute", // destroys the credentials the sweep is authenticated with
  "auth orgs": "safe",
  "auth pin": "never-execute", // writes .nexusrc
  "auth status": "never-execute", // already spent in the sweep's own preflight
  "auth switch": "never-execute", // flips the active profile out from under the sweep
  "auth unpin": "never-execute", // deletes .nexusrc
  "auth use-org": "never-execute", // repoints the profile at another organization
  "auth whoami": "safe",

  // ── channel ────────────────────────────────────────────────────────────────
  "channel connect-waba": "registration-only",
  "channel connection create": "registration-only",
  "channel connection list": "safe",
  "channel setup": "registration-only",
  "channel whatsapp-sender create": "registration-only",
  "channel whatsapp-sender get": "registration-only",
  "channel whatsapp-sender list": "safe",
  "channel whatsapp-template approvals": "registration-only",
  "channel whatsapp-template create": "registration-only",
  "channel whatsapp-template delete": "registration-only",
  "channel whatsapp-template get": "registration-only",
  "channel whatsapp-template list": "safe",
  "channel whatsapp-template submit-approval": "registration-only",
  "channel whatsapp-template test-send": "registration-only",

  // ── chat ───────────────────────────────────────────────────────────────────
  // `chat send` runs the REAL agent on a REAL deployment: a model call, real
  // tools, real cost, and a message written into a customer conversation. It is
  // the emulator's production twin and is never swept.
  //
  // `chat session` looks read-only and is not swept either. It MINTS A LIVE
  // CREDENTIAL — a bearer token for a deployment — and a sweep's output is a CI
  // log. "writes no row" is true and is the wrong question; the answer belongs
  // to nobody once it is printed.
  // The control half — stop, status and resume — is `registration-only` rather
  // than `never-execute`, and the distinction is the declared one: each needs a
  // required option (the conversation, by token or by id), and `stop` mutates a
  // live turn. None of the three PRINTS a credential, which is what put the two
  // above out of reach of a sweep whose output is a CI log.
  "chat resume": "registration-only",
  "chat send": "never-execute",
  "chat session": "never-execute",
  "chat status": "registration-only",
  "chat stop": "registration-only",

  // ── claude-code ────────────────────────────────────────────────────────────
  "claude-code install": "never-execute", // writes files into the caller's ~/.claude
  "claude-code list": "safe",

  // ── cloud-import ───────────────────────────────────────────────────────────
  "cloud-import browse": "registration-only",
  "cloud-import google-drive import": "registration-only",
  "cloud-import google-drive list-files": "registration-only",
  "cloud-import import": "registration-only",
  "cloud-import notion import": "registration-only",
  "cloud-import notion search": "registration-only",
  "cloud-import providers": "safe",
  "cloud-import search": "registration-only",
  "cloud-import sharepoint import": "registration-only",
  "cloud-import sharepoint list-files": "registration-only",

  // ── collection ─────────────────────────────────────────────────────────────
  "collection attach-documents": "registration-only",
  "collection create": "registration-only",
  "collection delete": "registration-only",
  "collection documents": "registration-only",
  "collection get": "registration-only",
  "collection list": "safe",
  "collection query": "registration-only",
  "collection remove-document": "registration-only",
  "collection search": "registration-only",
  "collection search-multiple": "registration-only",
  "collection stats": "registration-only",
  "collection update": "registration-only",

  // ── conversation ───────────────────────────────────────────────────────────
  "conversation assign": "registration-only",
  "conversation assigned-users": "registration-only",
  "conversation close": "registration-only",
  "conversation comment": "registration-only",
  "conversation comments": "registration-only",
  "conversation get": "registration-only",
  "conversation get-metadata": "registration-only",
  "conversation list": "safe",
  "conversation mark-as-read": "registration-only",
  "conversation messages": "registration-only",
  "conversation search": "registration-only",
  "conversation send-message": "registration-only",
  "conversation send-template": "registration-only",
  "conversation update-metadata": "registration-only",
  "conversation update-status": "registration-only",
  "conversation update-topic": "registration-only",

  // ── credential ─────────────────────────────────────────────────────────────
  "credential connect": "registration-only", // starts an OAuth flow / stores a key
  "credential connect-status": "registration-only", // needs a live handshake id
  "credential delete": "registration-only",
  "credential get": "registration-only",
  "credential list": "safe",
  "credential update": "registration-only",

  // ── cue ────────────────────────────────────────────────────────────────────
  // `export` is read-only and needs no input, but it would not be swept even
  // once its route is live: it is rate limited to 5 requests per minute per
  // organization and a bare invocation pulls the org's whole transcript corpus
  // to stdout. A sweep firing it every run would spend the limit a real export
  // needs and move megabytes to do it.
  //
  // `cue conversations` is `safe` by every property the disposition describes —
  // read-only, no required input, emits `--json` — and `GET /public/v1/cue/
  // conversations` answers 200 on staging, so the sweep watches it.
  "cue conversations": "safe",
  "cue export": "registration-only",
  "cue transcript": "registration-only",

  // ── custom-model ───────────────────────────────────────────────────────────
  "custom-model create": "registration-only",
  "custom-model delete": "registration-only",
  "custom-model get": "registration-only",
  "custom-model list": "safe",
  "custom-model update": "registration-only",

  // ── customer ───────────────────────────────────────────────────────────────
  "customer create": "registration-only",
  "customer delete": "registration-only",
  "customer get": "registration-only",
  "customer get-by-external-id": "registration-only",
  "customer list": "safe",
  "customer note": "registration-only",
  "customer update": "registration-only",

  // ── deployment ─────────────────────────────────────────────────────────────
  "deployment create": "registration-only",
  "deployment delete": "registration-only",
  "deployment duplicate": "registration-only",
  "deployment embed-config": "registration-only",
  "deployment embed-config-update": "registration-only",
  "deployment folder assign": "registration-only",
  "deployment folder create": "registration-only",
  "deployment folder delete": "registration-only",
  "deployment folder list": "safe",
  "deployment folder update": "registration-only",
  "deployment get": "registration-only",
  "deployment list": "safe",
  "deployment stats": "registration-only",
  "deployment template attach": "registration-only",
  "deployment template detach": "registration-only",
  "deployment template list": "registration-only",
  "deployment template settings": "registration-only",
  "deployment template update": "registration-only",
  "deployment update": "registration-only",

  // ── docs ───────────────────────────────────────────────────────────────────
  "docs search": "never-execute", // interactive topic browser

  // ── document ───────────────────────────────────────────────────────────────
  "document add-website": "registration-only",
  "document children": "registration-only",
  "document create-folder": "registration-only",
  "document create-google-sheet": "registration-only",
  "document create-text": "registration-only",
  "document delete": "registration-only",
  "document download": "registration-only",
  "document get": "registration-only",
  "document list": "safe",
  "document preview": "registration-only",
  "document reprocess": "registration-only",
  "document update": "registration-only",
  "document upload": "registration-only",

  // ── emulator ───────────────────────────────────────────────────────────────
  "emulator scenario delete": "registration-only",
  "emulator scenario get": "registration-only",
  "emulator scenario list": "registration-only",
  "emulator scenario replay": "registration-only",
  "emulator scenario save": "registration-only",
  "emulator send": "never-execute", // pushes a message into a live emulator session
  "emulator session create": "registration-only",
  "emulator session delete": "registration-only",
  "emulator session get": "registration-only",
  "emulator session list": "registration-only",

  // ── execution ──────────────────────────────────────────────────────────────
  "execution cancel": "registration-only",
  "execution diagnose": "registration-only",
  "execution export": "registration-only",
  "execution follow": "registration-only",
  "execution get": "registration-only",
  "execution list": "safe",
  "execution node-result": "registration-only",
  "execution output": "registration-only",
  "execution poll": "registration-only",
  "execution retry": "registration-only",

  // ── external-tool ──────────────────────────────────────────────────────────
  "external-tool create": "registration-only",
  "external-tool delete": "registration-only",
  "external-tool execute": "registration-only",
  "external-tool get": "registration-only",
  "external-tool initiate-oauth": "never-execute", // opens a browser OAuth flow
  "external-tool list": "safe",
  "external-tool test": "registration-only",
  "external-tool test-auth": "registration-only",
  "external-tool update": "registration-only",
  "external-tool update-auth": "registration-only",
  "external-tool update-spec": "registration-only",
  "external-tool upload-icon": "registration-only",

  // ── folder ─────────────────────────────────────────────────────────────────
  "folder assign": "registration-only",
  "folder create": "registration-only",
  "folder delete": "registration-only",
  "folder list": "safe",
  "folder update": "registration-only",

  // ── html-template ──────────────────────────────────────────────────────────
  "html-template create": "registration-only",
  "html-template delete": "registration-only",
  "html-template fill": "registration-only",
  "html-template get": "registration-only",
  "html-template list": "safe-with-fixture",
  "html-template render": "registration-only",
  "html-template update": "registration-only",

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
  "prompt graph": "registration-only",
  // Golden-conversation authoring. `conv list` is a read with no required
  // input, but it is NOT `safe`: the namespace is whitelist-gated on
  // PROMPT_EVAL and the swept organization holds no opt-in, so the deployed
  // API answers the flag guard's generic 403 ("This feature is not enabled
  // for your organization") — a sentence `policy-refusal.sh` deliberately
  // does not match (broadening that list is the silent-and-permanent failure
  // its own header warns about). A `safe` row here would be a permanently
  // red sweep leaf, red for the flag working as designed. Every other verb
  // needs an id or mutates, and `conv new` is an interactive REPL that
  // creates a conversation the moment it starts.
  "eval conv list": "registration-only",
  "eval conv create": "registration-only",
  "eval conv get": "registration-only",
  "eval conv delete": "registration-only",
  "eval conv add-user": "registration-only",
  "eval conv generate": "registration-only",
  "eval conv accept": "registration-only",
  "eval conv set-golden": "registration-only",
  "eval conv checkpoint": "registration-only",
  "eval conv ready": "registration-only",
  "eval conv new": "never-execute",
  // Eval runs. `run list` is a read with no required input and is NOT `safe`,
  // for the same reason `conv list` above is not: the namespace is
  // whitelist-gated on PROMPT_EVAL, and the swept organization holds no
  // opt-in, so the deployed API answers the flag guard's generic 403 that
  // `policy-refusal.sh` deliberately does not match. Every other verb needs an
  // id or mutates — and `run create` is the one leaf in this CLI that would
  // spend real money on every sweep, because each cell runs the agent live
  // with its tools and then calls a judge.
  "eval run create": "registration-only",
  "eval run preview": "registration-only",
  "eval run list": "registration-only",
  "eval run get": "registration-only",
  "eval run abort": "registration-only",
  "eval run results": "registration-only",
  "role create": "registration-only",
  "role create-job-type": "registration-only",
  "role create-permission-set": "registration-only",
  "role creation-request": "registration-only",
  "role creation-requests": "registration-only",
  "role delete": "registration-only",
  "role delete-job-type": "registration-only",
  "role delete-permission-set": "registration-only",
  "role deletion-request": "registration-only",
  "role deletion-requests": "registration-only",
  "role detach": "registration-only",
  "role get": "registration-only",
  "role governance": "safe",
  "role grant-collection": "registration-only",
  "role grant-workspace": "registration-only",
  "role job-types": "safe-with-fixture",
  "role list": "safe",
  "role add-board": "registration-only",
  // Every board verb needs a Role argument, so none can be swept. The reads are
  // no exception: `role boards` takes one too.
  "role boards": "registration-only",
  "role members": "registration-only",
  "role move-card": "registration-only",
  "role remove-board": "registration-only",
  "role reorder-boards": "registration-only",
  "role update-board": "registration-only",
  "role permission-sets": "registration-only",
  // Both are real and both are unsafe to fire in a sweep: `pause` stops a live
  // organization's workflows and agents, and `resume` would restart work
  // somebody deliberately stopped.
  "role pause": "registration-only",
  "role resume": "registration-only",
  "role remove-member": "registration-only",
  "role remove-permission-set-member": "registration-only",
  "role remove-responsibility": "registration-only",
  "role request-access": "registration-only",
  "role responsibilities": "registration-only",
  "role review-access": "registration-only",
  "role review-creation-request": "registration-only",
  "role review-deletion-request": "registration-only",
  "role revoke-collection": "registration-only",
  "role revoke-workspace": "registration-only",
  "role scope-lines": "registration-only",
  "role set-automation-settings": "registration-only",
  "role set-scope-lines": "registration-only",
  "role set-system-lifecycle": "registration-only",
  "role set-system-policy": "registration-only",
  "role set-task-duties": "registration-only",
  "role set-tasks": "registration-only",
  "role set-variables": "registration-only",
  "role set-working-year": "registration-only",
  "role system-policy": "registration-only",
  "role systems": "registration-only",
  "role task-duties": "registration-only",
  "role tasks": "registration-only",
  "role update": "registration-only",
  "role update-job-type": "registration-only",
  "role update-permission-set": "registration-only",
  "role variables": "registration-only",
  "role working-year": "registration-only",
  "role workspace-grants": "registration-only",

  // ── skill-folder ───────────────────────────────────────────────────────────
  "skill-folder assign": "registration-only",
  "skill-folder create": "registration-only",
  "skill-folder delete": "registration-only",
  "skill-folder list": "safe",
  "skill-folder update": "registration-only",

  // ── skills ─────────────────────────────────────────────────────────────────
  "skills list": "safe",
  "skills update": "never-execute", // writes skills + CLAUDE.md into the caller's project
  "skills version": "safe",
  "skills where": "safe",

  // ── task ───────────────────────────────────────────────────────────────────
  "task create": "registration-only",
  "task delete": "registration-only",
  "task duplicate": "registration-only",
  "task execute": "registration-only",
  "task get": "registration-only",
  "task list": "safe",
  "task update": "registration-only",

  // ── task-eval ──────────────────────────────────────────────────────────────
  "task-eval dataset add": "registration-only",
  "task-eval dataset list": "registration-only",
  "task-eval execute": "registration-only",
  "task-eval formats": "safe",
  "task-eval judge": "registration-only",
  "task-eval judges": "safe",
  "task-eval results": "registration-only",
  "task-eval session create": "registration-only",
  "task-eval session delete": "registration-only",
  "task-eval session get": "registration-only",
  "task-eval session list": "registration-only",

  // ── template ───────────────────────────────────────────────────────────────
  "template create": "registration-only",
  "template delete": "registration-only",
  "template folder assign": "registration-only",
  "template folder create": "registration-only",
  "template folder delete": "registration-only",
  "template folder list": "safe-with-fixture",
  "template folder update": "registration-only",
  "template generate": "registration-only",
  "template get": "registration-only",
  "template list": "safe",
  "template upload": "registration-only",

  // ── ticket ─────────────────────────────────────────────────────────────────
  "ticket attach": "registration-only",
  "ticket attachments": "registration-only",
  "ticket close": "registration-only",
  "ticket comment": "registration-only",
  "ticket comments": "registration-only",
  "ticket create": "registration-only",
  "ticket get": "registration-only",
  "ticket list": "safe",
  "ticket update": "registration-only",

  // ── tool ───────────────────────────────────────────────────────────────────
  "tool connect": "never-execute", // opens a browser OAuth flow
  "tool connection-status": "registration-only",
  "tool create-credential": "registration-only",
  "tool credentials": "registration-only",
  "tool delete-credential": "registration-only",
  "tool execute": "registration-only",
  "tool get": "registration-only",
  "tool resolve-options": "registration-only",
  "tool search": "safe",
  "tool skills": "safe",
  "tool test": "registration-only",

  // ── tracing ────────────────────────────────────────────────────────────────
  "tracing cost-breakdown": "safe",
  "tracing delete": "registration-only",
  "tracing export": "registration-only",
  "tracing export-bulk": "safe",
  "tracing generation": "registration-only",
  "tracing generations": "safe",
  "tracing models": "safe",
  "tracing summary": "safe",
  "tracing timeline": "safe",
  "tracing trace": "registration-only",
  "tracing traces": "safe",
  // ── tracks ─────────────────────────────────────────────────────────────────
  // TWO LEAVES HERE ARE `safe`, AND THE RATIO IS THE DOMAIN RATHER THAN CAUTION.
  // `tracks ready` and `tracks list` are the swept ones: almost every other read
  // is scoped to a track or a task the sweep has no id for, and every write
  // changes a plan. A sweep that ran those would be authoring work items.
  //
  // `GET /public/v1/tracks/ready` answers 200 on staging, so `tracks ready` is
  // `safe` and the sweep watches it. It is `safe` rather than
  // `safe-with-fixture` deliberately: staging holds no ready tracks, so the
  // route answers `{"tracks":[]}`, and `--require-non-empty` scores that EMPTY
  // and FAILs. An empty list is the correct answer here — this leaf proves the
  // route is alive and shaped like JSON, never that any item exists.
  //
  // 🔴 WHEN A LEAF'S ROUTE IS NOT ON STAGING YET, THE DISPOSITION IS THE LEVER —
  // NEVER `sweep.sh`'s SKIP MATCH. A 404 from a route that used to exist is
  // exactly the regression the sweep exists to catch, and a SKIP wide enough to
  // swallow one blinds it to every deleted route. Park such a leaf
  // `registration-only`, and write the flip-back as a RULE carrying its probe,
  // never as a note about somebody's intention to remember:
  //
  //   THIS LEAF IS `registration-only` WHILE <ROUTE> ANSWERS 404 ON STAGING,
  //   AND `safe` ONCE IT ANSWERS 200.
  //
  // The probe has to NAME THE HOST. `auth login --env` recognises only `dev`
  // and `production` — a named pair of localhost ports, not the `NEXUS_ENV`
  // map — and a `--profile staging` is local config no checkout ships, so a
  // probe written either way runs for whoever made one and nobody else. This
  // is why the sweep workflow sets `NEXUS_BASE_URL` explicitly:
  //
  //   NEXUS_API_KEY=<a staging key> NEXUS_BASE_URL=https://api-staging.gpt.nexus \
  //     pnpm exec tsx src/index.ts api GET <path AFTER /api/public/v1>
  //
  // 🚨 THE PATH IS THE SUFFIX, AND THE TWO FULLER SPELLINGS ARE REFUSED BEFORE
  // ANY REQUEST LEAVES THE MACHINE. `api` prepends `/api/public/v1` and rejects
  // an argument that repeats it: both the spelling this module stores in
  // {@link SweepPendingDeployRoute.route} (`/api/public/v1/<noun>`) and the one
  // the v1 contract uses (`/public/v1/<noun>`) exit 5 with
  // `CLI_INVALID_ARGUMENTS`. So a probe written with either — which is what
  // substituting a route from this file produces — reports a non-200 having
  // never reached staging, and that is INDISTINGUISHABLE from the route still
  // being absent. It parks the leaf for ever, and the control below cannot
  // catch it, because the control is refused in exactly the same way. Pass
  // `/<noun>`.
  //
  // Read the STATUS, and carry a control — a neighbouring path that must answer
  // 404, so a probe that would report 200 for anything is caught before it
  // decides a disposition.
  //
  // A note without a probe does not fire, because nothing about it can.
  //
  // On 200, change the value and move the TWO artifacts a disposition feeds:
  // `pnpm run gen:cli-surface` (each row carries its disposition, and the
  // header census with it) and `COMPATIBILITY.md`'s `classified safe` count,
  // which is a published figure a test derives. `gen:json-shape` reads the
  // contract rather than this table, so a flip leaves it untouched —
  // `gen:json-shape --check` says so without writing. A `src/**` change here
  // also needs a changeset naming `@agent-nexus/cli`.
  //
  // Leaving a leaf parked once its route answers is a read-only leaf the sweep
  // has stopped watching, which is the silent half of this disposition rather
  // than a tidy backlog item.
  "tracks ready": "safe",
  // A read that needs no argument and whose route answers 200 on staging, so the
  // sweep runs it. `safe` rather than `safe-with-fixture`: nothing seeds tracks,
  // so an organisation holding none answers `{"tracks":[]}`, and that is a
  // correct answer — this leaf proves the route is alive and shaped like JSON,
  // never that any track exists.
  "tracks list": "safe",
  // A mutation. Every one of the three creates or rewrites a row, so the sweep
  // proves they are REGISTERED and never runs them — `tracks rollup` is the one
  // read among them and it still needs a track id, which the sweep has none of.
  "tracks create": "registration-only",
  "tracks current-step": "registration-only",
  // Both write a column the ready set publishes, so both are mutations. The
  // status write is also how a track ENDS, which is the last thing a sweep
  // should perform against a live organization.
  "tracks set-status": "registration-only",
  // A MUTATION, and the one that takes a track OUT of the ready set entirely.
  // `registration-only` permanently, and for a reason no route status can lift:
  // the sweep must never archive a real track. There is no probe that promotes
  // this leaf.
  "tracks archive": "registration-only",
  "tracks set-next-owner": "registration-only",
  // A read, and still existence-only: it takes a track id and the sweep has
  // none. Same reasoning as `tracks rollup` below.
  "tracks get": "registration-only",
  "tracks rollup": "registration-only",
  "tracks dependency add": "registration-only",
  "tracks section create": "registration-only",
  "tracks section rename": "registration-only",
  "tracks section list": "registration-only",
  "tracks task ready": "registration-only",
  "tracks task list": "registration-only",
  "tracks task get": "registration-only",
  // A MUTATION, so existence only. It also OVERWRITES a claim another agent
  // holds, by design, which is the last thing a sweep should run for real.
  "tracks task claim": "registration-only",
  "tracks task toggle": "registration-only",
  "tracks task edge": "registration-only",
  "tracks task edges": "registration-only",

  // Read-only — three GETs and no write — but it takes a required `<trackId>`,
  // so the sweep can assert it is registered and cannot invoke it. Same reason
  // `tracks task ready` sits here rather than under `safe`.
  "tracks task why-not-ready": "registration-only",
  "tracks plan import": "registration-only",
  "tracks agent list": "registration-only",
  "tracks agent open": "registration-only",
  "tracks agent beat": "registration-only",
  "tracks agent close": "registration-only",
  "tracks diary list": "registration-only",
  "tracks diary append": "registration-only",
  "tracks memory list": "registration-only",
  "tracks memory put": "registration-only",
  "tracks memory delete": "registration-only",
  "tracks event list": "registration-only",
  // Takes no argument, emits `--json`, and answers 200 — the shape of a `safe`
  // leaf, and it is held back by a SCOPE rather than by its shape. It needs
  // `track_events:read`, which no swept leaf requires: `tracks ready` and
  // `tracks list` both need `tracks:read` and nothing more, so the sweep has
  // never established that its key carries the event scope at all. Promoting
  // this leaf on the shape alone bets the gate on that, and a key without it
  // answers 403 — which the skip grep does not match, so `CLI: Sweep` goes red
  // for a credential reason that looks like a CLI regression.
  //
  // So the promotion test here is not a route probe. It is a scope probe, and
  // the control is the key the sweep itself uses rather than a human's:
  //
  //   nexus tracks event feed --limit 1 --json       # 200 under the CI key
  //   nexus tracks ready --json                      # control — already swept
  //
  // Both 200 under the SAME credential and this becomes `safe`.
  "tracks event feed": "registration-only",
  "tracks event append": "registration-only",

  // ── upgrade ────────────────────────────────────────────────────────────────
  // Reinstalls the binary the sweep is running. Its `update`, `latest` and `up`
  // spellings are `.alias()` calls on this one command, so they are not separate
  // leaves and need no separate line.
  upgrade: "never-execute",

  // ── user-group ─────────────────────────────────────────────────────────────
  "user-group add-member": "registration-only",
  "user-group create": "registration-only",
  "user-group delete": "registration-only",
  "user-group list": "safe-with-fixture",
  "user-group remove-member": "registration-only",
  "user-group update": "registration-only",

  // ── version ────────────────────────────────────────────────────────────────
  "version create": "registration-only",
  "version delete": "registration-only",
  "version get": "registration-only",
  "version list": "registration-only",
  "version publish": "registration-only",
  "version restore": "registration-only",
  "version update": "registration-only",

  // ── workflow ───────────────────────────────────────────────────────────────
  "workflow batch": "registration-only",
  "workflow branch create": "registration-only",
  "workflow branch delete": "registration-only",
  "workflow branch list": "registration-only",
  "workflow branch update": "registration-only",
  "workflow create": "registration-only",
  "workflow delete": "registration-only",
  "workflow duplicate": "registration-only",
  "workflow edge create": "registration-only",
  "workflow edge delete": "registration-only",
  "workflow get": "registration-only",
  "workflow layout": "registration-only",
  "workflow list": "safe",
  "workflow node create": "registration-only",
  "workflow node delete": "registration-only",
  "workflow node get": "registration-only",
  "workflow node output-format": "registration-only",
  "workflow node reload-props": "registration-only",
  "workflow node test": "registration-only",
  "workflow node test-payload": "registration-only",
  "workflow node update": "registration-only",
  "workflow node variables": "registration-only",
  "workflow node-type": "registration-only",
  "workflow node-types": "safe",
  "workflow overview": "registration-only",
  "workflow platform-listener-events": "safe",
  "workflow publish": "registration-only",
  "workflow test": "registration-only",
  "workflow test-node": "registration-only",
  "workflow trigger": "registration-only",
  "workflow unpublish": "registration-only",
  "workflow update": "registration-only",
  "workflow upload-icon": "registration-only",
  "workflow validate": "registration-only",

  // ── workspace ──────────────────────────────────────────────────────────────
  "workspace create": "registration-only",
  // Returns an AWS credential triplet on stdout — the shape the docblock above
  // refuses no matter how well it reads. Not `registration-only`: that
  // disposition admits a leaf with a required positional into the id-graph
  // ledger, and a `<mountId>` is not a route parameter anything can thread.
  "workspace credential-process": "never-execute",
  "workspace delete": "registration-only",
  "workspace history": "registration-only",
  "workspace list": "safe",
  "workspace mount": "never-execute", // mounts a FUSE drive on the caller's filesystem
  "workspace pull": "never-execute", // writes files into the caller's filesystem and runs its unzip
  "workspace push": "registration-only",
  "workspace remount": "never-execute", // mints and mounts a drive on the caller's filesystem
  "workspace rename": "registration-only",
  "workspace restore": "registration-only",
  "workspace revert": "registration-only",
  "workspace search": "registration-only",
  "workspace status": "registration-only",
  "workspace unmount": "never-execute" // unmounts a drive the caller may be using
};
