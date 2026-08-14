import type { Command } from "commander";

/**
 * THE PROBE BARRIER — which `--help` claims nobody can check for free.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS EXISTS TO STOP
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * An empirical audit of 674 shipped `--help` claims settled 581 of them by
 * running the command and reading what happened: 398 TRUE, 75 FALSE, 108 with a
 * behaviour the help never states. It left 93 UNTESTED — not passing, UNMEASURED
 * — because probing them buys a phone number, spends a model provider's tokens,
 * provisions a cluster, or delivers a message to a real customer.
 *
 * 🚨 THOSE CLAIMS SHIP IN EXACTLY THE SAME TYPEFACE AS THE 398 THAT WERE
 * VERIFIED. A reader cannot tell them apart, and that is worse than any single
 * false line, because it is a hundred of them and it is invisible. This module
 * makes the difference say itself.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE CRITERION, AND WHY IT IS ABOUT THE ACT AND NEVER ABOUT THE CLAIM
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A leaf carries a barrier when THE ACT THAT WOULD SETTLE ITS CLAIMS cannot be
 * performed and then fully undone inside this organisation at zero external
 * cost. That is a property of the command, so it is stable, and one person can
 * check every line of the table below by reading what the command does.
 *
 * The alternative — classifying each SENTENCE as verified or not — was rejected.
 * The audit enumerated only the 183 rows it found wrong; the 398 it confirmed and
 * the 93 it skipped exist as counts and nowhere else, so there is no per-claim
 * corpus to key off and inventing one would be a second thing to drift.
 *
 * ⚠️ SO THE MARKER IS A CEILING ON CONFIDENCE, NEVER A VERDICT ON A SENTENCE. A
 * barrier'd command may still have been probed in part — `conversation
 * send-message` was, on an EMBED conversation with no live widget attached, which
 * is why its help carries a FALSE row today. What the barrier says is that the
 * reader cannot repeat that check for free, so the notes are intent until they
 * pay for it. Reading it as "this line is wrong" is the misreading to avoid.
 *
 * ── THE THREE BARRIERS ──────────────────────────────────────────────────────
 *
 *   money        the act spends real money — a carrier purchase, provider
 *                inference, build minutes, serving capacity.
 *   third-party  the act reaches a system or a person outside this organisation
 *                — a customer's channel, Meta, Linear, a tenant git host.
 *   setup        the act needs an external resource this organisation does not
 *                have — an OAuth connection, a verified sender, an operator token.
 *
 * Where several apply, the table names the most expensive one. `phone-number
 * buy` also reaches a carrier and also needs a billing subaccount; calling it
 * `money` is the fact a reader has to act on.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT `COMMAND_CLASSIFICATION`, WHICH ALREADY LOOKS LIKE IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `command-universe.ts` already declares a disposition per leaf, and its
 * `never-execute` bucket reads like this one. It is a different axis and reusing
 * it would have been the false green: it asks WHAT MAY THE SWEEP RUN, so it
 * fences what is self-modifying, interactive or credential-destroying. Cost and
 * blast radius are not in it.
 *
 * Measured against the table below: 103 of these 109 leaves are
 * `registration-only` there — the same bucket as `agent get`. `phone-number buy`,
 * which starts a monthly carrier charge, and `agent get`, which reads a row, are
 * one word apart from each other and identical to any tool reading that file. The
 * separation rate is 6 of 109. Going the other way, 30 `never-execute` leaves
 * carry NO barrier here: `upgrade` and its 17 hidden aliases reinstall the binary
 * — ruinous for a sweep, free for a person on a throwaway machine.
 *
 * The two are cross-checked rather than merged. `probe-barrier.test.ts` asserts
 * no leaf the sweep executes as `safe` carries a barrier, because a command a
 * robot runs unattended against production by definition costs nothing.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 WHERE THIS LINE ARRIVES, AND WHERE IT DOES NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It is installed by a walk in `buildRootProgram`, so it reaches `--help` in a
 * terminal. IT DOES NOT REACH THE GENERATED DOCS PAGES, and that is a defect in
 * the docs projection rather than a choice made here.
 *
 * `deriveCommandNodes()` rebuilds the tree from the namespace registrars alone
 * (`command-universe.ts`), so nothing `buildRootProgram` applies AFTER them is in
 * the tree the pages are projected from. Measured on this tree: the
 * `known-issues` footer, which landed the same way, is on 500 of 501 leaves in
 * the real program and on 0 of 501 in the docs projection — and on 0 of the 47
 * pages. `cli-docs-are-generated.test.ts` is green over that, because the page
 * and the projection agree with each other while both disagree with `--help`.
 *
 * The one-line fix is `deriveCommandNodes()` calling `buildRootProgram()`, which
 * that module's own header already names as the intended end state. It is not
 * done here because it pulls the known-issues footer into all 47 generated pages
 * in the same diff, and those pages belong to the docs lane.
 */

