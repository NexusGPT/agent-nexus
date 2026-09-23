import fs from "node:fs";
import path from "node:path";

import type { WorkspaceUploadBatchResponse, WorkspaceUploadResult } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError, refuse } from "../errors";
import { EXIT_CODES } from "../exit-codes";
import { color, printEnvelope } from "../output";
import { WORKSPACE_UPLOAD_BATCH_CONTRACT } from "./workspace.contract.generated";
import { sharedWorkspaceId } from "./workspace-mount/shared-workspace-id";
import { remotePathRefusal } from "./workspace-remote-path";

/**
 * `nexus workspace push` — put local files into a workspace over the Public
 * API, for the machine that cannot mount (CI, a container, a locked-down
 * laptop). The mount stays the normal way; this is the door beside it.
 *
 * One request per PACK. The edge refuses any request body above 52,428,800
 * bytes on every path, so a pack stops at 45 MB of file bytes and at the
 * server's 100-file cap, whichever comes first. A single file that cannot fit
 * a pack cannot be pushed at all — the mount has no such ceiling.
 *
 * A mailbag, not a transaction: each file is delivered or bounced on its own,
 * the server has no multi-object write, and there is no rollback. The result
 * lists every file with its outcome; a failed one is reported and the run
 * exits `remote-error`, while a skipped one (`--no-clobber`, the path already
 * exists) is neither a success nor a failure and does not change the exit.
 */

/** Server cap on parts per request (`MAX_BULK_FILES` on the backend). */
export const PACK_MAX_FILES = 100;
/** File bytes per request — under the edge's 52,428,800-byte body limit with room for the multipart framing. */
export const PACK_MAX_BYTES = 45 * 1024 * 1024;

export interface PushEntry {
  /** Absolute path on this machine. */
  localPath: string;
  /** Workspace-relative destination, no leading slash. */
  remotePath: string;
  size: number;
}

export interface PushPlan {
  entries: PushEntry[];
  /** Walked names starting with `.` that were left out (none with `--include-hidden`). */
  hiddenSkipped: number;
  /** Files at or above {@link PACK_MAX_BYTES}: they cannot fit a pack, so the run refuses. */
  oversized: PushEntry[];
  /**
   * Two sources landing on one destination — `./a/report.pdf ./b/report.pdf`
   * both become `report.pdf`. Sent together they would race on one key and
   * both rows would say success, so the run refuses before any request.
   */
  duplicates: { remotePath: string; first: string; second: string }[];
  /** Walked symlinks whose target does not exist: nothing to read, so the run refuses. */
  dangling: string[];
  /**
   * Walked directory symlinks that lead back into a folder already on the
   * walk (`sub/up -> ..`): followed like `cp -L` they never end, so the run
   * refuses and names the link.
   */
  loops: string[];
  /**
   * Destinations the server's path rules refuse (a backslash in a name, a
   * segment over 255 characters): sent, the whole pack came back 400 naming
   * `paths[N]`, so the run refuses first and names the file and the rule.
   */
  invalid: { localPath: string; remotePath: string; reason: string }[];
  /**
   * Files this process cannot read (mode 000, another owner): `stat` admits
   * them and the read at send time throws, which bounced the whole pack. The
   * run refuses first.
   */
  unreadable: string[];
}

/** `<slug>` or `<slug>:<folder>` — the workspace and the folder inside it the sources land under. */
export function parseDestination(spec: string): { slug: string; prefix: string } {
  const colon = spec.indexOf(":");
  if (colon === -1) return { slug: spec, prefix: "" };
  const prefix = spec
    .slice(colon + 1)
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/");
  return { slug: spec.slice(0, colon), prefix };
}

/** A dot-name: `.DS_Store`, `._x`, `.git`, `.env`. Skipped when walked, pushed when named. */
export function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}

function joinRemote(prefix: string, name: string): string {
  return prefix === "" ? name : `${prefix}/${name}`;
}

/**
 * Walk one named source. A file lands at `<prefix>/<basename>`; a folder lands
 * at `<prefix>/<basename>/…` with its tree under it — the `cp -r` shape.
 * Hidden names are skipped only INSIDE a walked folder: a source the user
 * named is pushed whatever it is called, because naming it was the decision.
 */
function collectSource(
  source: string,
  prefix: string,
  includeHidden: boolean,
  plan: PushPlan
): void {
  const absolute = path.resolve(source);
  const stat = fs.statSync(absolute);
  const remote = joinRemote(prefix, path.basename(absolute));
  if (stat.isFile()) {
    addEntry(plan, { localPath: absolute, remotePath: remote, size: stat.size });
    return;
  }
  if (!stat.isDirectory()) return;
  walkFolder(absolute, remote, includeHidden, plan, new Set([fs.realpathSync(absolute)]));
}

