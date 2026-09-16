import type { Command } from "commander";

import { configFileState, loadConfig } from "../config";
import { handleError, reportFailure } from "../errors";
import { type Engine, type MountRecord, readMounts } from "../mount-registry";
import { color, type Column, isJsonMode, printTable } from "../output";
import { firstNonBlankOr } from "../util/present-text";
import {
  describePendingUploads,
  describeRefresh,
  type DirectMountHealth,
  directMountHealth,
  formatExpiry,
  isMountAccess,
  isMountId,
  type RefreshJson,
  refreshJson,
  refreshVerdictIsUnhealthy,
  remountFix
} from "../workspace-direct-mount";
import { isMountLive, jsonPendingUploads } from "./workspace-mount-shared";

// ── Status rows ───────────────────────────────────────────────────────────────

/**
 * Reads `config.json` once, and only when a direct row asks.
 *
 * 🔴 Answers `true` for a profile it could not look for. `loadConfig` returns an
 * empty config for a MISSING file and for a DAMAGED one alike, so a truncated
 * config would report every live drive as `broken — profile missing`, and the
 * fix that verdict prints is `nexus auth login`, which SAVES a fresh config over
 * the file nothing could read. The remedy would delete the profiles the
 * diagnosis only failed to see.
 *
 * So the absence has to be established before it is reported: only a config that
 * is readable, or genuinely absent, can say a profile is not in it.
 */
function profilePresence(): (name: string) => boolean {
  let profiles: Set<string> | null = null;
  let unreadable: boolean | null = null;
  return (name) => {
    unreadable ??= configFileState() === "unreadable";
    if (unreadable) return true;
    profiles ??= new Set(Object.keys(loadConfig().profiles));
    return profiles.has(name);
  };
}

function directHealthOf(
  record: MountRecord,
  profileExists: (name: string) => boolean,
  now: Date
): DirectMountHealth {
  // 🔴 THE SHAPE, NOT ONLY THE PRESENCE. `readMounts` parses and casts, so
  // `mountId` is a claim about a JSON file — and `sessionPathsFor` THROWS on a
  // malformed one, deliberately, because two of its paths are handed to a
  // recursive delete. That throw escapes the row's own `.map()` and takes the
  // whole command with it, so ONE corrupt row printed a generic error and NONE
  // of the caller's healthy mounts. Worse, its message names `workspace status`
  // as the way to check — the command it just killed. A bad row is a broken ROW.
  if (record.mountId === undefined || !isMountId(record.mountId)) {
    return {
      verdict: {
        kind: "broken",
        what:
          record.mountId === undefined
            ? "mount id missing from the registry row"
            : `mount id "${record.mountId}" in the registry row is not 16 hex digits`,
        fix: remountFix(record.slug)
      },
      expiresAt: null,
      pendingUploads: 0
    };
  }
  return directMountHealth({ mountId: record.mountId, slug: record.slug, profileExists, now });
}

/** One registry row, projected for `--json` and rendered for the table. */
interface StatusRow {
  readonly json: {
    readonly slug: string;
    readonly engine: Engine;
    readonly kind: "shared" | "org";
    readonly mode: "ro" | "rw" | null;
    readonly orgId: string | null;
    readonly orgName: string | null;
    readonly profile: string | null;
    readonly mountPath: string;
    readonly mountId: string | null;
    readonly expiresAt: string | null;
    readonly refresh: RefreshJson | null;
    /** A count, `"unknown"` for a cache present and unreadable, `null` off the direct engine. */
    readonly pendingUploads: number | "unknown" | null;
    readonly live: "yes" | "no";
    readonly mountedAt: string;
  };
  readonly table: {
    readonly slug: string;
    readonly org: string;
    readonly profile: string;
    readonly mode: string;
    readonly engine: Engine;
    readonly kind: "shared" | "org";
    readonly mountPath: string;
    readonly live: "yes" | "no";
    readonly expires: string;
    readonly refresh: string;
    readonly pending: string;
  };
  readonly health: DirectMountHealth | null;
}

/**
 * The EFFECTIVE mode: what was asked for (`readOnly` — the flag, or a CODE
 * kind) or, on a direct row, the read grade the server granted instead. The
 * row keeps the request so `remount` can ask for it again; this column is
 * where the grant joins it, so a drive that refuses every write never prints
 * `rw`.
 */
