/**
 * Every `nexus role` verb, grouped by what it is FOR.
 *
 * Commander prints subcommands in ONE alphabetical block, so `coverage` — the
 * cost model — lands between `collection-grants` and `create`, which are the
 * Role's identity. Read in that order the namespace looks both larger and
 * flatter than it is, and the audit reported exactly that.
 *
 * 🚨 A SECOND LIST OF VERBS DRIFTS FROM THE FIRST AS SOON AS ONE IS ADDED, AND
 * `--help` CANNOT SAY SO — a new verb is simply absent from the index and the
 * page still renders, correct-looking and incomplete. That is the failure mode
 * of every hand-maintained index, so this one is not trusted:
 * `role-namespace-index.test.ts` reads the LIVE commander tree and refuses a
 * verb no area claims AND an area naming a verb that no longer exists. Adding a
 * verb reds that spec by name until an area takes it.
 *
 * The count in the rendered text is derived from this list for the same reason —
 * a number written by hand is the one part of an index nobody re-checks.
 */
export const ROLE_NAMESPACE_AREAS: ReadonlyArray<{
  readonly label: string;
  readonly verbs: readonly string[];
}> = [
  {
    label: "THE ROLE",
    verbs: [
      "list",
      "get",
      "create",
      "update",
      "delete",
      "pause",
      "resume",
      "responsibilities",
      "add-responsibility",
      "remove-responsibility"
    ]
  },
  {
    label: "PEOPLE",
    verbs: [
      "members",
      "add-member",
      "remove-member",
      "permission-sets",
      "create-permission-set",
      "update-permission-set",
      "delete-permission-set",
      "add-permission-set-member",
      "remove-permission-set-member"
    ]
  },
  {
    label: "WHAT IT REACHES",
    verbs: [
      "systems",
      "attach",
      "detach",
      "system-policy",
      "set-system-policy",
      "collection-grants",
      "grant-collection",
      "revoke-collection",
      "workspace-grants",
      "grant-workspace",
      "revoke-workspace"
    ]
  },
  {
    label: "THE OVERVIEW",
    verbs: ["boards", "add-board", "reorder-boards", "update-board", "remove-board", "move-card"]
  },
  {
    label: "REQUESTS",
    verbs: [
      "governance",
      "access-requests",
      "request-access",
      "review-access",
      "creation-requests",
      "creation-request",
      "review-creation-request",
      "deletion-requests",
      "deletion-request",
      "review-deletion-request"
    ]
  },
  {
    label: "THE COST MODEL",
    verbs: [
      "coverage",
      "automation-settings",
      "set-automation-settings",
      // FILED UNDER THE COST MODEL RATHER THAN BESIDE `set-system-policy`, even
      // though both write a fact about a system. What a reader is looking for
      // when they reach this index is what MOVES the figure, and this is the
      // only verb here besides `set-automation-settings` that does — the policy
      // write moves nothing.
      "set-system-lifecycle",
      "job-types",
      "create-job-type",
      "update-job-type",
      "delete-job-type",
      "scope-lines",
      "set-scope-lines",
      "variables",
      "set-variables",
      "working-year",
      "set-working-year",
      "tasks",
      "set-tasks",
      "task-duties",
      "set-task-duties"
    ]
  }
];
