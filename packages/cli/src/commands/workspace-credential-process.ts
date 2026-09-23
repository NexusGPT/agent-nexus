import { type WorkspaceMountCredentials } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient, type Seconds, seconds, secondsToMs } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError, refuse, reportFailure } from "../errors";
import { EXIT_CODES } from "../exit-codes";
import { emitDocument, isJsonMode, printSuccess, printWarning } from "../output";
import { checkRefreshPath } from "../workspace-direct-mount/check-refresh-path";
import { mintBodyFor } from "../workspace-direct-mount/mint-body";
import { accessIsLower } from "../workspace-direct-mount/mount-access";
import { isMountId } from "../workspace-direct-mount/mount-id";
import type { MountSession } from "../workspace-direct-mount/mount-session";
import { processCredentialsDocument } from "../workspace-direct-mount/process-credentials-document";
import { readSession } from "../workspace-direct-mount/read-session";
import { refreshCooldownFailure } from "../workspace-direct-mount/refresh-cooldown";
import { REFRESH_EXIT_CAUSE } from "../workspace-direct-mount/refresh-exit-cause";
import { refreshFailureReasonFor } from "../workspace-direct-mount/refresh-failure-reason";
import {
  REFRESH_FAILURE_TABLE,
  type RefreshContext
} from "../workspace-direct-mount/refresh-failure-table";
import type { RefreshFailureReason, RefreshRecord } from "../workspace-direct-mount/refresh-record";
import {
  REFRESH_RETRY_DELAY_MS,
  refreshMayRetry
} from "../workspace-direct-mount/refresh-retry-budget";
import { announced, shouldNotify } from "../workspace-direct-mount/should-notify";
import { writeSession } from "../workspace-direct-mount/write-session";
import { WORKSPACE_MINT_MOUNT_CREDENTIALS_CONTRACT } from "./workspace.contract.generated";
import { notifyDesktop } from "./workspace-mount/notify-desktop";

// ── credential-process: the direct engine's refresh hook ──────────────────────
//
// rclone's AWS SDK runs `<node> <entry> workspace credential-process <mountId>`
// on the first S3 request at or after the `Expiration` the previous run
// reported, and kills it at 60 s. Everything below is sized for that budget:
// one bounded client, a retry that stops inside `REFRESH_BUDGET_MS` and only
// ever absorbs a network blip, and a 30 s cooldown so a broken mount polled by
// Finder is not a POST storm.
//
// 🚨 STDOUT IS THE SDK'S. It holds exactly one JSON document — the AWS
// process-credentials shape — and nothing else, ever. Every diagnostic goes
// to stderr through the CLI's ordinary failure printers, which is also what
// puts an error document on stdout for a human who passed `--json`.

/** The client's ceiling for ONE attempt; `refreshMayRetry` bounds the sum. */
const REFRESH_TIMEOUT_SECONDS: Seconds = seconds(20);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function refreshContextOf(session: MountSession): RefreshContext {
  return { slug: session.workspace.slug, profile: session.profile };
}

type RemintResult =
  | { readonly ok: true; readonly minted: WorkspaceMountCredentials }
  | { readonly ok: false; readonly reason: RefreshFailureReason; readonly detail: string };

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One re-mint through the PINNED profile and organization. The client is
 * built from `session.profile` — so the key is read from `config.json` on every
 * run and a fresh `auth login` under that name heals the mount — and from
 * `session.orgId` as an override, so nothing that happened to the shell or the
 * active profile since the mount can re-point it. The body is `mintBodyFor`'s,
 * the same one the mount sent.
 */
async function remintSession(
  session: MountSession,
  globals: { timeout?: Seconds }
): Promise<RemintResult> {
  // The same ceiling the client gets, in the unit the budget is kept in.
  const timeoutMs = secondsToMs(globals.timeout ?? REFRESH_TIMEOUT_SECONDS);
  let client: ReturnType<typeof createClient>;
  try {
    client = createClient({
      profile: session.profile,
      baseUrl: session.baseUrl,
      organizationId: session.orgId,
      timeout: globals.timeout ?? REFRESH_TIMEOUT_SECONDS,
      maxRetries: 0
    });
  } catch (error) {
    // The profile is gone (`auth logout`) or unreadable: the fix is the same
    // sign-in the not-authenticated text names, under the same profile name.
    return { ok: false, reason: "not-authenticated", detail: describeError(error) };
  }

  const startedAt = Date.now();
  for (let attempt = 1; ; attempt += 1) {
    try {
      const minted = await client.workspaces.mintMountCredentials(
        session.workspace.slug,
        mintBodyFor(session.workspace, session.access)
      );
      return { ok: true, minted };
    } catch (error) {
      const reason = refreshFailureReasonFor(error);
      const retry =
        REFRESH_FAILURE_TABLE[reason].transient &&
        refreshMayRetry({ attempt, elapsedMs: Date.now() - startedAt, timeoutMs });
      if (!retry) return { ok: false, reason, detail: describeError(error) };
      await sleep(REFRESH_RETRY_DELAY_MS);
    }
  }
}