function modeOf(record: MountRecord): "ro" | "rw" | null {
  // Mode is observable BEFORE writing now (NEX-2372). Legacy records predate
  // the field, so surface "unknown" rather than guessing rw.
  if (record.readOnly === undefined) return null;
  // A grade this CLI does not recognise is "unknown", never "read-write".
  // `access` comes out of the same parsed-and-cast registry file as `mountId`,
  // so `"READ"` or a truncated write would otherwise fall through the equality
  // below and print `rw` over a drive the server graded read — the one claim
  // this column exists to never make.
  if (record.access !== undefined && !isMountAccess(record.access)) return null;
  return record.readOnly || record.access === "read" ? "ro" : "rw";
}

function statusRow(
  record: MountRecord,
  now: Date,
  profileExists: (name: string) => boolean
): StatusRow {
  const health = record.engine === "direct" ? directHealthOf(record, profileExists, now) : null;
  const live = isMountLive(record) ? "yes" : "no";
  const json: StatusRow["json"] = {
    slug: record.slug,
    engine: record.engine,
    kind: record.shared ? "shared" : "org",
    mode: modeOf(record),
    // Acting org + profile pinned at mount time (NEX-2360/NEX-2372). Null on
    // legacy records and unknown-org (--api-key) mounts.
    orgId: record.orgId ?? null,
    orgName: record.orgName ?? null,
    profile: record.profile ?? null,
    mountPath: record.mountPath,
    // The direct engine's per-mount id — a hash, never a storage name.
    mountId: record.mountId ?? null,
    expiresAt: health?.expiresAt ?? null,
    refresh: health === null ? null : refreshJson(health.verdict),
    pendingUploads: jsonPendingUploads(health?.pendingUploads),
    live,
    mountedAt: record.mountedAt
  };
  return {
    json,
    table: tableRowFor(json, health, now, live),
    health
  };
}

/** The table's rendering of one row: every `null` in the `--json` projection becomes a placeholder glyph here. */
function tableRowFor(
  json: StatusRow["json"],
  health: DirectMountHealth | null,
  now: Date,
  live: "yes" | "no"
): StatusRow["table"] {
  const expiresAt = health?.expiresAt ?? null;
  return {
    slug: json.slug,
    org: firstNonBlankOr([json.orgName, json.orgId], "?"),
    profile: json.profile ?? "-",
    mode: json.mode ?? "?",
    engine: json.engine,
    kind: json.kind,
    mountPath: json.mountPath,
    live,
    expires: expiresAt === null ? "-" : formatExpiry(expiresAt, now),
    refresh: health === null ? "-" : describeRefresh(health.verdict, now, live === "yes"),
    pending: health === null ? "-" : describePendingUploads(health.pendingUploads)
  };
}

/** The fields the status refusal names a row by. */
interface StatusRowIdentity {
  readonly slug: string;
  readonly orgName: string | null;
  readonly orgId: string | null;
  readonly mountPath: string;
}

function describeStatusRow(row: StatusRowIdentity): string {
  return `  ${row.slug}  [${firstNonBlankOr([row.orgName, row.orgId], "org not recorded")}]  ${row.mountPath}`;
}

/**
 * PRINT the refusal an unhealthy registry means and RETURN its exit code.
 *
 * Two shapes share one document: rows whose mount is GONE, and direct rows
 * whose mount may be live but whose next renewal cannot succeed — a failed
 * refresh with a non-transient reason, or a session, path or profile the
 * helper needs that is no longer there. Both are `local-failed`, and the
 * category's own declaration is the whole argument: "a local operation this
 * CLI performed failed … nothing about the caller's input is wrong and no
 * retry against the API helps". No server is involved in this command at all
 * — it reads the local registry — so `remote-error` would name a host that was
 * never contacted.
 *
 * ⚠️ ASSIGN THE RETURN VALUE. `reportFailure` only writes the document; a bare
 * call emits a perfect error and exits `0`, which is the class this change is
 * draining.
 */