/** What stands between a reader and an observed check. */
export type ProbeBarrier = "money" | "third-party" | "setup";

export interface ProbeBarrierEntry {
  readonly barrier: ProbeBarrier;
  /** The act, in the present tense, naming what it spends or what it touches. */
  readonly why: string;
  /** A free check that settles part of the same ground, when one exists. */
  readonly safeCheck?: string;
}

/**
 * EVERY LEAF WHOSE `--help` CANNOT BE CHECKED FOR FREE. Declared, never derived.
 *
 * Intent is not derivable — no scan can know that `phone-number buy` bills
 * monthly — so this is written out, and `probe-barrier.test.ts` floors it in
 * both directions: a key that names no leaf in the tree is RED (a rename or a
 * deletion), and a leaf named here must carry its line in the rendered help.
 *
 * ⚠️ A NEW BILLED COMMAND IS THE HOLE THIS TABLE CANNOT CLOSE BY ITSELF, and
 * saying so is worth more than a claim of completeness. The gate cannot demand
 * an entry for a leaf whose cost only a human knows. What it does instead is
 * make the ABSENCE visible from the other side: `COMMAND_CLASSIFICATION` already
 * refuses a leaf it does not name, so every new command already forces one
 * deliberate declaration, and the spec beside this file asks for the second in
 * the same breath.
 */
