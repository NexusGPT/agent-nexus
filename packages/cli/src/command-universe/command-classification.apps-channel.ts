/**
 * DECLARED DISPOSITIONS, `apps approvals decide` … `channel whatsapp-template test-send`.
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

/** 71 leaves, `apps approvals decide` … `channel whatsapp-template test-send`. */
export const APPS_TO_CHANNEL: Readonly<Record<string, CommandDisposition>> = {
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
  "channel whatsapp-template test-send": "registration-only"
};
