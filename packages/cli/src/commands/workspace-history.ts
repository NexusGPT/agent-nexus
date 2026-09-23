import type { WorkspaceFileVersion } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { color, printEnvelope, printTable } from "../output";
import { WORKSPACE_FILE_HISTORY_CONTRACT } from "./workspace.contract.generated";
import { sharedWorkspaceId } from "./workspace-mount/shared-workspace-id";

/**
 * `nexus workspace history` — one file's versions, newest first, as the store
 * keeps them: every save through a mount, a push or WebDAV is a version, and
 * a delete is a marker on top. The table is where `workspace revert` takes its
 * `--version-id` from; `--json` is the server's own document.
 */

interface HistoryOptions {
  shared?: boolean;
}

/**
 * Per kind, what the Kind column prints and what the State column prints when
 * the entry is the head. `satisfies Record<kind, …>`: a third kind on the wire
 * is a compile error here, never a row that prints the wrong word.
 */
const KIND_LABEL = { file: "file", "delete-marker": "delete marker" } satisfies Record<
  WorkspaceFileVersion["kind"],
  string
>;
const HEAD_STATE = { file: "live", "delete-marker": "deleted" } satisfies Record<
  WorkspaceFileVersion["kind"],
  string
>;

/** One table row: the two entry kinds flattened into the columns a terminal shows. */
export function historyRow(entry: WorkspaceFileVersion, index: number) {
  return {
    n: index + 1,
    when: entry.modifiedAt,
    // Exact bytes, as `pull` prints them: two versions a few bytes apart are
    // the whole point of the column, and a rounded figure would show them equal.
    size: entry.kind === "file" ? `${entry.size} B` : "—",
    versionId: entry.versionId,
    kind: KIND_LABEL[entry.kind],
    state: entry.isLatest ? HEAD_STATE[entry.kind] : ""
  };
}

export function registerWorkspaceHistoryCommand(ws: Command, program: Command): void {
  const history = ws
    .command("history")
    .description("List every version of one file, newest first — the ids `revert` takes")
    .argument("<slug>", "Workspace slug")
    .argument("<path>", "The file, relative to the workspace root")
    .option(
      "--shared",
      "Read the admin-shared workspace with this slug (not the same-slug org-owned one)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace history support-docs reports/q3.md
  $ nexus workspace history support-docs reports/q3.md --json

  The round trip with revert:
  $ nexus workspace history support-docs notes/plan.md
  $ nexus workspace revert support-docs notes/plan.md --version-id 3sL4kqmGDgz.Ex4mpl3

EVERY SAVE IS A VERSION, EVERY DELETE IS A MARKER. Writes through a mount, over
WebDAV or with "workspace push" each land as a new version; deleting the file
leaves a "delete marker" on top and the content beneath it. The State column
says what the path resolves to today: "live" on a file version, "deleted" on a
marker, blank on everything older.

Notes:
  THE WINDOW IS THE BUCKET'S RETENTION, ABOUT 30 DAYS FOR OLDER VERSIONS. An
  entry that has aged out is gone from this list and from what "revert" can
  reach; the live version never ages out.
  THE STORE KEEPS WHOLE SECONDS. Two entries written inside one second tie on
  their time; the live one is listed first, and any other pair that ties may
  print in either order.
  AN EMPTY TABLE MEANS THE PATH NEVER HELD A FILE IN THAT WINDOW — or the path
  is spelled differently from the one that was written. The listing is exact:
  "notes/a" shows nothing for "notes/a.md".
  A DELETE MARKER CANNOT BE REVERTED TO. It holds no bytes; pick the file
  version beneath it. "workspace restore" is the other way back for a deleted
  file, and it takes no version id.
  --json IS THE SERVER'S DOCUMENT: {versions: [{kind, versionId, isLatest,
  modifiedAt, size?, etag?}]}, newest first; size and etag are absent on a
  delete marker.
  Needs workspaces:read.`
    )
    .action(async (slug: string, filePath: string, opts: HistoryOptions) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const workspaceId = opts.shared ? await sharedWorkspaceId(client, slug) : undefined;
        const result = await client.workspaces.history(slug, filePath, { workspaceId });
        printEnvelope(result, () => {
          if (result.versions.length === 0) {
            console.log(
              color.dim(`No versions of "${filePath}" in "${slug}" inside the retention window.`)
            );
            return;
          }
          printTable(result.versions.map(historyRow), [
            { key: "n", label: "#" },
            { key: "when", label: "When" },
            { key: "size", label: "Size" },
            { key: "versionId", label: "Version ID" },
            { key: "kind", label: "Kind" },
            { key: "state", label: "State" }
          ]);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(history, WORKSPACE_FILE_HISTORY_CONTRACT);
}