/**
 * Tell the desktop that the drive changed state. Detached, stdio ignored and
 * never awaited: the notification must not touch stdout and must not hold the
 * helper past the SDK's deadline. macOS only — `osascript` is the only
 * notifier this CLI knows.
 */
/**
 * Write the outcome BEFORE anything is printed or the process exits, so
 * `workspace status` can name what happened even when the helper is killed a
 * moment later.
 *
 * A write the disk refuses (full, or the directory no longer the caller's) is
 * reported on stderr and stops nothing: the caller still owes the SDK its
 * document or its exit code, and a lease that was minted is served rather
 * than thrown away for a bookkeeping failure. The notification waits on the
 * record, so a directory that refuses every write cannot turn every S3 request
 * into a desktop notification.
 */
function recordRefreshOutcome(session: MountSession, record: RefreshRecord, now: Date): void {
  const notify = shouldNotify(session, record, now);
  const next: MountSession = {
    ...session,
    lastRefresh: record,
    ...(notify ? { lastNotified: announced(session, record) } : {})
  };
  try {
    writeSession(next);
  } catch (error) {
    printWarning(
      `Could not record this renewal for "nexus workspace status": ${describeError(error)}`,
      REFRESH_FAILURE_TABLE["local-failed"].statusHint(refreshContextOf(session))
    );
    return;
  }
  if (notify) notifyDesktop(next.volumeName, record, refreshContextOf(session));
}

/** The session after a successful re-mint: new triplet, same pins. */
function refreshedSession(
  session: MountSession,
  minted: WorkspaceMountCredentials,
  now: Date
): MountSession {
  return {
    ...session,
    credentials: {
      accessKeyId: minted.credentials.accessKeyId,
      secretAccessKey: minted.credentials.secretAccessKey,
      sessionToken: minted.credentials.sessionToken
    },
    expiresAt: minted.expiresAt,
    mintedAt: now.toISOString()
  };
}

/** Print the refusal on stderr and return its exit code. Stdout stays empty. */
function reportRefreshFailure(
  session: MountSession,
  reason: RefreshFailureReason,
  detail: string
): number {
  const hint = REFRESH_FAILURE_TABLE[reason].statusHint(refreshContextOf(session));
  return reportFailure(
    REFRESH_EXIT_CAUSE[reason],
    `Could not renew access to "${session.workspace.slug}": ${detail}`,
    hint
  );
}

/**
 * Record a failed refresh, notify on the ok→failed transition, and refuse.
 * `now` is taken fresh: the attempts before this may have waited seconds.
 */
function failRefresh(session: MountSession, reason: RefreshFailureReason, detail: string): number {
  const now = new Date();
  recordRefreshOutcome(session, { at: now.toISOString(), outcome: "failed", reason }, now);
  return reportRefreshFailure(session, reason, detail);
}

/**
 * `--check`: is the mount's refresh path usable, without minting anything?
 * `checkRefreshPath` is the probe — the same one `mount` runs before spawning
 * rclone and `status` runs on every direct row. Prints no credential value on
 * either channel.
 */
function checkCredentialProcess(session: MountSession): number {
  const probe = checkRefreshPath(session);
  if (!probe.ok) {
    return reportFailure(
      "local-failed",
      `${probe.problem}.`,
      REFRESH_FAILURE_TABLE["local-failed"].statusHint(refreshContextOf(session))
    );
  }
  const summary = {
    ok: true,
    mountId: session.mountId,
    profile: session.profile,
    workspace: session.workspace.slug,
    access: session.access,
    expiresAt: session.expiresAt,
    lastRefresh: session.lastRefresh ?? null
  };
  if (isJsonMode()) {
    emitDocument(summary);
  } else {
    printSuccess(`credential-process ${session.mountId}: the refresh path is usable`, {
      profile: session.profile,
      workspace: session.workspace.slug,
      access: session.access,
      expires: session.expiresAt
    });
  }
  return EXIT_CODES.success;
}

