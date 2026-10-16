/**
 * THE OBLIGATION SET. Every entry is driven with no terminal and no `--yes`,
 * and must be OBSERVED calling `confirmDestructive` and then acting on nothing.
 *
 * A line is added here by making the command confirm, never the other way
 * round: the drive is the evidence, so an entry whose command does not ask reds
 * by name on the very next run.
 */
export const CONFIRMS_BEFORE_ACTING: readonly string[] = [
  "agent delete",
  "agent-skill delete",
  "agent-tool delete",
  "apps delete",
  "apps deployments cancel",
  "apps domains remove",
  "apps git-project delete",
  "apps rotate-edge-token",
  "asset delete",
  "channel whatsapp-template delete",
  "claude-code install",
  "collection delete",
  "credential delete",
  "custom-model delete",
  "customer delete",
  "deployment delete",
  "deployment folder delete",
  "deployment template detach",
  "document delete",
  "emulator scenario delete",
  "emulator session delete",
  "eval conv delete",
  "eval run abort",
  "folder delete",
  "html-template delete",
  "phone-number buy",
  "phone-number release",
  "prompt variant archive",
  "prompt-assistant delete-thread",
  "skill-folder delete",
  "skills update",
  "task delete",
  "task-eval session delete",
  "template delete",
  "template folder delete",
  "tool delete-credential",
  "tracks memory delete",
  "user-group delete",
  "version delete",
  "version restore",
  "workflow branch delete",
  "workflow delete",
  "workflow edge delete",
  "workflow node delete",
  "workspace delete",
  "workspace revert"
];

/**
 * A candidate that legitimately asks nothing, and WHY.
 *
 * The reason is required and is checked for length, so an entry cannot be added
 * without saying something. It cannot be checked for truth — a reader is the
 * only thing that does that, which is exactly why the list is short and each
 * line names the property that makes destruction impossible.
 */
export const NOT_DESTRUCTIVE: Readonly<Record<string, string>> = {
  "auth unpin":
    "Removes ./.nexusrc, a one-line POINTER at a profile. It holds no credential of its " +
    "own and `auth pin` writes it back, so nothing is lost that a second command cannot undo.",
  "execution cancel":
    "Stops a PENDING/RUNNING execution and its loop children. The execution records and " +
    "every node result already produced survive; nothing stored is removed.",
  "workspace restore":
    "Recovers deleted files from the S3 backup. It only ever ADDS objects back — its own " +
    "help states live files are never overwritten — so there is nothing to lose by running it.",
  "workspace unmount":
    "A local mount-registry edit that makes no API call at all. The workspace and every " +
    "file in it are untouched, and `workspace mount` puts the mount point back. On a direct " +
    "row it also deletes the mount's session directory (a key `workspace mount --engine direct` " +
    "mints again) and its cache ONLY when that holds nothing: saves not yet uploaded stay " +
    "there, counted, and the next direct mount of the workspace under the same organization " +
    "uploads them."
};
