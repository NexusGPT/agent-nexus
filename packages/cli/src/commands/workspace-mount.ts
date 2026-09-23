import fs from "node:fs";
import path from "node:path";

import type { WorkspaceKind } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../client";
import { failure, handleError, invalidInput } from "../errors";
import {
  alreadyMountedMessage,
  claimMountPoint,
  defaultMountPath,
  describeOwner,
  type Engine,
  ENGINES,
  findMount,
  mountKey,
  mountPointTakenMessage,
  type MountRecord,
  type MountScope,
  readMounts,
  writeMounts
} from "../mount-registry";
import { color, isJsonMode, printSuccess, printWarning } from "../output";
import { mountIdFor } from "../workspace-direct-mount/mount-id";
import { assertMountableSlug } from "./workspace-mount/assert-mountable-slug";
import { detachDeadMount } from "./workspace-mount/detach-dead-mount";
import { isEngine } from "./workspace-mount/engine-name";
import { isMountLive } from "./workspace-mount/is-mount-live";
import { isReadOnlyKind } from "./workspace-mount/is-read-only-kind";
import { mountOnto } from "./workspace-mount/mount-onto";
import type { MountOutcome } from "./workspace-mount/mount-outcome";
import type { MountPlan } from "./workspace-mount/mount-plan";
import { printGrantedReadOnly } from "./workspace-mount/print-granted-read-only";
import { printPendingUploads } from "./workspace-mount/print-pending-uploads";
import { refuseEngineOffPlatform } from "./workspace-mount/refuse-engine-off-platform";
import { resolveAuth } from "./workspace-mount/resolve-auth";
import { resolveMountTargetDetailed } from "./workspace-mount/resolve-mount-target-detailed";
import {
  mountDirect,
  planDirectMount,
  printMountFooter,
  refuseCodeWorkspaceOnDirect,
  retireDeadDirectRow
} from "./workspace-mount-direct";
import { mountGateway, settleGatewayMount } from "./workspace-mount-gateway";

const ENGINE_VALUES = ["auto", ...ENGINES] as const;

/** `auto` is the engine that needs nothing installed where one exists, else the gateway over FUSE. */
function defaultEngine(): Engine {
  return process.platform === "darwin" ? "webdav" : "rclone";
}

function resolveEngine(requested: string | undefined): Engine {
  const value = requested ?? "auto";
  if (value !== "auto" && !isEngine(value)) {
    throw invalidInput(
      `Unknown --engine "${value}".`,
      `Use one of: ${ENGINE_VALUES.map((engine) => `"${engine}"`).join(", ")}.`
    );
  }
  const engine = value === "auto" ? defaultEngine() : value;
  refuseEngineOffPlatform(engine);
  return engine;
}

/**
 * Retire a dead row the new mount replaces: its direct session and cache first
 * (this may refuse), then its mount-table entry, then its registry row.
 */
function retireDeadRow(
  mounts: Record<string, MountRecord>,
  hit: { readonly key: string; readonly record: MountRecord },
  plan: MountPlan
): void {
  retireDeadDirectRow(hit.record, plan);
  detachDeadMount(hit.record);
  delete mounts[hit.key];
}

/** The one reason `--json` reports for a read-only drive: the cause the user cannot waive first. */
function readOnlyReasonFor(input: {
  readonly kindForcesReadOnly: boolean;
  readonly requested: boolean;
  readonly granted: boolean;
}): "kind" | "requested" | "granted" | null {
  if (input.kindForcesReadOnly) return "kind";
  if (input.requested) return "requested";
  if (input.granted) return "granted";
  return null;
}

/** A CODE workspace is a read-only projection; the server refuses every write to it. */
function kindForcesReadOnlyFor(storageKind: WorkspaceKind | undefined): boolean {
  return storageKind !== undefined && isReadOnlyKind(storageKind);
}

/** The EFFECTIVE mode: the flag, the kind, or a grade the server lowered — one definition for the row, the JSON and the summary. */
function effectiveReadOnly(
  opts: { readonly readOnly?: boolean },
  storageKind: WorkspaceKind | undefined,
  mounted: MountOutcome
): boolean {
  return !!opts.readOnly || kindForcesReadOnlyFor(storageKind) || mounted.grantedReadOnly;
}