export const PROBE_BARRIER: Readonly<Record<string, ProbeBarrierEntry>> = {
  // ── admin ─────────────────────────────────────────────────────────────────
  "admin vibe-build-job claim": {
    barrier: "setup",
    why: "drives a real build or deployment state machine and needs an operator (Clerk) token this lane does not hold",
    safeCheck:
      "`admin vibe-cost-safety get <orgId>` is the read-only probe that proves the token parses; it defaults to OK when no row exists"
  },
  "admin vibe-build-job fail": {
    barrier: "setup",
    why: "drives a real build or deployment state machine and needs an operator (Clerk) token this lane does not hold",
    safeCheck:
      "`admin vibe-cost-safety get <orgId>` is the read-only probe that proves the token parses; it defaults to OK when no row exists"
  },
  "admin vibe-build-job succeed": {
    barrier: "setup",
    why: "drives a real build or deployment state machine and needs an operator (Clerk) token this lane does not hold",
    safeCheck:
      "`admin vibe-cost-safety get <orgId>` is the read-only probe that proves the token parses; it defaults to OK when no row exists"
  },
  "admin vibe-build-job time-out": {
    barrier: "setup",
    why: "drives a real build or deployment state machine and needs an operator (Clerk) token this lane does not hold",
    safeCheck:
      "`admin vibe-cost-safety get <orgId>` is the read-only probe that proves the token parses; it defaults to OK when no row exists"
  },
  "admin vibe-build-job-timeout-sweep trigger": {
    barrier: "money",
    why: "fires a real sweep or runner tick, which dispatches real builds and deployments"
  },
  "admin vibe-build-runner tick": {
    barrier: "money",
    why: "fires a real sweep or runner tick, which dispatches real builds and deployments"
  },
  "admin vibe-consumption-cap get": {
    barrier: "setup",
    why: "needs an operator (Clerk) token this lane does not hold"
  },
  "admin vibe-consumption-cap set": {
    barrier: "setup",
    why: "needs an operator (Clerk) token this lane does not hold"
  },
  "admin vibe-cost-safety get": {
    barrier: "setup",
    why: "needs an operator (Clerk) token this lane does not hold"
  },
  "admin vibe-cost-safety list": {
    barrier: "setup",
    why: "needs an operator (Clerk) token this lane does not hold"
  },
  "admin vibe-cost-safety set": {
    barrier: "setup",
    why: "needs an operator (Clerk) token this lane does not hold"
  },
  "admin vibe-deployment await-approval": {
    barrier: "setup",
    why: "drives a real build or deployment state machine and needs an operator (Clerk) token this lane does not hold",
    safeCheck:
      "`admin vibe-cost-safety get <orgId>` is the read-only probe that proves the token parses; it defaults to OK when no row exists"
  },
  "admin vibe-deployment begin-deploy": {
    barrier: "setup",
    why: "drives a real build or deployment state machine and needs an operator (Clerk) token this lane does not hold",
    safeCheck:
      "`admin vibe-cost-safety get <orgId>` is the read-only probe that proves the token parses; it defaults to OK when no row exists"
  },
  "admin vibe-deployment build-succeeded": {
    barrier: "setup",
    why: "drives a real build or deployment state machine and needs an operator (Clerk) token this lane does not hold",
    safeCheck:
      "`admin vibe-cost-safety get <orgId>` is the read-only probe that proves the token parses; it defaults to OK when no row exists"
  },
  "admin vibe-deployment mark-failed": {
    barrier: "setup",
    why: "drives a real build or deployment state machine and needs an operator (Clerk) token this lane does not hold",
    safeCheck:
      "`admin vibe-cost-safety get <orgId>` is the read-only probe that proves the token parses; it defaults to OK when no row exists"
  },
  "admin vibe-deployment mark-healthy": {
    barrier: "setup",
    why: "drives a real build or deployment state machine and needs an operator (Clerk) token this lane does not hold",
    safeCheck:
      "`admin vibe-cost-safety get <orgId>` is the read-only probe that proves the token parses; it defaults to OK when no row exists"
  },
  "admin vibe-deployment mark-rolled-back": {
    barrier: "setup",
    why: "drives a real build or deployment state machine and needs an operator (Clerk) token this lane does not hold",
    safeCheck:
      "`admin vibe-cost-safety get <orgId>` is the read-only probe that proves the token parses; it defaults to OK when no row exists"
  },
  "admin vibe-deployment-runner tick": {
    barrier: "money",
    why: "fires a real sweep or runner tick, which dispatches real builds and deployments"
  },
  "admin vibe-rollback-sweep trigger": {
    barrier: "money",
    why: "fires a real sweep or runner tick, which dispatches real builds and deployments"
  },
  "admin vibe-tenant-cluster disable": {
    barrier: "money",
    why: "opts an organisation out of the cluster it is being served from"
  },
  "admin vibe-tenant-cluster provision": {
    barrier: "money",
    why: "provisions a dedicated cluster for an organisation and bills for it"
  },

  // ── agent ─────────────────────────────────────────────────────────────────
  "agent generate-profile-picture": {
    barrier: "money",
    why: "generates an image through a paid provider"
  },

  // ── agent-eval ────────────────────────────────────────────────────────────
  "agent-eval batch create": {
    barrier: "money",
    why: "creates AND enqueues a batch over a conversation filter, so it bills for every conversation the filter matches"
  },
  "agent-eval run execute": {
    barrier: "money",
    why: "enqueues the run, which drives the agent against a model provider and is billed per token",
    safeCheck: "`agent-eval run create` leaves the run in DRAFT and spends nothing"
  },
  "agent-eval schedule create": {
    barrier: "money",
    why: "installs a cron that executes runs unattended, so it bills on every tick",
    safeCheck: "`agent-eval schedule list` reads the installed schedules"
  },
  "agent-eval schedule resume": {
    barrier: "money",
    why: "restarts an unattended cron that bills on every tick"
  },
  "agent-eval trigger upsert": {
    barrier: "money",
    why: "installs an automatic trigger that executes runs on conversation close, so it bills without an operator"
  },

  // ── auth ──────────────────────────────────────────────────────────────────
  "auth login": {
    barrier: "setup",
    why: "writes credentials into the caller's profile store"
  },
  "auth logout": {
    barrier: "setup",
    why: "destroys the credentials the caller is authenticated with"
  },

  // ── channel ───────────────────────────────────────────────────────────────
  "channel connect-waba": {
    barrier: "third-party",
    why: "opens Meta's Embedded Signup and links a real WhatsApp Business Account to this organisation"
  },
  "channel connection create": {
    barrier: "setup",
    why: "creates the one messaging connection an organisation may hold; it binds provider credentials this organisation does not have"
  },
  "channel setup": {
    barrier: "setup",
    why: "auto-provisions channel prerequisites against the provider"
  },
  "channel whatsapp-sender create": {
    barrier: "third-party",
    why: "registers a phone number with WhatsApp Business; the registration lives on Meta's side",
    safeCheck:
      "`channel whatsapp-sender list` reads the live Meta registration state without writing"
  },
  "channel whatsapp-sender get": {
    barrier: "setup",
    why: "reads a sender that only exists once a WABA is connected",
    safeCheck: "`channel whatsapp-sender list` on a connected org"
  },
  "channel whatsapp-template approvals": {
    barrier: "setup",
    why: "reads Meta's approval queue for a connected WABA"
  },
  "channel whatsapp-template create": {
    barrier: "third-party",
    why: "creates a message template inside Meta's WABA"
  },
  "channel whatsapp-template delete": {
    barrier: "third-party",
    why: "deletes the template on Meta's side and its approval dies with it"
  },
  "channel whatsapp-template get": {
    barrier: "setup",
    why: "reads a template that only exists inside a connected WABA",
    safeCheck: "`channel whatsapp-template list`"
  },
  "channel whatsapp-template submit-approval": {
    barrier: "third-party",
    why: "submits the template to Meta for human review"
  },
  "channel whatsapp-template test-send": {
    barrier: "money",
    why: "sends a real WhatsApp message to a real phone and is billed by Meta; --help says there is no dry run"
  },

  // ── cloud-import ──────────────────────────────────────────────────────────
  "cloud-import browse": {
    barrier: "setup",
    why: "reads the provider through an OAuth connection this organisation does not hold",
    safeCheck: "`cloud-import providers` states what each provider supports and needs no connection"
  },
  "cloud-import google-drive import": {
    barrier: "setup",
    why: "reads Google Drive through an OAuth connection this organisation does not hold",
    safeCheck: "`cloud-import providers` states what each provider supports and needs no connection"
  },
  "cloud-import google-drive list-files": {
    barrier: "setup",
    why: "reads Google Drive through an OAuth connection this organisation does not hold",
    safeCheck: "`cloud-import providers` states what each provider supports and needs no connection"
  },
  "cloud-import import": {
    barrier: "setup",
    why: "reads the provider through an OAuth connection this organisation does not hold",
    safeCheck: "`cloud-import providers` states what each provider supports and needs no connection"
  },
  "cloud-import notion import": {
    barrier: "setup",
    why: "reads Notion through an OAuth connection this organisation does not hold",
    safeCheck: "`cloud-import providers` states what each provider supports and needs no connection"
  },
  "cloud-import notion search": {
    barrier: "setup",
    why: "reads Notion through an OAuth connection this organisation does not hold",
    safeCheck: "`cloud-import providers` states what each provider supports and needs no connection"
  },
  "cloud-import search": {
    barrier: "setup",
    why: "reads the provider through an OAuth connection this organisation does not hold",
    safeCheck: "`cloud-import providers` states what each provider supports and needs no connection"
  },
  "cloud-import sharepoint import": {
    barrier: "setup",
    why: "reads SharePoint through an OAuth connection this organisation does not hold",
    safeCheck: "`cloud-import providers` states what each provider supports and needs no connection"
  },
  "cloud-import sharepoint list-files": {
    barrier: "setup",
    why: "reads SharePoint through an OAuth connection this organisation does not hold",
    safeCheck: "`cloud-import providers` states what each provider supports and needs no connection"
  },

  // ── collection ────────────────────────────────────────────────────────────
  "collection query": {
    barrier: "money",
    why: "embeds the query through a paid provider"
  },
  "collection search": {
    barrier: "money",
    why: "embeds the query through a paid provider"
  },
  "collection search-multiple": {
    barrier: "money",
    why: "embeds the query through a paid provider once per collection"
  },

  // ── conversation ──────────────────────────────────────────────────────────
  "conversation send-message": {
    barrier: "third-party",
    why: "delivers the text to the customer on their real channel, immediately, as the agent"
  },
  "conversation send-template": {
    barrier: "money",
    why: "sends a billed WhatsApp template to the customer's real number"
  },

  // ── document ──────────────────────────────────────────────────────────────
  "document add-website": {
    barrier: "money",
    why: "crawls a third party's live site and embeds every page it fetches"
  },
  "document create-google-sheet": {
    barrier: "setup",
    why: "reads a Google Sheet through a connection this organisation does not hold"
  },
  "document reprocess": {
    barrier: "money",
    why: "re-embeds the document through a paid embedding provider"
  },

  // ── emulator ──────────────────────────────────────────────────────────────
  "emulator scenario replay": {
    barrier: "money",
    why: "re-drives every turn of the scenario against a model provider and is billed per token"
  },
  "emulator send": {
    barrier: "money",
    why: "drives the agent for one turn against a model provider and is billed per token"
  },

  // ── external-tool ─────────────────────────────────────────────────────────
  "external-tool execute": {
    barrier: "third-party",
    why: "calls the tool's real endpoint with real credentials"
  },
  "external-tool initiate-oauth": {
    barrier: "third-party",
    why: "performs a client_credentials exchange against the provider's token endpoint"
  },
  "external-tool test": {
    barrier: "third-party",
    why: "calls the tool's real endpoint with real credentials"
  },
  "external-tool test-auth": {
    barrier: "third-party",
    why: "calls a real operation on the tool's endpoint to prove the credential"
  },
  "external-tool update-auth": {
    barrier: "setup",
    why: "binds credentials issued by a provider this organisation is not connected to"
  },

  // ── phone-number ──────────────────────────────────────────────────────────
  "phone-number buy": {
    barrier: "money",
    why: "purchases a number from the carrier and starts a monthly charge",
    safeCheck: "`phone-number search` lists purchasable numbers without buying one"
  },
  "phone-number get": {
    barrier: "setup",
    why: "reads a number this organisation must already own",
    safeCheck: "`phone-number list` on an org that owns one"
  },
  "phone-number release": {
    barrier: "money",
    why: "returns a paid number to the carrier permanently and silences the channel bound to it"
  },
  "phone-number search": {
    barrier: "setup",
    why: "queries the carrier's live inventory through this organisation's provider subaccount"
  },

  // ── prompt-assistant ──────────────────────────────────────────────────────
  "prompt-assistant chat": {
    barrier: "money",
    why: "drives the prompt assistant against a model provider and is billed per token",
    safeCheck: "`prompt-assistant list-threads` reads past threads and spends nothing"
  },

  // ── task ──────────────────────────────────────────────────────────────────
  "task execute": {
    barrier: "money",
    why: "runs the task against a model provider and is billed per token"
  },

  // ── task-eval ─────────────────────────────────────────────────────────────
  "task-eval execute": {
    barrier: "money",
    why: "runs the evaluation against a model provider and is billed per token"
  },
  "task-eval judge": {
    barrier: "money",
    why: "runs a judge model over the results and is billed per token"
  },

  // ── ticket ────────────────────────────────────────────────────────────────
  "ticket attach": {
    barrier: "third-party",
    why: "uploads a file onto a real Linear issue",
    safeCheck: "`ticket list` and `ticket get <id>` read Linear without writing to it"
  },
  "ticket close": {
    barrier: "third-party",
    why: "transitions a real Linear issue to a terminal status",
    safeCheck: "`ticket list` and `ticket get <id>` read Linear without writing to it"
  },
  "ticket comment": {
    barrier: "third-party",
    why: "posts a comment on a real Linear issue",
    safeCheck: "`ticket list` and `ticket get <id>` read Linear without writing to it"
  },
  "ticket create": {
    barrier: "third-party",
    why: "files a real issue in Linear that the team sees",
    safeCheck: "`ticket list` and `ticket get <id>` read Linear without writing to it"
  },
  "ticket update": {
    barrier: "third-party",
    why: "edits a real Linear issue",
    safeCheck: "`ticket list` and `ticket get <id>` read Linear without writing to it"
  },

  // ── tool ──────────────────────────────────────────────────────────────────
  "tool connect": {
    barrier: "third-party",
    why: "opens a browser OAuth flow and writes a credential at the provider"
  },
  "tool connection-status": {
    barrier: "setup",
    why: "polls a handshake that only exists after a browser OAuth flow"
  },
  "tool create-credential": {
    barrier: "setup",
    why: "completes a Pipedream handshake started in a browser"
  },
  "tool delete-credential": {
    barrier: "third-party",
    why: "revokes a credential the provider issued"
  },
  "tool execute": {
    barrier: "third-party",
    why: "performs the action on the third party's live system with real credentials"
  },
  "tool resolve-options": {
    barrier: "setup",
    why: "asks the third party to enumerate a dropdown, so it needs a live credential"
  },
  "tool test": {
    barrier: "third-party",
    why: "invokes the configured tool against the third party's live system"
  },

  // ── vibe ──────────────────────────────────────────────────────────────────
  "vibe app attach-repo": {
    barrier: "money",
    why: "binds a real git project to a served application"
  },
  "vibe app create": {
    barrier: "money",
    why: "creates a served application and the capacity behind it"
  },
  "vibe app delete": {
    barrier: "money",
    why: "destroys a served application and stops serving it"
  },
  "vibe app edge-token": {
    barrier: "third-party",
    why: "reveals the bearer token that reaches a private deployed app"
  },
  "vibe app logs": {
    barrier: "setup",
    why: "streams runtime logs from a real deployed application"
  },
  "vibe app provision-repo": {
    barrier: "money",
    why: "provisions a git project on the tenant git host"
  },
  "vibe app reprovision-repo": {
    barrier: "money",
    why: "re-provisions a git project on the tenant git host"
  },
  "vibe app rotate-edge-token": {
    barrier: "third-party",
    why: "retires the token every existing caller of the private app is using"
  },
  "vibe app visibility": {
    barrier: "third-party",
    why: "changes who on the public internet may reach a deployed app"
  },
  "vibe approvals decide": {
    barrier: "third-party",
    why: "records a real approval decision that releases or blocks a production deployment"
  },
  "vibe cluster provision": {
    barrier: "money",
    why: "provisions this organisation's dedicated AWS cluster and bills for it until it is disabled"
  },
  "vibe deploy": {
    barrier: "money",
    why: "starts a real build and a real deployment, which consume build minutes and serving capacity"
  },
  "vibe deploy-state": {
    barrier: "setup",
    why: "answers about a real deployed application this organisation does not have"
  },
  "vibe git-credentials": {
    barrier: "third-party",
    why: "mints and reveals this organisation's git push token"
  },
  "vibe git-project clone": {
    barrier: "third-party",
    why: "clones from the tenant git host onto the caller's machine"
  },
  "vibe git-project create": {
    barrier: "third-party",
    why: "creates a repository on the tenant git host"
  },
  "vibe git-project delete": {
    barrier: "third-party",
    why: "destroys a repository on the tenant git host and releases its name"
  },
  "vibe git-project pull": {
    barrier: "third-party",
    why: "fetches from the tenant git host onto the caller's machine"
  },
  "vibe git-project reprovision": {
    barrier: "third-party",
    why: "re-provisions a repository on the tenant git host"
  },
  "vibe rollback": {
    barrier: "money",
    why: "starts a real deployment of the previous version"
  },

  // ── workflow ──────────────────────────────────────────────────────────────
  "workflow node reload-props": {
    barrier: "setup",
    why: "asks Pipedream to re-resolve the node's dynamic props, so it needs a live connected account"
  },
  "workflow node test": {
    barrier: "money",
    why: "executes the node for real, so a model node bills and a tool node calls the third party"
  },
  "workflow node test-payload": {
    barrier: "setup",
    why: "reports a webhook trigger's URLs and the last payload a real external caller sent"
  },
  "workflow test": {
    barrier: "money",
    why: "executes the workflow for real: every model node bills, every tool node calls the third party"
  },
  "workflow test-node": {
    barrier: "money",
    why: "executes the node for real, so a model node bills and a tool node calls the third party"
  }
};