function reportUnhealthyMounts(
  dead: readonly StatusRowIdentity[],
  broken: readonly (StatusRowIdentity & { readonly refresh: string })[]
): number {
  const lines: string[] = [];
  if (dead.length > 0) {
    // 🚨 THE MOUNT POINT, NEVER THE SLUG ALONE. The same slug can be mounted
    // for several organizations — `workspace status` exists partly to show
    // that — and under --json this document REPLACES the rows, so a message
    // naming only the slug leaves a reader unable to tell WHICH of two mounts
    // died. The path is the one field that is unique per mount by
    // construction: `workspace mount` refuses a mount point another org
    // already holds.
    lines.push(
      `${String(dead.length)} recorded mount(s) are NOT live:`,
      ...dead.map(describeStatusRow)
    );
  }
  if (broken.length > 0) {
    lines.push(
      `${String(broken.length)} direct mount(s) cannot renew their access:`,
      ...broken.map((row) => `${describeStatusRow(row)}\n    ${row.refresh}`)
    );
  }
  const hints: string[] = [];
  if (dead.length > 0) {
    // ⚠️ NO BARE "unmount <slug>" HERE. That verb RESOLVES BY ACTING ORG and
    // takes no path, so on a slug mounted for two orgs it can detach the LIVE
    // one and leave the dead row that caused this exit. Its own refusal lists
    // the candidates when the acting org owns none of them, which is the safe
    // route — so the reader is pointed at the path and told what decides.
    hints.push(
      'A row reading live:no means the LOCAL mount is gone; it says nothing about the workspace on the server. "workspace unmount" and "workspace remount" resolve by ACTING ORG and take no path, so switch profile or pass --profile to reach the org named above before using either — on a slug mounted for two orgs they can otherwise act on the live one.'
    );
  }
  if (broken.length > 0) {
    hints.push(
      "A renewal that cannot succeed leaves the drive erroring on every click once its access expires; each row above names its fix."
    );
  }
  return reportFailure("local-failed", lines.join("\n"), hints.join(" "));
}

/**
 * The `status` verb, registered on the `workspace` namespace
 * `registerWorkspaceCommands` owns, in the position that function gives it.
 * A local read of the mount registry, never a server check.
 *
 * `_program` is unread: `command-universe.ts` tells a nested registrar from a
 * root one by ARITY, so a one-parameter `register*` export here would be
 * grafted onto the root program as a top-level `status` command.
 */