async function runCredentialProcess(
  mountId: string,
  opts: { check?: boolean },
  globals: { timeout?: Seconds }
): Promise<number> {
  if (!isMountId(mountId)) {
    return refuse(
      `"${mountId}" is not a mount id.`,
      'A mount id is the 16 hex digits "nexus workspace status --json" reports as mountId for a direct-engine mount.'
    );
  }
  const read = readSession(mountId);
  if (!read.ok) {
    return reportFailure(
      "local-failed",
      read.why === "missing"
        ? `No session is recorded for mount ${mountId}.`
        : `The session file for mount ${mountId} is unreadable.`,
      'The drive needs a fresh mount: "nexus workspace status" names its slug, then run: nexus workspace remount <slug>.'
    );
  }
  const { session } = read;
  if (opts.check) return checkCredentialProcess(session);

  const now = new Date();
  const fresh = processCredentialsDocument(session, now);
  if (fresh !== null) {
    emitDocument(fresh);
    return EXIT_CODES.success;
  }

  const coolingDown = refreshCooldownFailure(session, now);
  if (coolingDown !== null) {
    const ago = Math.round((now.getTime() - new Date(coolingDown.at).getTime()) / 1000);
    return reportRefreshFailure(
      session,
      coolingDown.reason,
      `refused without asking Nexus — the last renewal failed ${ago}s ago`
    );
  }

  const result = await remintSession(session, globals);
  if (!result.ok) return failRefresh(session, result.reason, result.detail);

  const { minted } = result;
  if (minted.workspace.id !== session.workspace.id) {
    return failRefresh(
      session,
      "workspace-replaced",
      `Nexus answered with workspace ${minted.workspace.id}`
    );
  }
  if (accessIsLower(minted.access, session.access)) {
    return failRefresh(session, "access-downgraded", `Nexus granted ${minted.access}`);
  }
  const renewedAt = new Date();
  const renewed = refreshedSession(session, minted, renewedAt);
  const document = processCredentialsDocument(renewed, renewedAt);
  if (document === null) {
    return failRefresh(
      session,
      "remote-error",
      `Nexus minted a credential already expiring at ${minted.expiresAt}`
    );
  }
  recordRefreshOutcome(renewed, { at: renewedAt.toISOString(), outcome: "ok" }, renewedAt);
  emitDocument(document);
  return EXIT_CODES.success;
}

export function registerWorkspaceCredentialProcessCommand(ws: Command, program: Command): void {
  // ── credential-process ────────────────────────────────────────────────────
  const credentialProcess = ws
    .command("credential-process")
    .description(
      "Emit AWS process credentials for a direct-engine mount. Run by rclone's AWS SDK; not for interactive use."
    )
    .argument(
      "<mountId>",
      'The mount id — the 16 hex digits "nexus workspace status --json" reports as mountId for a direct-engine mount'
    )
    .option(
      "--check",
      "Validate the session and the credential_process line without printing a credential"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace credential-process 0123456789abcdef --check

Notes:
  YOU DO NOT RUN THIS. A direct-engine mount writes a credential_process line
  into its own AWS config, and rclone's AWS SDK runs this command through it
  on the first S3 request at or after the expiry the previous run reported.
  STDOUT IS ONE JSON DOCUMENT FOR THE SDK — the AWS process-credentials shape,
  never a table — and every diagnostic goes to stderr.
  IT RENEWS ONLY WHEN THE STORED ACCESS IS INSIDE FIVE MINUTES OF EXPIRY.
  Otherwise it prints the stored triplet, with an Expiration five minutes
  early so an upload in flight finishes on access that is still valid.
  A RENEWAL ACTS ON THE PROFILE AND ORGANIZATION PINNED AT MOUNT TIME, read
  from the mount's own session file. "nexus auth use-org" or an exported
  NEXUS_ORGANIZATION_ID after mounting cannot re-point a live drive; a fresh
  "nexus auth login" under the same profile name heals it on the next click.
  IT REFUSES A RENEWAL IT MUST NOT SERVE: a lower grade than the mount was
  made with (a read credential under a read-write drive lets a save succeed
  locally and vanish at upload), or a different workspace behind the same
  slug. Both exit non-zero and name the fix.
  AFTER A FAILURE IT REFUSES FOR 30 SECONDS WITHOUT ASKING NEXUS, so a Finder
  poll on a broken drive is not a storm of requests. The outcome of every
  renewal is recorded for "nexus workspace status" before this command exits;
  when that record cannot be written, stderr says so and a renewed lease is
  still served.
  ON macOS THE ok→failed AND failed→ok TRANSITIONS POST A NOTIFICATION, at most
  once per ten minutes for the same state.
  --check READS THE SESSION AND THE AWS CONFIG AND EXITS 0 WHEN THE REFRESH
  PATH IS USABLE, NON-ZERO WHEN IT IS NOT. It prints no credential value on
  either channel.`
    )
    .action(async (mountId: string, opts: { check?: boolean }) => {
      try {
        process.exitCode = await runCredentialProcess(mountId, opts, program.optsWithGlobals());
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(credentialProcess, WORKSPACE_MINT_MOUNT_CREDENTIALS_CONTRACT, {
    "Body.access":
      "the access ceiling is chosen once, at mount time, and recorded in the mount's session; " +
      "a refresh asks for the recorded grade again and refuses anything lower"
  });
}
