import type { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { color, type Column, isJsonMode, printRecord, printSuccess, printTable } from "../output";
import { confirmable, confirmDestructive } from "../util/confirm";
import {
  WORKSPACE_CREATE_CONTRACT,
  WORKSPACE_DELETE_CONTRACT,
  WORKSPACE_LIST_CONTRACT,
  WORKSPACE_RENAME_CONTRACT,
  WORKSPACE_RESTORE_CONTRACT,
  WORKSPACE_SEARCH_CONTRACT
} from "./workspace.contract.generated";
import { registerWorkspaceCredentialProcessCommand } from "./workspace-credential-process";
import { registerWorkspaceHistoryCommand } from "./workspace-history";
import { registerWorkspaceMountCommand } from "./workspace-mount";
import { sharedWorkspaceId } from "./workspace-mount/shared-workspace-id";
import { registerWorkspacePullCommand } from "./workspace-pull";
import { registerWorkspacePushCommand } from "./workspace-push";
import { registerWorkspaceRemountCommand } from "./workspace-remount";
import { registerWorkspaceRevertCommand } from "./workspace-revert";
import { registerWorkspaceStatusCommand } from "./workspace-status";
import { registerWorkspaceUnmountCommand } from "./workspace-unmount";

// The `workspace` namespace and its six Public API v1 verbs (`push`, `pull`,
// `history`, `revert` and `credential-process`, the other contract-bound
// subcommands, bind inside their own registrars). The four drive verbs live one per file (`workspace-mount.ts`,
// `workspace-remount.ts`, `workspace-unmount.ts`, `workspace-status.ts`), the
// engines they drive in `workspace-mount-gateway.ts` and
// `workspace-mount-direct.ts`, and what those share in
// `workspace-mount/`; this module
// registers all of them, in order, through the one entry point below. Nothing
// is re-exported from here: the ledger-assertion scan in `packages/types` does
// not follow an `export { … } from` clause, so a shim would count as a module
// it could not open.

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function registerWorkspaceCommands(program: Command): void {
  const ws = program
    .command("workspace")
    .description("Mount Nexus workspaces as a live shared drive for local Claude Code");

  ws.addHelpText(
    "after",
    `
TWO GROUPS OF SUBCOMMAND, AND THEY FAIL FOR OPPOSITE REASONS.

  Public API v1 (need a valid key and the network):
    list · create · rename · delete · search · restore · history · revert · push · pull
  This machine's mount registry (no Public API call):
    mount · remount · unmount · status · credential-process

"unmount" and "status" keep working after a key is revoked or while offline —
they report what THIS machine recorded, never what the server holds. "mount"
and "remount" are in the local group but still reach the server with your API
key — the WebDAV engine to mint a mount token, the direct engine to mint an
hour of storage access — so they are the local-group commands a revoked key
breaks. "credential-process" is the direct engine's own hourly renewal; it is
run by the drive, not by you.

A mounted workspace deleted server-side still appears in "status". When the two
disagree, "list" is the truth and "status" is the local record.

THE DRIVE IS LIVE AND SHARED. Teammates and agents read and write the same
files within seconds, and writes are last-write-wins per file. There is no
checkout, no lock you can rely on and no merge — re-read before you overwrite.

THE WEBDAV ENGINE IS NOT A POSIX FILESYSTEM. It is WebDAV behind a userspace
mount, so in-place edits are not supported: mv, sed -i and >> answer "Function
not implemented". Read the file, transform it in memory, and write the whole
file back. Ordinary create / read / overwrite / delete all work.

DELETING NEEDS workspaces:delete, WHICH write DOES NOT IMPLY — a read-write
mount whose key lacks it fails every rm with a 403 while cp keeps working.
workspaces:read is enough to MOUNT and to read; writing needs workspaces:write,
which does carry the read (that is the only implication scopes have, and it is
same-resource only).

THREE ENGINES, AND THEY DIFFER IN WHO HOLDS THE CREDENTIAL:
  webdav   macOS only, and the default there. Nothing to install. Every request
           is authorised by Nexus, so a revoked key stops the drive at once.
  rclone   The default on Linux and Windows: rclone mounting the same gateway
           over FUSE, authorised by Nexus per request, working with a raw
           --api-key. Retired on macOS, where the two others cover it.
  direct   Opt-in (--engine direct) on macOS and Linux; not on Windows yet.
           rclone signs storage requests itself with a one-hour key that renews
           itself while you use the drive. Faster, and it needs rclone plus a
           FUSE layer: macFUSE or FUSE-T on macOS, fuse3 on Linux. The drive
           dies at logout or restart; "workspace remount" brings it back and
           uploads whatever the dead mount had not sent.

MOUNTING WITH rclone OR direct NEEDS rclone AND A FUSE LAYER. "workspace mount"
and "workspace remount" check both first and offer to install what is missing:
the pinned official rclone into ~/.nexus-mcp/bin (macOS and Linux on x64 or
arm64, no sudo) and, on macOS, FUSE-T. --install-deps installs without asking;
--no-install-deps never offers. By hand:
  Linux    the official rclone, plus: sudo apt-get install fuse3
  Windows  winget install Rclone.Rclone   (plus WinFsp: https://winfsp.dev)
  macOS    the OFFICIAL rclone from https://rclone.org/downloads/ — Homebrew's
           build refuses to mount — plus macFUSE (https://macfuse.github.io) or
           FUSE-T (https://www.fuse-t.org). A macFUSE already installed is
           used, never replaced. Or use the default engine, which needs nothing.

A SLUG IS NOT UNIQUE. The same slug can name both an org-owned workspace and
an admin-shared one; the bare slug resolves to the org-owned copy and --shared
picks the other.

HOW FILES GET INTO A WORKSPACE — the first thing people look for. Three routes:

  1. Mount it and write through the drive — the normal way.
  2. "workspace push", when a mount is not available (CI, a container): files
     or folders over the API, in packs, each file delivered or bounced on its
     own.
  3. WebDAV directly, one file per request:
       $ curl -X PUT -u "$NEXUS_API_KEY:" --data-binary @local.md \\
           <base-url>/webdav/<slug>/notes/local.md

HOW FILES GET OUT: "workspace pull" — a folder as one ZIP unpacked in place, or
named files one by one — when a mount is not available. The mount is the
normal way; pull is its inverse the way push is its inverse for writing.

To LIST what is in a workspace without mounting, "workspace search" answers
server-side — and one raw read gives you a plain directory listing:

  $ nexus api GET /workspaces/<slug>/files --query path=<dir>

Neither listing needs a mount, which makes them the cheap answer to "is my file
there" — the question that otherwise drives a mount.`
  );

  // ── list ─────────────────────────────────────────────────────────────────
  const list = ws
    .command("list")
    .description("List the workspaces in your organization")
    .option(
      "--folder-stats",
      "Include a per-top-level-folder breakdown (depth-1) in each workspace's stats"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace list
  $ nexus workspace list --json
  $ nexus workspace list --folder-stats --json

Notes:
  READ THE KIND COLUMN BEFORE YOU MOUNT. "org" is your organization's own
  workspace, "shared" is an admin-shared one. Two rows can carry the SAME slug,
  one of each — the bare slug then mounts the org copy and --shared the other.
  🚨 THE TABLE'S "KIND" AND --json's "kind" ARE DIFFERENT FIELDS WITH THE SAME
  NAME. The column above shows OWNERSHIP (org / shared); the JSON key literally
  called kind shows the STORAGE TYPE (CODE / DRIVE), which is the sense
  "workspace create" documents. So a script reading .kind and testing for
  "org" or "shared" never matches, and one testing for "CODE" is answering a
  different question than the table. In --json, ownership is isShared.
  --folder-stats ADDS A COUNT, NOT THE FOLDERS. It costs a depth-1 walk
  server-side, the table shows only how many top-level folders there are, and
  the per-folder breakdown is --json only.
  Files and Size are server-side totals for the whole workspace; they say
  nothing about whether it is mounted.
  Needs workspaces:read. Unpaginated.`
    )
    .action(async (opts: { folderStats?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { workspaces } = await client.workspaces.list({ folderStats: opts.folderStats });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspaces, null, 2));
          return;
        }
        // Surface which copy is which: a slug can name both an org-owned and an
        // admin-shared workspace, and the bare slug mounts the org-owned one
        // (NEX-2362). The "Kind" column makes the collision visible at a glance.
        const rows = workspaces.map((w) => ({
          slug: w.slug,
          name: w.name,
          kind: w.isShared ? "shared" : "org",
          files: w.stats.fileCount,
          size: formatBytes(w.stats.totalBytes),
          ...(opts.folderStats ? { folders: w.stats.folders?.length ?? 0 } : {})
        }));
        // Hoisted so the conditional gets a contextual type. Spread inline, the
        // best-common-type of `[]` and the one-element literal widens `key` to
        // `string` and takes the whole column list out of the key check.
        const folderColumn: Column<(typeof rows)[number]>[] = opts.folderStats
          ? [{ key: "folders", label: "Folders" }]
          : [];
        printTable(rows, [
          { key: "slug", label: "Slug" },
          { key: "name", label: "Name" },
          { key: "kind", label: "Kind" },
          { key: "files", label: "Files" },
          { key: "size", label: "Size" },
          ...folderColumn
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── search ─────────────────────────────────────────────────────────────────
  const search = ws
    .command("search")
    .description("Search a workspace's docs server-side by keyword and/or frontmatter (no mount)")
    .argument("<slug>", "Workspace slug")
    .option(
      "--query <text>",
      "Keyword (case-insensitive substring over content, frontmatter, path)"
    )
    .option(
      "--frontmatter <key=value>",
      "Frontmatter filter (repeatable); all must hold, e.g. --frontmatter status=done",
      (val: string, acc: string[]) => {
        acc.push(val);
        return acc;
      },
      [] as string[]
    )
    .option("--path <folder>", "Restrict the search to a subfolder (workspace-relative)")
    .option("--limit <n>", "Max results to return (1–200, default 50)", (v) => parseInt(v, 10))
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace search support-docs --query "refund policy"
  $ nexus workspace search support-docs --frontmatter status=published
  $ nexus workspace search support-docs --query onboarding --frontmatter owner=growth --json
  $ nexus workspace search support-docs --query api --path guides --limit 20

Notes:
  TEXT DOCUMENTS ONLY, BY EXTENSION. Markdown, txt, json/jsonl, yaml and their
  siblings are read; a PDF, an image, a binary or a file with NO EXTENSION is
  never opened, so its content cannot match and its absence is not reported.
  This is a document search, not a file search.
  IT STOPS AFTER 1000 FILES AND SAYS SO QUIETLY. Past that the answer is
  incomplete and truncated is true — the table prints "(truncated — narrow your
  search)" on STDERR and --json carries the flag. AN EMPTY RESULT WITH
  truncated: true IS NOT "NO MATCHES". Narrow with --path and try again.
  LARGE FILES ARE READ AS A PREFIX ONLY (first 256 KB), so a match deep inside
  a big document is missed silently.
  Every --frontmatter key=value must hold, ANDed with --query. Repeat the flag
  for several. Values are compared as the flattened string form of the
  frontmatter, so a list matches its ", "-joined rendering.
  At least one of --query / --frontmatter is required; the CLI refuses locally
  rather than scanning everything.
  MATCHED tells you WHERE it hit — content, frontmatter or path. A path-only
  hit has no snippet, which is why SNIPPET can be blank on a real match.
  🚨 A NON-TEXT FILE CANNOT BE FOUND BY ITS PATH EITHER, ONLY BY ITS CONTENT.
  Non-text files are dropped before matching runs, so the path axis never
  applies to them: searching an image's EXACT filename answers "No matches",
  which reads as "that file is not in this workspace" when it is sitting there.
  Confirm with a mount or with "nexus api GET /workspaces/<slug>/files
  --query path=<dir>" before believing an absence.
  scanned (STDERR, or --json) is how many files were actually opened, not how
  many exist.
  No mount needed, and no local files are read — this runs server-side.
  --json IS THE RAW SERVER OBJECT, NOT A {data, meta} ENVELOPE:
  {results, scanned, truncated}. Each hit is {path, size, modifiedAt, snippet,
  frontmatter, matchedIn}. snippet and frontmatter are null rather than absent
  when there is none, and matchedIn is an ARRAY — one hit can carry
  ["frontmatter","content"] at once, so a script comparing it to a single
  string misses every multi-axis hit. The MATCHED column above is that array
  joined with ", ".`
    )
    .action(
      async (
        slug: string,
        opts: { query?: string; frontmatter: string[]; path?: string; limit?: number }
      ) => {
        try {
          if (!opts.query && opts.frontmatter.length === 0) {
            throw new Error(
              "Provide --query and/or at least one --frontmatter key=value filter to search."
            );
          }
          for (const f of opts.frontmatter) {
            if (!f.includes("=") || f.split("=", 1)[0].trim().length === 0) {
              throw new Error(
                `Invalid --frontmatter "${f}". Use key=value form with a non-empty key.`
              );
            }
          }

          const client = createClient(program.optsWithGlobals());
          const res = await client.workspaces.search(slug, {
            query: opts.query,
            frontmatter: opts.frontmatter.length > 0 ? opts.frontmatter : undefined,
            path: opts.path,
            limit: opts.limit
          });

          if (isJsonMode()) {
            console.log(JSON.stringify(res, null, 2));
            return;
          }

          if (res.results.length === 0) {
            console.log(`No matches (scanned ${res.scanned} file${res.scanned === 1 ? "" : "s"}).`);
            return;
          }

          printTable(
            res.results.map((hit) => ({
              path: hit.path,
              match: hit.matchedIn.join(", "),
              snippet: (hit.snippet ?? "").replace(/\s+/g, " ").slice(0, 80)
            })),
            [
              { key: "path", label: "Path" },
              { key: "match", label: "Matched" },
              { key: "snippet", label: "Snippet" }
            ]
          );
          const shown = `${res.results.length} match${res.results.length === 1 ? "" : "es"}`;
          const scanned = `scanned ${res.scanned} file${res.scanned === 1 ? "" : "s"}`;
          console.error(
            color.dim(
              `${shown}, ${scanned}${res.truncated ? " (truncated — narrow your search)" : ""}`
            )
          );
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // ── create ───────────────────────────────────────────────────────────────
  const create = ws
    .command("create")
    .description("Create a new workspace — the slug is derived from the name and is permanent")
    .argument("<name>", "Workspace name (the slug is derived from it)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace create "Support Docs"
  $ nexus workspace create "Support Docs" --json
  $ nexus workspace create -- "-launch-notes"

Notes:
  THE SLUG IS DERIVED AND THEN IMMUTABLE. "Support Docs" becomes support-docs,
  and "workspace rename" changes the NAME ONLY — the slug you get here is the
  one every mount, search and grant will use for the life of the workspace.
  Read it from the output; do not assume the slugification rule.
  A NAME WITH NO ALPHANUMERICS IS REFUSED — it would slugify to nothing.
  A NAME STARTING WITH A HYPHEN NEVER REACHES THAT REFUSAL. Commander reads it
  as a flag first, so "workspace create ---" answers "error: unknown option
  '---'" and exits before any name is sent. Put "--" ahead of the name and the
  parser stops looking, which is where the refusal above actually applies.
  SLUGS ARE UNIQUE PER ORGANIZATION, so a second "Support Docs" is a conflict,
  not a second workspace. Note that an ADMIN-SHARED workspace may already carry
  the slug you want; that does not block creation, and you then have two rows
  with one slug — see "nexus workspace list" -> KIND.
  Creates a DRIVE workspace. CODE workspaces are read-only projections of a
  git project and are not creatable here.
  Needs workspaces:write.`
    )
    .action(async (name: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const workspace = await client.workspaces.create({ name });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspace, null, 2));
          return;
        }
        printSuccess(`Created workspace "${workspace.name}"`, { slug: workspace.slug });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── rename ───────────────────────────────────────────────────────────────
  const rename = ws
    .command("rename")
    .description("Rename a workspace — the DISPLAY NAME only, the slug never changes")
    .argument("<slug>", "Workspace slug")
    .argument("<name>", "New name")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace rename support-docs "Customer Support Docs"

Notes:
  THE SLUG IS IMMUTABLE AND THIS DOES NOT TOUCH IT. Only the display name
  changes, so mounts, grants, search and ~/nexus/<slug> all keep working — and
  the slug can end up saying nothing about the name. There is no way to change
  a slug: create a new workspace and move the files.
  Existing mounts are unaffected and need no remount.
  A slug that is not yours, or is narrowed away from you, answers 404.
  Needs workspaces:write.`
    )
    .action(async (slug: string, name: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const workspace = await client.workspaces.rename(slug, { name });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspace, null, 2));
          return;
        }
        printRecord(workspace);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ───────────────────────────────────────────────────────────────
  const remove = confirmable(ws.command("delete"))
    .description("Delete a workspace and PURGE every file in it — not a soft delete")
    .argument("<slug>", "Workspace slug")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace delete scratch
  $ nexus workspace delete scratch --yes

Notes:
  IT PURGES THE FILES, NOT JUST THE ROW. Every object is deleted from storage
  first and the workspace record second, so this is NOT the 72h soft delete
  that "workspace restore" recovers from — "workspace restore" cannot bring a
  deleted WORKSPACE back, only files deleted from a live one.
  ANYTHING MOUNTED KEEPS ITS MOUNT POINT AND STOPS WORKING. The local directory
  and the registry entry survive as a dead mount; run
  "nexus workspace unmount <slug>" yourself afterwards.
  ROLE GRANTS AND AGENT LINKS TO IT GO SILENTLY, AND YOU CANNOT LIST THEM
  FIRST. "nexus role workspace-grants" is indexed by ROLE — its signature is
  workspace-grants <role> — so answering "which Roles reach this workspace"
  means running it once per Role and filtering. There is no workspace-indexed
  read. Either do that sweep, or accept that grants are lost unrecorded.
  A CODE WORKSPACE USUALLY BACKS A VIBE APP. Rows whose storage type is CODE
  (the "kind" key in --json) are projections of a git project, and share a name
  with the app and the project. Check "nexus apps list" for a matching name
  before deleting one.
  A PARTIAL FAILURE LEAVES THE WORKSPACE PRESENT. If the storage purge fails
  the record is kept on purpose so a retry can finish; re-run the same command.
  --yes is REQUIRED when stdin is not a TTY: without it a script exits NON-ZERO
  rather than deleting. Every destructive command in this CLI refuses the
  same way. "nexus --help" carries the exit-code table.
  Needs workspaces:delete, which workspaces:write does not imply.`
    )
    .action(async (slug: string, opts: { yes?: boolean }) => {
      try {
        // ⚠️ A REFUSAL'S `hint` IS THE NEXT STEP FOR *THIS* FAILURE, NEVER A
        // SECOND PLACE FOR THE COMMAND'S NOTES. The hand-rolled version of this
        // gate carried "Needs workspaces:delete, which workspaces:write does not
        // imply" — true, already in `--help`, and about a permission failure that
        // did not happen here. Nothing was refused for scope; it was refused for
        // a missing confirmation, so a script following the hint would go and
        // widen a token that was never the problem. `confirmDestructive` owns the
        // wording now, and it says the one thing that is true of every refusal it
        // emits.
        if (!(await confirmDestructive(`Delete workspace "${slug}" and all its files?`, opts))) {
          return;
        }
        const client = createClient(program.optsWithGlobals());
        await client.workspaces.delete(slug);
        printSuccess(`Deleted workspace "${slug}".`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── restore ──────────────────────────────────────────────────────────────
  const restore = ws
    .command("restore")
    .description("Restore a deleted file or folder from backup (within the recovery window)")
    .argument("<slug>", "Workspace slug")
    .argument("<path>", "The deleted file or folder path (relative to the workspace root)")
    .option(
      "--shared",
      "Restore into the admin-shared workspace with this slug (not the same-slug org-owned one)"
    )
    .addHelpText(
      "after",
      `
Recovers a file or folder that was deleted from a workspace, using the S3
backup (version history, retained ~30 days — past the 72h soft-delete window).
Pass the path that was deleted; everything currently deleted at/under it is
restored. Live files are never overwritten.

Examples:
  $ nexus workspace restore support-docs reports/q3.pdf
  $ nexus workspace restore support-docs reports      # restore a whole folder

  The whole round trip. The delete has no verb here — it happens on a mount:
  $ rm ~/nexus/support-docs/notes/probe.md
  $ nexus workspace search support-docs --query probe
  $ nexus workspace restore support-docs notes/probe.md

Notes:
  IT RESTORES FILES INTO A LIVE WORKSPACE. It cannot bring back a workspace
  deleted with "workspace delete" — that purges storage, so there is nothing
  left to restore from.
  "Nothing to restore" IS A SUCCESS, NOT AN ERROR, and it means one of three
  different things: the path is past the recovery window, it was never
  deleted, or it is already present. The command cannot tell them apart, and
  it exits 0. Check "nexus workspace search" or the mount before assuming the
  file is unrecoverable.
  LIVE FILES ARE NEVER OVERWRITTEN. A path that still exists is skipped, so
  this is safe to re-run and cannot be used to roll a file back to an older
  version — that is "workspace revert", which takes a version id from
  "workspace history".
  THE PATH IS THE ONE THAT WAS DELETED, workspace-relative and with no leading
  slash. Given a folder, everything currently deleted at or under it comes
  back.
  Read the restored count and the paths it prints; --json carries both.
  THIS IS THE UNDO FOR AN OPERATION THIS NAMESPACE CANNOT PERFORM. Nothing
  under "nexus workspace" deletes a FILE — "workspace delete" destroys the
  whole workspace — so whatever you are undoing happened on a mount or over
  WebDAV. "nexus workspace --help" carries both of those routes.`
    )
    .action(async (slug: string, filePath: string, opts: { shared?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const workspaceId = opts.shared ? await sharedWorkspaceId(client, slug) : undefined;
        const result = await client.workspaces.restore(slug, { path: filePath, workspaceId });
        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        if (result.count === 0) {
          console.log(
            color.dim(
              `Nothing to restore at "${filePath}" — it isn't in the recovery window, was never deleted, or is already present.`
            )
          );
          return;
        }
        printSuccess(`Restored ${result.count} file${result.count === 1 ? "" : "s"} to "${slug}"`);
        for (const p of result.restored) {
          console.log(color.dim(`  ${p}`));
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── history · revert ─────────────────────────────────────────────────────
  registerWorkspaceHistoryCommand(ws, program);
  registerWorkspaceRevertCommand(ws, program);

  // ── push · pull ──────────────────────────────────────────────────────────
  registerWorkspacePushCommand(ws, program);
  registerWorkspacePullCommand(ws, program);

  // ── mount · remount · unmount · status ───────────────────────────────────
  registerWorkspaceMountCommand(ws, program);
  registerWorkspaceRemountCommand(ws, program);
  registerWorkspaceUnmountCommand(ws, program);
  registerWorkspaceStatusCommand(ws, program);

  // ── credential-process ────────────────────────────────────────────────────
  registerWorkspaceCredentialProcessCommand(ws, program);

  // Bound LAST, after every option exists — see `bindCommand`. The seven
  // Public API v1 subcommands are bound; mount / unmount / status speak to this
  // machine's own registry and call no v1 route at all.
  bindCommand(list, WORKSPACE_LIST_CONTRACT);
  bindCommand(search, WORKSPACE_SEARCH_CONTRACT);
  bindCommand(create, WORKSPACE_CREATE_CONTRACT);
  bindCommand(rename, WORKSPACE_RENAME_CONTRACT);
  bindCommand(remove, WORKSPACE_DELETE_CONTRACT);
  bindCommand(restore, WORKSPACE_RESTORE_CONTRACT);
}