export function registerWorkspaceStatusCommand(ws: Command, _program: Command): void {
  // ── status ─────────────────────────────────────────────────────────────────
  ws.command("status")
    .description("Show locally recorded mounts — a local read, never a server check")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace status
  $ nexus workspace status --json

Notes:
  LIVE REFLECTS THE MOUNT ONLY, NEVER THE SERVER. It is a process check for
  the rclone and direct engines (the recorded pid must still be an rclone
  mount) and a mount-table check for the native engine, so a row can read Live
  yes and still fail every read when the WebDAV gateway refuses, the key was
  revoked or the workspace was deleted. CONFIRM BY READING ONE KNOWN FILE.
  IT SHOWS EVERY ORG'S MOUNTS, not just the active one, and needs no auth — it
  reads the local registry and, for a direct mount, that mount's own files.
  "?" IS "NOT RECORDED", NOT "NONE". Org prints "?" when the mount was made
  with a raw --api-key and no NEXUS_ORGANIZATION_ID, and Mode prints "?" on a
  mount recorded before the mode was tracked — that mount may be read-write.
  Profile prints "-" in the same situation, not "?".
  Under --json the same fields are null rather than "?" / "-", so a script can
  tell "unknown" from a literal value.
  A DIRECT MOUNT GETS THREE MORE COLUMNS, FROM LOCAL READS ONLY. Expires is
  when its current hour of access ends ("in 41m", "expired 3m ago" — an expired
  drive that is still running renews itself on the next click). Refresh is
  exactly one of: "ok <ago>" · "stale: expired <ago>, refreshes on next
  access" (or ", mount is not live — remount" when Live is no) · "failed
  <ago>: <what> — <fix>" · "broken: <what> — run: <fix>". Pending is how many
  saves have not reached the workspace yet. Other
  engines print "-"; under --json the three are expiresAt, refresh
  {outcome, at, reason, transient, fix} and pendingUploads, null elsewhere.
  mountId IS PRINTED UNDER --json ONLY: the direct engine's per-mount id, the
  operand "nexus workspace credential-process" takes. Null on other engines.
  Never a bucket, a prefix or a credential value, on either channel.
  Mode is what the mount was CREATED with. It does not re-derive the scopes the
  key actually holds, so Mode rw on a key without workspaces:write is possible.
  "No workspaces mounted." means the registry is empty. It does not mean the OS
  has nothing mounted, and it exits 0 — nothing is recorded, so nothing is wrong.
  THE EXIT CODE CARRIES live AND Refresh. Any recorded mount reading no, and
  any LIVE direct mount whose last renewal failed for a reason the next click
  cannot cure or whose renewal path is broken, makes this exit non-zero and
  names the rows, so a script can gate on a drive it depends on. A dead row is
  named once, as dead: its remount rewrites what a broken renewal path needs.
  A failed renewal that is TRANSIENT (offline, a slow answer) is printed and
  exits 0.
  It is still a LOCAL check: a 0 means every recorded mount is mounted and
  renewable, never that the server still has the workspace. Under --json a
  non-zero exit REPLACES the rows with the error document.`
    )
    .action(() => {
      try {
        const mounts = readMounts();
        const now = new Date();
        const profileExists = profilePresence();
        const rows = Object.values(mounts).map((m) => statusRow(m, now, profileExists));
        const records = rows.map((row) => row.json);
        // 🚨 `live` IS THE ONE FACT A SCRIPT COMES HERE FOR, and the exit code
        // never said it. This command's own help already warns that a mount can
        // read Live yes and still fail every read — so the exit code is the only
        // cheap way a caller learns a drive it depends on is GONE, and it always
        // said "fine". A direct mount whose renewal cannot succeed is the same
        // fact one hour early.
        //
        // ⚠️ AN EMPTY REGISTRY IS NOT A FAILURE. "No workspaces mounted." means
        // nothing is recorded here, which the help is careful to say is not a
        // claim about what the OS has mounted. Exiting non-zero on it would
        // refuse a machine that is doing exactly what was asked of it.
        const dead = records.filter((r) => r.live === "no");
        // A dead row is reported once, as dead: its remount rewrites the session
        // and the config, so whatever else is wrong with it goes with the fix.
        const broken = rows
          .filter(
            (row) =>
              row.json.live === "yes" &&
              row.health !== null &&
              refreshVerdictIsUnhealthy(row.health.verdict)
          )
          .map((row) => ({ ...row.json, refresh: row.table.refresh }));
        const unhealthy = dead.length > 0 || broken.length > 0;

        if (isJsonMode()) {
          // Under --json a failure is the error document and NOTHING else.
          // Printing the rows and then refusing takes stdout with a document
          // that parses cleanly and never says a mount is gone — `error-masked`
          // in `json-one-document.scan.ts`.
          if (unhealthy) {
            process.exitCode = reportUnhealthyMounts(dead, broken);
          } else {
            console.log(JSON.stringify(records, null, 2));
          }
          return;
        }
        if (records.length === 0) {
          console.log(color.dim("No workspaces mounted."));
          return;
        }
        // `records` keeps the nullable raw fields for `--json`; the table needs
        // rendered placeholders. No cast: `printTable` checks column keys
        // against the row type now, and the cast would take this call site back
        // out of that check.
        const table = rows.map((row) => row.table);
        const directColumns: Column<(typeof table)[number]>[] = rows.some(
          (row) => row.health !== null
        )
          ? [
              { key: "expires", label: "Expires" },
              { key: "refresh", label: "Refresh" },
              { key: "pending", label: "Pending" }
            ]
          : [];
        printTable(table, [
          { key: "slug", label: "Slug" },
          { key: "org", label: "Org" },
          { key: "profile", label: "Profile" },
          { key: "mode", label: "Mode" },
          { key: "engine", label: "Engine" },
          { key: "kind", label: "Kind" },
          { key: "mountPath", label: "Mount point" },
          { key: "live", label: "Live" },
          ...directColumns
        ]);

        // The table above already shows a human which row reads "no"; the exit
        // code is the half a script reads, and it said nothing.
        if (unhealthy) {
          process.exitCode = reportUnhealthyMounts(dead, broken);
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