/** The mint's answer wins over the profile's saved copy — see `refreshProfileOrgName`. */
function actingOrgNameFor(mounted: MountOutcome, scope: MountScope): string | undefined {
  return mounted.serverOrgName ?? scope.orgName;
}

/** This command's long-standing OWNERSHIP field (org-owned / admin-shared), not the storage kind. */
function ownershipKindFor(useShared: boolean): "admin-shared" | "org-owned" {
  return useShared ? "admin-shared" : "org-owned";
}

/**
 * What the `mount` action settled before it reports. Only the settled INPUTS
 * travel here; the mode, the ownership kind and the acting org name are derived
 * by the helpers above, so no caller can hand the printer two values that
 * disagree.
 */
interface MountReport {
  readonly slug: string;
  readonly engine: Engine;
  readonly mountPath: string;
  readonly useShared: boolean;
  readonly workspaceId: string | undefined;
  /** Both copies of the slug exist, so the summary says which one was mounted. */
  readonly ambiguous: boolean;
  readonly record: MountRecord;
  /** The `--read-only` flag as passed, read to name the reason for a read-only drive. */
  readonly opts: { readonly readOnly?: boolean };
  readonly mounted: MountOutcome;
  readonly storageKind: WorkspaceKind | undefined;
  readonly scope: MountScope;
  readonly claudeMdTarget: string | null;
}

/** The `--json` document for one mount that succeeded; key order is the shipped contract. */
function mountReportJson(report: MountReport): Record<string, unknown> {
  const { slug, engine, mountPath, useShared, workspaceId, ambiguous, record } = report;
  const { opts, mounted, storageKind, scope, claudeMdTarget } = report;
  return {
    mounted: true,
    slug,
    engine,
    mountPath,
    kind: ownershipKindFor(useShared),
    shared: useShared,
    workspaceId: workspaceId ?? null,
    ambiguous,
    pid: record.pid ?? null,
    readOnly: effectiveReadOnly(opts, storageKind, mounted),
    // Distinct keys on purpose: `readOnly` is what the mount IS,
    // `readOnlyReason` is WHY. A script that only reads `readOnly`
    // keeps working; one that wants to explain the mode to a human
    // has the cause without re-deriving it from `storageKind`.
    readOnlyReason: readOnlyReasonFor({
      kindForcesReadOnly: kindForcesReadOnlyFor(storageKind),
      requested: !!opts.readOnly,
      granted: mounted.grantedReadOnly
    }),
    // The STORAGE kind (DRIVE / CODE), null when the list could
    // not be fetched. NOT the `kind` key beside it, which is this
    // command's long-standing OWNERSHIP field (org-owned /
    // admin-shared) and keeps its meaning for existing scripts.
    storageKind: storageKind ?? null,
    orgId: scope.orgId ?? null,
    orgName: actingOrgNameFor(mounted, scope) ?? null,
    profile: scope.profile ?? null,
    mountId: record.mountId ?? null,
    access: record.access ?? null,
    pendingUploads: mounted.pendingUploads,
    claudeMd: claudeMdTarget
  };
}

/** The `--json` document, or the human summary, for one mount that succeeded. */
function printMountReport(report: MountReport): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(mountReportJson(report), null, 2));
    return;
  }
  const { slug, engine, mountPath, useShared, workspaceId, ambiguous } = report;
  const { opts, mounted, storageKind, scope, claudeMdTarget } = report;
  const kind = ownershipKindFor(useShared);
  const readOnly = effectiveReadOnly(opts, storageKind, mounted);
  const kindForcesReadOnly = kindForcesReadOnlyFor(storageKind);
  const actingOrgName = actingOrgNameFor(mounted, scope);
  printSuccess(`Mounted "${slug}" at ${mountPath}`, {
    engine,
    kind,
    mode: readOnly ? "read-only" : "read-write",
    ...(actingOrgName || scope.orgId ? { org: actingOrgName ?? scope.orgId } : {}),
    ...(scope.profile ? { profile: scope.profile } : {})
  });
  if (kindForcesReadOnly) {
    console.log(
      color.yellow(
        `  Mounted READ-ONLY: "${slug}" is a ${storageKind} workspace — a read-only ` +
          `projection of a git project, and the server refuses every write to it. ` +
          `Mounting read-write would accept your saves locally and lose them. ` +
          `Change the files by pushing to the git project instead.`
      )
    );
  }
  if (mounted.grantedReadOnly) printGrantedReadOnly(slug);
  printPendingUploads(mounted.pendingUploads);
  if (ambiguous) printAmbiguityNote(slug, useShared, workspaceId);
  if (claudeMdTarget) {
    console.log(color.dim(`  Wrote workspace note to ${claudeMdTarget}`));
  }
  printMountFooter(engine, slug);
}

