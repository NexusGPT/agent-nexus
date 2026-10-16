/**
 * NAMED DEBT: it destroys, and it asks nothing.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 THIS LIST IS NOT AN EXEMPTION. IT IS A MEASUREMENT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every entry is DRIVEN like the obligation set, and is required to still fail
 * to ask — so a line that stops being true is reported, in both directions. It
 * cannot silently absorb a new command either: adding one is an edit to a
 * constant named `UNCONFIRMED_DESTRUCTIVE`, which is not a thing anyone does by
 * accident at 2am to unblock a build.
 *
 * ⚠️ CLEARING A LINE IS A BREAKING CHANGE TO A SCRIPT, WHICH IS WHY THEY ARE
 * STILL HERE. Making one of these confirm means it starts REFUSING when run
 * from a pipeline without `--yes` — the correct direction, and the same
 * direction the 44 commands in `CONFIRMS_BEFORE_ACTING` already took, but a CLI
 * compatibility note belongs with it. That is the sequencing, not a doubt about
 * the fix.
 */
export const UNCONFIRMED_DESTRUCTIVE: Readonly<Record<string, string>> = {
  "access-card delete": "Deletes an access card, and with it whatever it was scoping.",
  "admin vibe-tenant-cluster disable":
    "Opts an org out of its dedicated cluster. DISABLED_RETAINED keeps the data, and the " +
    "org still loses its cluster with nobody asked.",
  "agent-collection detach":
    "Takes knowledge collections off an agent. The sibling " +
    "`deployment template detach` confirms; this one does not.",
  "apps env rm": "Deletes an environment variable from a Vibe app; the value is not recoverable.",
  "auth logout":
    "Deletes a stored profile — the API key and its org metadata. The key is not " +
    "recoverable from here once the file is gone.",
  "collection remove-document": "Takes a document out of a collection.",
  "external-tool delete":
    "Deletes an external tool, and every agent wired to it loses the action. " +
    "🚨 ITS `--force` MEANS CASCADE, NOT CONSENT — it also deletes the agent tool " +
    "configs referencing the tool. `confirmDestructive` reads `opts.force` AS " +
    "consent, so the obvious two-line fix here makes the widest-blast-radius " +
    "invocation the one that skips the question. Pass `{ yes: opts.yes }` " +
    "explicitly rather than spreading `opts`.",
  "permissions revoke": "Removes a principal's grant on a resource.",
  "role delete": "Deletes a Role, and with it every grant, board and duty hanging off it.",
  "role delete-job-type": "Removes a job type from the organization's library.",
  "role delete-permission-set": "Deletes a permission set.",
  "role detach": "Takes a system out of its Role, which its own description says DISABLES access.",
  "role remove-board": "Deletes a lane; its cards fall back to Ungrouped.",
  "role remove-member": "Removes a user's ADMIN or MEMBER standing in a Role.",
  "role remove-permission-set-member": "Takes a user out of one of a Role's permission sets.",
  "role remove-responsibility": "Removes a duty from a Role.",
  "role revoke-collection": "Removes a Role's access to a knowledge collection.",
  "role revoke-workspace": "Removes a Role's access to a file workspace.",
  "tracing delete":
    "Deletes a trace and every generation under it. Its own description ends " +
    '"permanent, no confirmation" — written down, and until now checked by nothing.',
  "user-group remove-member": "Removes one user from a group.",
  "workflow unpublish":
    "Takes a published workflow back to DRAFT and DEACTIVATES its production triggers. " +
    'Its own help calls it "a disabling, not a tidy-up" — a live webhook or schedule stops ' +
    "firing and agents holding it as a tool stop being able to run it."
};