/**
 * `onWalk` holds the real path of every folder between the source and here:
 * a directory symlink that resolves to one of them is a loop, refused where
 * it is met rather than at the depth the OS gives up (ELOOP, 32 hops later).
 */
function walkFolder(
  dir: string,
  remoteDir: string,
  includeHidden: boolean,
  plan: PushPlan,
  onWalk: ReadonlySet<string>
): void {
  const children = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const child of children) {
    if (!includeHidden && isHiddenName(child.name)) {
      plan.hiddenSkipped += 1;
      continue;
    }
    const localPath = path.join(dir, child.name);
    const remotePath = joinRemote(remoteDir, child.name);
    // A symlink is followed, like `cp -L`: the workspace holds bytes, not
    // links. `readdirSync`'s Dirent answers neither isFile nor isDirectory for
    // one, so without this branch a linked file vanished from the push uncounted.
    const kind = child.isSymbolicLink() ? statFollowing(localPath) : child;
    if (kind === "dangling") {
      plan.dangling.push(localPath);
    } else if (kind === "loop") {
      plan.loops.push(localPath);
    } else if (kind.isDirectory()) {
      const real = fs.realpathSync(localPath);
      if (onWalk.has(real)) {
        plan.loops.push(localPath);
        continue;
      }
      walkFolder(localPath, remotePath, includeHidden, plan, new Set([...onWalk, real]));
    } else if (kind.isFile()) {
      addEntry(plan, { localPath, remotePath, size: fs.statSync(localPath).size });
    }
  }
}

/**
 * The target's stat, or why the link cannot be followed: `dangling` when it
 * resolves nowhere (ENOENT), `loop` when it resolves forever (ELOOP — `a -> a`
 * and its cousins, which the walk's own loop set never reaches because the
 * stat fails first).
 */
function statFollowing(localPath: string): fs.Stats | "dangling" | "loop" {
  try {
    return fs.statSync(localPath);
  } catch (cause) {
    // The cast claims nothing: `code` stays `unknown` and is only compared.
    const code = (cause as { code?: unknown }).code;
    if (code === "ENOENT") return "dangling";
    if (code === "ELOOP") return "loop";
    throw cause;
  }
}

function addEntry(plan: PushPlan, entry: PushEntry): void {
  const reason = remotePathRefusal(entry.remotePath);
  if (reason !== null) {
    plan.invalid.push({ localPath: entry.localPath, remotePath: entry.remotePath, reason });
    return;
  }
  if (!isReadable(entry.localPath)) {
    plan.unreadable.push(entry.localPath);
    return;
  }
  if (entry.size >= PACK_MAX_BYTES) plan.oversized.push(entry);
  else plan.entries.push(entry);
}