/**
 * The stable half of the sentence.
 *
 * Exported for the same reason `KNOWN_ISSUES_HELP_PREFIX` is: a gate asserting
 * against a second copy typed into a test lets the line be reworded into
 * uselessness with the gate still green.
 */
export const PROBE_BARRIER_HELP_PREFIX = "Probe barrier";

/**
 * Wrap to the width the rest of this CLI's help is written to.
 *
 * The `why` and `safeCheck` strings are DATA, so they cannot be hand-wrapped in
 * the table the way a `Notes:` block is hand-wrapped in a command file. Left
 * unwrapped they render as one long line that a narrow terminal breaks at an
 * arbitrary column, mid-word, with no indent — which reads as a rendering
 * fault and undermines the one line whose whole job is to be believed.
 */
function wrap(text: string, indent: string): string {
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(" ")) {
    if (current === "") current = word;
    else if (`${current} ${word}`.length + indent.length <= 78) current = `${current} ${word}`;
    else {
      lines.push(indent + current);
      current = word;
    }
  }
  if (current !== "") lines.push(indent + current);

  return lines.join("\n");
}

/** The line, for one entry. Exported so the gate asserts one string, not a copy of it. */
export function probeBarrierHelpLine(entry: ProbeBarrierEntry): string {
  const body =
    `This command ${entry.why}. Checking the notes above therefore costs something ` +
    `a reader may not want to spend, so treat them as UNVERIFIED rather than as ` +
    `observed behaviour.`;

  const safe =
    entry.safeCheck === undefined
      ? ""
      : `\n${wrap(`Safe check without paying it: ${entry.safeCheck}`, "  ")}`;

  return (
    `\n${PROBE_BARRIER_HELP_PREFIX} — ${entry.barrier.toUpperCase()}` +
    `\n${wrap(body, "  ")}` +
    safe
  );
}

/**
 * Install the line on every barrier'd command in the tree.
 *
 * Call LAST in `buildRootProgram`, after every registrar, or the commands
 * registered afterwards are not in the tree this walks.
 *
 * The walk is the whole population and the table is the filter, which is the
 * same shape as `known-issues-help.ts`: there is no list of participating
 * commands to keep in step, and a namespace added tomorrow is walked whether or
 * not anyone remembered this file.
 */
export function applyProbeBarrierHelpLine(program: Command): void {
  const visit = (command: Command, prefix: readonly string[]): void => {
    const path = command.parent ? [...prefix, command.name()] : [];
    const children = (command.commands as Command[]).filter((c) => c.name() !== "help");

    if (children.length === 0) {
      const entry = PROBE_BARRIER[path.join(" ")];
      if (entry !== undefined) command.addHelpText("after", probeBarrierHelpLine(entry));
    }

    for (const child of children) visit(child, path);
  };

  visit(program, []);
}