/** Both copies of the slug exist: say which one was mounted and how to get the other. */
function printAmbiguityNote(
  slug: string,
  useShared: boolean,
  workspaceId: string | undefined
): void {
  const idNote = workspaceId ? ` (id ${workspaceId})` : "";
  const counterpart = useShared
    ? `drop --shared to mount the org-owned copy`
    : `pass --shared to mount the admin-shared copy instead`;
  console.log(
    color.yellow(
      `  Note: "${slug}" exists as BOTH an org-owned and an admin-shared workspace. ` +
        `Mounted the ${ownershipKindFor(useShared)} one${idNote}; ${counterpart}.`
    )
  );
}

/** Nothing here reaches the network. */
function planMount(engine: Engine, scope: MountScope, key: string): MountPlan {
  if (engine !== "direct") {
    settleGatewayMount(engine);
    return { engine };
  }
  return { engine, ...planDirectMount(scope, mountIdFor(key)) };
}

// ── CLAUDE.md note (so a local Claude Code knows the drive is live + shared) ──

const CLAUDE_MD_BEGIN = "<!-- nexus-workspace:begin -->";
const CLAUDE_MD_END = "<!-- nexus-workspace:end -->";

function workspaceClaudeMdSection(slug: string, mountPath: string, readOnly: boolean): string {
  const mode = readOnly ? "read-only" : "read-write";
  return [
    CLAUDE_MD_BEGIN,
    `## Nexus Workspace`,
    ``,
    `The Nexus workspace \`${slug}\` is mounted at \`${mountPath}\` (${mode}).`,
    ``,
    `- It is **live shared team storage** — other people and agents (including Ultimate Cue)`,
    `  may read and write the same files concurrently. Re-read a file before relying on`,
    `  cached contents; writes are last-write-wins per file.`,
    `- Treat it like a normal directory: \`bash\`, \`python\`, Read/Write/Glob all work on it.`,
    readOnly
      ? `- This mount is read-only; do not attempt to modify files under it.`
      : `- Changes you save propagate to the shared workspace within a few seconds.`,
    CLAUDE_MD_END
  ].join("\n");
}

/** Insert or replace the managed Nexus-workspace block in ./CLAUDE.md. */
function writeClaudeMdNote(slug: string, mountPath: string, readOnly: boolean): string {
  const target = path.join(process.cwd(), "CLAUDE.md");
  const section = workspaceClaudeMdSection(slug, mountPath, readOnly);
  let content = "";
  try {
    content = fs.readFileSync(target, "utf-8");
  } catch {
    /* file doesn't exist yet */
  }

  const begin = content.indexOf(CLAUDE_MD_BEGIN);
  const end = content.indexOf(CLAUDE_MD_END);
  if (begin !== -1 && end !== -1 && end > begin) {
    const before = content.slice(0, begin).replace(/\n*$/, "");
    const after = content.slice(end + CLAUDE_MD_END.length).replace(/^\n*/, "");
    content = [before, section, after].filter(Boolean).join("\n\n") + "\n";
  } else {
    content = (content ? content.replace(/\n*$/, "") + "\n\n" : "") + section + "\n";
  }
  fs.writeFileSync(target, content);
  return target;
}

/**
 * The `mount` verb, registered on the `workspace` namespace
 * `registerWorkspaceCommands` owns, in the position that function gives it.
 * It speaks to this machine's mount registry and to the engines in
 * `workspace-mount-gateway.ts` and `workspace-mount-direct.ts`.
 */