function isReadable(localPath: string): boolean {
  try {
    fs.accessSync(localPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/** Move every entry whose destination an earlier entry already claimed into `duplicates`. */
function separateDuplicates(plan: PushPlan): void {
  const firstBy = new Map<string, string>();
  const unique: PushEntry[] = [];
  for (const entry of plan.entries) {
    const first = firstBy.get(entry.remotePath);
    if (first !== undefined) {
      plan.duplicates.push({ remotePath: entry.remotePath, first, second: entry.localPath });
      continue;
    }
    firstBy.set(entry.remotePath, entry.localPath);
    unique.push(entry);
  }
  plan.entries = unique;
}

/** Every file the named sources resolve to, with what was left out and why. Throws on a missing source. */
export function planPush(
  sources: readonly string[],
  prefix: string,
  includeHidden: boolean
): PushPlan {
  const plan: PushPlan = {
    entries: [],
    hiddenSkipped: 0,
    loops: [],
    oversized: [],
    duplicates: [],
    dangling: [],
    invalid: [],
    unreadable: []
  };
  for (const source of sources) collectSource(source, prefix, includeHidden, plan);
  separateDuplicates(plan);
  return plan;
}

/** Greedy, in order: a pack closes at {@link PACK_MAX_FILES} files or when the next file would cross {@link PACK_MAX_BYTES}. */
export function packEntries(entries: readonly PushEntry[]): PushEntry[][] {
  const packs: PushEntry[][] = [];
  let current: PushEntry[] = [];
  let bytes = 0;
  for (const entry of entries) {
    if (current.length >= PACK_MAX_FILES || bytes + entry.size >= PACK_MAX_BYTES) {
      packs.push(current);
      current = [];
      bytes = 0;
    }
    current.push(entry);
    bytes += entry.size;
  }
  if (current.length > 0) packs.push(current);
  return packs;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** Fold the per-pack responses into one document with the same shape. */
function mergeResponses(
  responses: readonly WorkspaceUploadBatchResponse[]
): WorkspaceUploadBatchResponse {
  const results = responses.flatMap((response) => response.results);
  return {
    results,
    successCount: responses.reduce((sum, r) => sum + r.successCount, 0),
    failureCount: responses.reduce((sum, r) => sum + r.failureCount, 0),
    skippedCount: responses.reduce((sum, r) => sum + r.skippedCount, 0)
  };
}

function renderRow(row: WorkspaceUploadResult): string {
  if (row.success) return `  ${row.path}`;
  if (row.skipped) return color.dim(`  ${row.path}  skipped: ${row.error}`);
  return color.red(`  ${row.path}  FAILED: ${row.error}`);
}

/** The human view: one line per file, then the counts. */
function renderOutcome(slug: string, merged: WorkspaceUploadBatchResponse, plan: PushPlan): void {
  for (const row of merged.results) console.log(renderRow(row));
  const verdict =
    `${merged.successCount} pushed to "${slug}"` +
    (merged.skippedCount > 0 ? `, ${merged.skippedCount} skipped` : "") +
    (merged.failureCount > 0 ? `, ${merged.failureCount} failed` : "");
  console.log((merged.failureCount > 0 ? color.red("✗") : color.green("✓")) + " " + verdict);
  if (plan.hiddenSkipped > 0) {
    console.log(
      color.dim(
        `  ${plan.hiddenSkipped} hidden entr${plan.hiddenSkipped === 1 ? "y" : "ies"} left out (--include-hidden to push them)`
      )
    );
  }
}

interface PushOptions {
  /** Commander's `--no-clobber` sets this to false; the default true means "replace like cp". */
  clobber: boolean;
  includeHidden?: boolean;
  shared?: boolean;
}

/**
 * One pack, one request. The bytes are read here, just before they are sent,
 * and a file that cannot be read NOW (the plan admitted it; permissions or the
 * file itself changed since) is bounced as its own failure row while the rest
 * of the pack still goes up — a mailbag, so one file's fault is one file's row,
 * never a throw that reads as the request failing.
 */
async function pushPack(
  client: ReturnType<typeof createClient>,
  slug: string,
  pack: readonly PushEntry[],
  options: { workspaceId?: string; noClobber: boolean }
): Promise<PackOutcome> {
  const files: { path: string; file: Blob; fileName: string }[] = [];
  const unreadable: WorkspaceUploadResult[] = [];
  for (const entry of pack) {
    try {
      files.push({
        path: entry.remotePath,
        file: new Blob([fs.readFileSync(entry.localPath)]),
        fileName: path.basename(entry.localPath)
      });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      unreadable.push({
        path: entry.remotePath,
        success: false,
        skipped: false,
        error: `could not read ${entry.localPath}: ${detail}`
      });
    }
  }
  const sent =
    files.length === 0
      ? { results: [], successCount: 0, failureCount: 0, skippedCount: 0 }
      : await client.workspaces.uploadBatch(slug, files, options);
  if (unreadable.length === 0) return { response: sent, localFailures: 0 };
  return {
    response: {
      ...sent,
      results: [...sent.results, ...unreadable],
      failureCount: sent.failureCount + unreadable.length
    },
    localFailures: unreadable.length
  };
}

/**
 * One pack's answer, with how many of its failure rows this machine wrote
 * (a file it could not read) rather than the server — the exit category is
 * decided on that split: `remote-error` names the server's verdict,
 * `local-failed` names this machine's, and a `--json` reader keyed on the
 * first must not retry the server for the second.
 */
interface PackOutcome {
  response: WorkspaceUploadBatchResponse;
  localFailures: number;
}

/**
 * The packs a throw never reached, reported the only honest way: every file in
 * them as a failure row carrying the error, so a `--json` reader and a human
 * both see what did NOT land next to what did.
 */
function bouncedPacks(
  packs: readonly (readonly PushEntry[])[],
  err: unknown
): WorkspaceUploadBatchResponse {
  const error = err instanceof Error ? err.message : String(err);
  const results: WorkspaceUploadResult[] = packs
    .flat()
    .map((entry) => ({ path: entry.remotePath, success: false, skipped: false, error }));
  return { results, successCount: 0, failureCount: results.length, skippedCount: 0 };
}

/**
 * Packs go up in order. A request that THROWS (auth, transport, a 5xx) is not
 * a per-file verdict: on the first pack nothing has landed, so the error
 * document with its own exit category is the whole answer and it propagates.
 * On a later pack, earlier packs ARE in the workspace, so their rows must be
 * printed — the throw becomes failure rows for that pack and every pack after
 * it, and the run stops sending, because the same request would throw again.
 */
async function pushPacks(
  client: ReturnType<typeof createClient>,
  slug: string,
  packs: readonly (readonly PushEntry[])[],
  options: { workspaceId?: string; noClobber: boolean }
): Promise<PackOutcome[]> {
  const outcomes: PackOutcome[] = [];
  for (const [index, pack] of packs.entries()) {
    try {
      outcomes.push(await pushPack(client, slug, pack, options));
    } catch (err) {
      if (index === 0) throw err;
      outcomes.push({ response: bouncedPacks(packs.slice(index), err), localFailures: 0 });
      break;
    }
  }
  return outcomes;
}

/** A source that does not exist is the caller's mistake, refused before any request. */
function missingSource(sources: readonly string[]): string | undefined {
  return sources.find((source) => !fs.existsSync(path.resolve(source)));
}

/** The plan's own refusals, each before any request: nothing to send, or something that must not be. */
function refusePlan(plan: PushPlan): number | null {
  if (plan.dangling.length > 0) {
    return refuse(`Symlink target does not exist: ${plan.dangling.join(", ")}`);
  }
  if (plan.loops.length > 0) {
    return refuse(
      `Symlink leads back into the folder being pushed: ${plan.loops.join(", ")}`,
      "Remove the link, or push the folder it points at directly."
    );
  }
  if (plan.duplicates.length > 0) {
    const named = plan.duplicates
      .map((d) => `${d.remotePath} (${d.first} and ${d.second})`)
      .join("; ");
    return refuse(
      `Two sources land on one destination: ${named}`,
      "Push them in two runs, or into two folders (<slug>:<folder>)."
    );
  }
  if (plan.invalid.length > 0) {
    const named = plan.invalid
      .map((entry) => `${entry.remotePath} (${entry.localPath}): ${entry.reason}`)
      .join("; ");
    return refuse(
      `${plan.invalid.length} destination${plan.invalid.length === 1 ? "" : "s"} the workspace cannot hold: ${named}`,
      "Rename the file, or push it into a folder whose name the rules allow."
    );
  }
  if (plan.unreadable.length > 0) {
    return refuse(
      `Cannot read ${plan.unreadable.join(", ")}`,
      "Check the file's permissions, or leave it out of the push."
    );
  }
  if (plan.oversized.length > 0) {
    const named = plan.oversized
      .map((entry) => `${entry.localPath} (${formatBytes(entry.size)})`)
      .join(", ");
    return refuse(
      `${plan.oversized.length} file${plan.oversized.length === 1 ? "" : "s"} at or above ${formatBytes(PACK_MAX_BYTES)} cannot be pushed: ${named}`,
      "Mount the workspace and copy it through the drive — the mount has no per-request ceiling."
    );
  }
  if (plan.entries.length === 0) {
    return refuse(
      "Nothing to push: the sources hold no files" +
        (plan.hiddenSkipped > 0 ? ` (${plan.hiddenSkipped} hidden, left out)` : ""),
      plan.hiddenSkipped > 0 ? "Pass --include-hidden to push dot-files too." : undefined
    );
  }
  return null;
}

async function runPush(
  destination: string,
  sources: string[],
  opts: PushOptions,
  program: Command
): Promise<number> {
  const { slug, prefix } = parseDestination(destination);
  const prefixRefusal = prefix === "" ? null : remotePathRefusal(prefix);
  if (prefixRefusal !== null) {
    return refuse(`Destination folder "${prefix}" is not a workspace path: ${prefixRefusal}`);
  }
  const missing = missingSource(sources);
  if (missing !== undefined) return refuse(`No such file or folder: ${missing}`);

  const plan = planPush(sources, prefix, !!opts.includeHidden);
  const refused = refusePlan(plan);
  if (refused !== null) return refused;

  const client = createClient(program.optsWithGlobals());
  const workspaceId = opts.shared ? await sharedWorkspaceId(client, slug) : undefined;
  const outcomes = await pushPacks(client, slug, packEntries(plan.entries), {
    workspaceId,
    noClobber: !opts.clobber
  });
  const merged = mergeResponses(outcomes.map((outcome) => outcome.response));
  printEnvelope(merged, () => renderOutcome(slug, merged, plan));
  return exitFor(
    merged,
    outcomes.reduce((sum, outcome) => sum + outcome.localFailures, 0)
  );
}

/**
 * A FAILED row exits the run; which category says whose fault it was. Every
 * failure a local read → `local-failed`; any failure the server answered →
 * `remote-error`, even beside local ones, because that is the one a retry
 * against the server can change.
 */
function exitFor(merged: WorkspaceUploadBatchResponse, localFailures: number): number {
  if (merged.failureCount === 0) return EXIT_CODES.success;
  if (localFailures === merged.failureCount) return EXIT_CODES["local-failed"];
  return EXIT_CODES["remote-error"];
}

export function registerWorkspacePushCommand(ws: Command, program: Command): void {
  const push = ws
    .command("push")
    .description("Upload local files or folders into a workspace without mounting it")
    .argument(
      "<destination>",
      "Workspace slug, or <slug>:<folder> to land the sources under a folder"
    )
    .argument("<path...>", "Local files or folders to push")
    .option(
      "--no-clobber",
      "Skip a file that already exists in the workspace instead of replacing it"
    )
    .option(
      "--include-hidden",
      "Also push dot-files inside a folder (.DS_Store, .git/, .env are skipped otherwise)"
    )
    .option(
      "--shared",
      "Push into the admin-shared workspace with this slug (not the same-slug org-owned one)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace push support-docs ./reports/q3.pdf
  $ nexus workspace push support-docs:reports ./q3 ./q4        # lands as reports/q3/… and reports/q4/…
  $ nexus workspace push support-docs ./notes --no-clobber      # leave files that already exist alone
  $ nexus workspace push support-docs ./site --include-hidden   # push .well-known/ and friends too

THE MOUNT IS THE NORMAL WAY IN; THIS IS FOR THE MACHINE THAT CANNOT MOUNT.
CI, a container, a locked-down laptop. The files land in the same store the
drive shows, so a teammate on a mount sees them within seconds.

IT COPIES LIKE cp. A named file lands at <folder>/<name>; a named folder lands
at <folder>/<name>/… with its tree under it. A file that exists is REPLACED,
silently, unless --no-clobber — then it is reported as skipped, decided by the
store in the same step as the write, so two pushes racing on one path see
exactly one win. Inside a walked folder, names starting with "." are left out
unless --include-hidden; a dot-file you name on the command line is pushed.

IT IS A MAILBAG, NOT A TRANSACTION. Files go up in packs of at most 100 files
and 45 MB; each file is delivered or bounced on its own and nothing is rolled
back. Read the per-file lines: a FAILED row is a file that is not there, and
the run exits remote-error when there is one. A skipped row is neither a
success nor a failure and leaves the exit at success. A single file of 45 MB
or more is refused before anything is sent — use the mount for it.

Notes:
  --json IS THE MERGED SERVER RESPONSE: {results, successCount, failureCount,
  skippedCount}, one document, results in push order across every pack. Read
  the exit code before parsing rows.
  A PATH IS WORKSPACE-RELATIVE with no leading slash; "<slug>:" with nothing
  after the colon is the root, the same as a bare slug. A destination cannot
  end in "/" — a file is pushed onto a file's name, never a folder's. A name
  the workspace cannot hold (a backslash, a segment over 255 characters, a
  path over 1024, ".." or "." segments) refuses the run before any request,
  naming the file and the rule, as does a file this process cannot read.
  A FILE THAT BECOMES UNREADABLE between the plan and the send is its own
  FAILED row; the rest of its pack still goes up, and when every FAILED row
  is one this machine could not read the run exits local-failed, not
  remote-error — the server answered nothing wrong.
  ONE PACK HAS TEN MINUTES TO UPLOAD, not the usual thirty seconds: a pack is
  up to 45 MB and the deadline covers sending it. A global --timeout bounds
  one pack, not the whole run; on a slow uplink give it more, not less.
  DELETING IS NOT HERE. Nothing under "nexus workspace" deletes a file; that
  happens on a mount, and "workspace restore" is its undo.`
    )
    .action(async (destination: string, sources: string[], opts: PushOptions) => {
      try {
        process.exitCode = await runPush(destination, sources, opts, program);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(push, WORKSPACE_UPLOAD_BATCH_CONTRACT);
}