export function registerWorkspaceMountCommand(ws: Command, program: Command): void {
  // ── mount ────────────────────────────────────────────────────────────────
  ws.command("mount")
    .description("Mount a workspace as a live drive so local Claude Code can use it")
    .argument("<slug>", "Workspace slug (see `nexus workspace list`)")
    .option("--at <path>", "Mount point (default: ~/nexus/<org>/<slug>)")
    .option(
      "--read-only",
      "Mount read-only (a CODE workspace is read-only regardless — this can only add it)"
    )
    .option(
      "--shared",
      "Mount the admin-shared workspace with this slug (not the same-slug org-owned one)"
    )
    .option(
      "--engine <engine>",
      "Mount engine: auto (default), webdav (native, macOS), rclone (the gateway over FUSE; Linux/Windows), " +
        "or direct (rclone signing storage itself)",
      "auto"
    )
    .option("--claude-md", "Write a managed note about the mount into ./CLAUDE.md")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace mount support-docs
  $ nexus workspace mount support-docs --at ./ws --claude-md
  $ nexus workspace mount support-docs --read-only
  $ nexus workspace mount support-docs --shared      # mount the admin-shared copy
  $ nexus workspace mount support-docs --engine direct

When a slug names BOTH an org-owned workspace and an admin-shared one, the bare
slug resolves to the org-owned copy. The mount then warns and tells you the id
it picked; pass --shared to mount the shared copy instead.

The default mount point is ~/nexus/<org>/<slug>, where <org> is your
organization's name slugified (its id when the name is unknown), so two orgs
mounting one slug land in two directories. With no organization known at all
(a raw --api-key and no NEXUS_ORGANIZATION_ID) it is the org-less
~/nexus/<slug>. Mount points are still machine-wide: a directory another org's
live mount already occupies is refused — pick another with --at <path>.

Engines (auto picks per-OS):
  • webdav  — macOS native mount_webdav. No extra install, no macFUSE, no
              Recovery mode. Every request is authorised by Nexus, so a revoked
              key stops the drive at once. The default on macOS, and macOS-ONLY:
              asking for it on Linux or Windows is refused outright.
  • rclone  — rclone mounting the same Nexus gateway over FUSE. Authorised by
              Nexus per request like webdav, and it works with a raw --api-key.
              The default on Linux (FUSE built-in) and Windows (WinFsp). Retired
              on macOS, where webdav and direct cover it: asking for it there
              is refused, naming both.
  • direct  — rclone signing storage requests itself with a one-hour key that
              renews itself while you use the drive (no action from you; a
              renewal that fails posts a macOS notification and shows in
              "workspace status"). Faster, with a local write cache. Opt-in
              everywhere: macFUSE or FUSE-T on macOS, FUSE on Linux. Not
              available on Windows yet — its renewal hook runs through a POSIX
              shell. The drive dies at logout or restart — "workspace remount
              <slug>" brings it back and uploads what the dead mount had not
              sent.

THE GATEWAY ENGINES (webdav, rclone) ARE THE FALLBACK: CORRECT, NOT FAST. Every
operation on them goes to Nexus and then to storage, so copying many small
files is slow by design — measured at 420× the direct engine on 20 small files
— and that is not scheduled to change. Use direct where it can run. Where it
cannot, the verbs that need no mount are the way around the slow cases:
"workspace push" and "workspace pull" move files in and out, "workspace
history" and "workspace revert" bring an earlier version of a file back.

Prerequisites for the engines that run rclone (rclone, direct):
  Linux    sudo -v ; curl https://rclone.org/install.sh | sudo bash
           sudo apt-get install fuse3
  Windows  winget install Rclone.Rclone   (plus WinFsp: https://winfsp.dev)
  macOS    the OFFICIAL rclone binary from https://rclone.org/downloads/ —
           Homebrew's build refuses "rclone mount" — plus ONE FUSE layer:
           macFUSE (https://macfuse.github.io; a kernel extension, approved
           once in Recovery mode on Apple Silicon) or FUSE-T
           (https://www.fuse-t.org; no kernel extension). The mount checks all
           of this before it asks Nexus for anything, and names what is missing.

Notes:
  THE MOUNT POINT MUST BE EMPTY, and it is created for you if it does not
  exist. A non-empty directory is refused with "Mount point <path> is not
  empty" before anything is mounted — pick another with --at.
  THE WEBDAV DRIVE IS NOT POSIX. In-place edits are unsupported there: mv,
  sed -i and >> answer "Function not implemented". Read the file, transform it
  in memory, and write the whole file back. The direct engine's write cache
  supports them.
  workspaces:read IS ENOUGH TO MOUNT AND READ. Writing needs workspaces:write
  and DELETING NEEDS workspaces:delete, which write does not imply — a
  read-write WebDAV mount on a key without it fails every rm with a 403 while
  every cp succeeds. --read-only is a local guard, not the scope. The direct
  engine asks Nexus for the access up front instead: a key without both
  workspaces:write and workspaces:delete gets a READ-ONLY drive, and the
  command says so.
  A SUCCESSFUL MOUNT IS NOT A WORKING MOUNT. mount_webdav and rclone both
  report success on a mount whose gateway then refuses every read. Verify by
  reading one file you know is there.
  --shared PICKS THE ADMIN-SHARED COPY. Without it a slug that names both
  resolves to the org-owned one, and the command warns and prints the id it
  chose — read that line.
  --claude-md WRITES TO ./CLAUDE.md IN THE CURRENT DIRECTORY, creating it if
  needed and replacing only its managed nexus-workspace block.
  THE MOUNT OUTLIVES THIS COMMAND. rclone is detached, so the CLI exits while
  the mount stays up; it survives until "nexus workspace unmount", a logout or
  reboot, or the process being killed. Its log is under the CLI's log
  directory.
  The drive is LIVE and SHARED: teammates and agents see your changes within
  seconds, and you see theirs. Unmount with \`nexus workspace unmount <slug>\`.
  A CODE WORKSPACE IS MOUNTED READ-ONLY FOR YOU, AND --read-only CANNOT BE
  TURNED OFF. CODE is a read-only projection of a git project, so the server
  refuses every PUT, DELETE and MOVE against it; the WebDAV mount is made
  read-only up front, "workspace status" prints Mode ro, and the command prints
  why. Change the files by pushing to the git project instead. --json carries
  storageKind (DRIVE / CODE) and readOnlyReason ("kind" / "requested" /
  "granted" / null) — note that --json's OWN "kind" key is this command's
  OWNERSHIP field (org-owned / admin-shared), a different question with the
  same name.
  THE DIRECT ENGINE REFUSES A CODE WORKSPACE OUTRIGHT: its storage also holds
  engine-owned checkout generations, and a local write cache would accept saves
  the server then drops. The refusal comes before any mint when the workspace
  list answers; when the list is unreachable, the mint's own answer decides and
  the minted key is discarded. Mount it with the default engine instead.
  THE DIRECT ENGINE REFUSES A RAW --api-key / NEXUS_API_KEY: its hourly renewal
  re-reads the key from the profile that saved it, and a key that was never
  saved cannot be re-read. Run "nexus auth login" first. It also needs an
  organization resolved for the profile, and records it — later "auth use-org"
  switches never re-point a live drive.
  IF THE WORKSPACE LIST CANNOT BE FETCHED, THE KIND IS UNKNOWN AND THE MOUNT
  FALLS BACK TO READ-WRITE. Unknown is not "writable" — the server still
  refuses the writes, you just lose the warning. Re-mount once
  "nexus workspace list" works again.
  --json ADDS mountId, access AND pendingUploads FOR A DIRECT MOUNT (null
  otherwise): the per-mount id "workspace credential-process" takes, the access
  Nexus granted, and how many saves a previous mount left in the cache that are
  uploading now — the string "unknown" when that cache is there and cannot be
  read, which is NOT the same as null and must not be counted as zero.
  Never a bucket, a prefix or a credential value.
  MOUNTING TO ANSWER "IS THAT FILE THERE" IS THE EXPENSIVE WAY.
  "nexus workspace search <slug> --query <text>" runs server-side, needs no
  mount, no rclone and no FUSE, and answers in one call. Mount when you need
  the BYTES; search when you need to know what exists.`
    )
    .action(
      async (
        slug: string,
        opts: {
          at?: string;
          readOnly?: boolean;
          shared?: boolean;
          engine?: string;
          claudeMd?: boolean;
        }
      ) => {
        try {
          assertMountableSlug(slug);
          const engine = resolveEngine(opts.engine);
          const { apiKey, baseUrl, scope } = resolveAuth(program.optsWithGlobals());
          const mountPath = path.resolve(opts.at || defaultMountPath(slug, scope));

          // Guard scoped to this org only: a second org mounting the same slug
          // at a different path must succeed (NEX-2360). findMount matches the
          // active scope's own entries (incl. a pre-drift or legacy bare-slug
          // mount of this slug) but never another org's, so a still-live mount
          // blocks a duplicate while cross-org mounts stay independent. The
          // error names the owning org/profile so a real conflict is actionable.
          const mounts = readMounts();
          const existing = findMount(mounts, slug, scope);
          if (existing && isMountLive(existing.record)) {
            // A row naming no org may belong to a different organization, so
            // "unmount it first" would be an instruction to detach someone
            // else's live drive. `alreadyMountedMessage` owns which of the three
            // remedies fits, beside the other mount texts a test can assert.
            throw new Error(alreadyMountedMessage(slug, existing.record, scope));
          }

          // The guard above is org-scoped; the mount POINT is not. `--at` names
          // any directory, rows written before the default carried an org
          // segment sit at `~/nexus/<slug>`, and another org's row there is
          // invisible to the scoped lookup above. Two rows naming one mount
          // point corrupt each other: every OS action keys off `mountPath`, so
          // `unmount` under org A would detach org B's live drive there. Check
          // the path across ALL scopes; the stale rows this reports are dropped
          // below, as we take the path over.
          const claim = claimMountPoint(mounts, mountPath, {
            exceptKey: existing?.key,
            isLive: isMountLive
          });
          if (claim.blockedBy) {
            throw new Error(mountPointTakenMessage(mountPath, claim.blockedBy.record, slug));
          }

          // The engines' own local refusals, before the one network call below:
          // for direct, the pins its renewal needs, then the rclone build and
          // the FUSE layer the spawn needs, then the credential_process line its
          // renewal runs through; for rclone, the same rclone preflight. Each
          // names its fix, and nothing has been minted.
          const key = mountKey(scope, slug);
          const plan = planMount(engine, scope, key);

          // Resolve which copy of the slug we're about to mount. A slug can name
          // BOTH an org-owned workspace and an admin-shared one; the bare slug
          // resolves to the org-owned copy server-side, so without this the user
          // can silently mount the wrong drive (NEX-2362). Best-effort: a list
          // hiccup degrades to the legacy bare-slug mount rather than blocking.
          const client = createClient(program.optsWithGlobals());
          const { target, listError } = await resolveMountTargetDetailed(
            client,
            slug,
            !!opts.shared
          );

          // `--shared` is an explicit request, so never proceed unverified: a
          // missing list (target === null) means we couldn't confirm the shared
          // workspace exists, and a confirmed-absent one is a hard error. Either
          // way, mounting the `_shared/<slug>` path blindly would yield a live
          // mount that 404s on every request (esp. under rclone). The default
          // (bare-slug) path still degrades gracefully when the list is missing.
          if (opts.shared) {
            if (!target) {
              // RETHROW THE LIST'S OWN ERROR, never a fresh one. A null target
              // only ever means `workspaces.list()` threw, and that error already
              // knows what it was — unreachable API, a 401, a 5xx. Replacing it
              // with a plain `Error` here erased that: `handleError` had nothing
              // left to classify and stamped CLI_UNKNOWN_ERROR on a failure the
              // CLI had just diagnosed, which is the one thing an error document's
              // `code` must never do. The message below is worth less than the
              // cause, so the cause wins.
              throw (
                listError ??
                new Error(
                  `Couldn't verify workspaces for "${slug}" — fetching the workspace list failed.`
                )
              );
            }
            if (!target.shared) {
              throw failure(
                "not-found",
                `No admin-shared workspace has the slug "${slug}".`,
                "Run `nexus workspace list` to see available workspaces, or drop --shared for the org-owned one."
              );
            }
          }

          const useShared = !!opts.shared || (!!target?.shared && !target.orgOwned);

          // A read-only KIND forces a read-only MOUNT. The server refuses every
          // mutating verb against a CODE workspace, so a read-write mount grants
          // nothing a mount_webdav read-only one does not — it only moves the
          // refusal from mount time to save time, where it arrives as a bare
          // "Permission denied" naming no workspace and no reason. Under a local
          // write cache it is worse: the save succeeds and the bytes are dropped
          // at upload — which is why the direct engine refuses the kind outright
          // rather than mounting it read-only.
          //
          // `--read-only` can only ADD this, never remove it: a user asking for
          // read-write on a projection is asking for something the server has
          // already decided to refuse.
          const storageKind = target?.kind;
          if (plan.engine === "direct" && storageKind !== undefined) {
            refuseCodeWorkspaceOnDirect(slug, storageKind);
          }
          const requestedReadOnly = !!opts.readOnly || kindForcesReadOnlyFor(storageKind);

          // Drop a stale prior row (possibly under a legacy bare-slug or
          // pre-drift key) so we don't leave a duplicate entry for this same
          // workspace + org — legacy records migrate to a scoped key here.
          // Same for a dead row of ANOTHER scope that names this mount point:
          // it describes nothing live, and left in place it would come to
          // describe OUR mount — a later unmount of that row would detach a
          // drive it never mounted. Deleted only in memory here; the registry
          // file is untouched unless the mount below actually succeeds. A dead
          // DIRECT row is retired first: its unsent saves refuse a replacement
          // that would not upload them, and its session goes with it.
          if (existing) retireDeadRow(mounts, existing, plan);
          for (const dead of claim.stale) {
            printWarning(
              `Reclaiming ${mountPath} from a stale mount record ` +
                `(${describeOwner(dead.record)}, workspace "${dead.record.slug}").`,
              "That mount is no longer live, so its registry entry is being replaced."
            );
            retireDeadRow(mounts, dead, plan);
          }

          const davPath = useShared ? `_shared/${slug}` : slug;
          const mounted = await mountOnto(mountPath, () =>
            plan.engine === "direct"
              ? mountDirect({
                  slug,
                  mountPath,
                  readOnly: requestedReadOnly,
                  shared: useShared,
                  workspaceId: target?.workspaceId,
                  mountId: plan.mountId,
                  baseUrl,
                  pins: plan.pins,
                  awsConfig: plan.awsConfig,
                  client
                })
              : mountGateway({
                  engine: plan.engine,
                  slug,
                  davPath,
                  baseUrl,
                  apiKey,
                  mountPath,
                  readOnly: requestedReadOnly,
                  timeoutSeconds: program.optsWithGlobals().timeout as number | undefined
                })
          );
          const { record } = mounted;
          // The EFFECTIVE mode: the flag, the kind, or a grade the server
          // lowered. The row records the REQUEST (`readOnly`) and the grant
          // (`access`) separately, so `remount` can ask for the same thing again
          // and come back read-write once a lost grant is restored; `modeOf`
          // joins the two for `workspace status`.
          const readOnly = effectiveReadOnly(opts, storageKind, mounted);

          // The mint's answer wins over the profile's saved copy — see
          // `refreshProfileOrgName`. One definition (`actingOrgNameFor`) so the
          // row, the JSON and the printed summary cannot disagree about which
          // name they show.
          const actingOrgName = actingOrgNameFor(mounted, scope);

          // Org-scope the registry (NEX-2360): key by `<kind>:<acting-org>|<slug>`
          // and stamp the org/profile pinned at mount time, plus the ro/rw mode
          // (NEX-2372) and the org-owned-vs-admin-shared disambiguation
          // (NEX-2362), so `unmount`/`status` can tell which drive this is.
          const workspaceId = record.workspaceId ?? target?.workspaceId;
          mounts[key] = {
            ...record,
            shared: useShared,
            readOnly: requestedReadOnly,
            ...(scope.orgId ? { orgId: scope.orgId } : {}),
            ...(actingOrgName ? { orgName: actingOrgName } : {}),
            ...(scope.profile ? { profile: scope.profile } : {}),
            ...(workspaceId ? { workspaceId } : {})
          };
          writeMounts(mounts);

          let claudeMdTarget: string | null = null;
          if (opts.claudeMd) {
            claudeMdTarget = writeClaudeMdNote(slug, mountPath, readOnly);
          }

          // Ambiguous = both copies exist. Warn whenever we resolved one while
          // the other was reachable, so the user can tell which drive they got.
          const ambiguous = !!target?.shared && !!target?.orgOwned;

          printMountReport({
            slug,
            engine,
            mountPath,
            useShared,
            workspaceId,
            ambiguous,
            record,
            opts,
            mounted,
            storageKind,
            scope,
            claudeMdTarget
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
}
