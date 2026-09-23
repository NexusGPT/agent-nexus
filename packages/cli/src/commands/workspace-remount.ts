import { DEFAULT_REQUEST_TIMEOUT_MS } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient, type Seconds, seconds } from "../client";
import { handleError, invalidInput } from "../errors";
import {
  type Engine,
  findMount,
  findMountsBySlug,
  type MountRecord,
  type MountScope,
  ownedElsewhereMessage,
  readMounts,
  writeMounts
} from "../mount-registry";
import { isJsonMode, printSuccess } from "../output";
import { mountIdFor } from "../workspace-direct-mount/mount-id";
import { assertMountableSlug } from "./workspace-mount/assert-mountable-slug";
import { detachDeadMount } from "./workspace-mount/detach-dead-mount";
import { isEngine } from "./workspace-mount/engine-name";
import { isMountLive } from "./workspace-mount/is-mount-live";
import { mountOnto } from "./workspace-mount/mount-onto";
import type { MountOutcome } from "./workspace-mount/mount-outcome";
import { printGrantedReadOnly } from "./workspace-mount/print-granted-read-only";
import { printPendingUploads } from "./workspace-mount/print-pending-uploads";
import { refuseEngineOffPlatform } from "./workspace-mount/refuse-engine-off-platform";
import { resolveAuth } from "./workspace-mount/resolve-auth";
import { mountDirect, planDirectMount, printMountFooter } from "./workspace-mount-direct";
import { mountGateway, settleGatewayMount } from "./workspace-mount-gateway";

interface RemountInput {
  readonly engine: Engine;
  readonly slug: string;
  readonly record: MountRecord;
  readonly key: string;
  readonly scope: MountScope;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly shared: boolean;
  readonly readOnly: boolean;
  /** The one global a remount carries into the mint: `--api-key` is deliberately NOT one (see below). */
  readonly globals: { readonly timeout?: Seconds };
}

/** The mint's ceiling when no `--timeout` is given — the SDK's own default, in the client's unit. */
const REMOUNT_MINT_TIMEOUT_SECONDS: Seconds = seconds(DEFAULT_REQUEST_TIMEOUT_MS / 1000);

/**
 * Mount a recorded row again, by its engine. A direct row is minted under the
 * organization and profile THE ROW recorded — they outrank whatever the shell
 * selects today, and an explicit `--api-key` is not passed on, because it would
 * outrank the profile inside `createClient` and mint under a key the hourly
 * renewal can never re-read — and re-uses its mount id, so rclone's cache
 * directory is the one the dead mount wrote into and its unsent saves drain on
 * start.
 */
async function remountRecord(input: RemountInput): Promise<MountOutcome> {
  const { slug, record } = input;
  const davPath = input.shared ? `_shared/${slug}` : slug;
  switch (input.engine) {
    case "webdav":
    case "rclone":
      settleGatewayMount(input.engine);
      return mountGateway({
        engine: input.engine,
        slug,
        davPath,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        mountPath: record.mountPath,
        readOnly: input.readOnly,
        timeoutSeconds: input.globals.timeout
      });
    case "direct": {
      const plan = planDirectMount(
        {
          profile: record.profile ?? input.scope.profile,
          orgId: record.orgId ?? input.scope.orgId,
          orgName: record.orgName ?? input.scope.orgName,
          baseUrl: record.baseUrl
        },
        record.mountId ?? mountIdFor(input.key)
      );
      const client = createClient({
        profile: plan.pins.profile,
        baseUrl: record.baseUrl,
        organizationId: plan.pins.orgId,
        timeout: input.globals.timeout ?? REMOUNT_MINT_TIMEOUT_SECONDS
      });
      return mountDirect({
        slug,
        mountPath: record.mountPath,
        readOnly: input.readOnly,
        shared: input.shared,
        workspaceId: record.workspaceId,
        mountId: plan.mountId,
        baseUrl: record.baseUrl,
        pins: plan.pins,
        awsConfig: plan.awsConfig,
        client
      });
    }
    default:
      return input.engine satisfies never;
  }
}

/**
 * The `remount` verb, registered on the `workspace` namespace
 * `registerWorkspaceCommands` owns, in the position that function gives it.
 * It replays a recorded row through the engine the row names.
 */
export function registerWorkspaceRemountCommand(ws: Command, program: Command): void {
  // ── remount ──────────────────────────────────────────────────────────────
  ws.command("remount")
    .description(
      "Mount a recorded workspace again — after a logout, a restart, or a mount that died"
    )
    .argument("<slug>", "Workspace slug (see `nexus workspace status`)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace remount support-docs

Notes:
  WHY IT EXISTS. A direct-engine drive is a detached rclone process, and a
  logout or a reboot kills it: the folder turns into an empty directory and
  "workspace status" reads Live no. This command mounts the SAME row again —
  same mount point, same copy, same organization and profile, the same mode
  ASKED FOR — with a fresh hour of access, so nothing has to be retyped.
  THE MODE IS RE-REQUESTED, NOT REPLAYED. A drive that came back read-only
  because Nexus granted less than it asked for asks for read-write again here,
  so it is read-write once the grant is restored; --read-only and a CODE kind
  stay read-only, as recorded.
  IT UPLOADS WHAT THE DEAD MOUNT HAD NOT SENT. Saves the previous mount left
  in its cache are queued again on the same cache directory; the command
  prints how many. A remount that would come back READ-ONLY while such saves
  exist is refused, because they could never upload — the refusal names the
  cache to copy them from and how to discard them.
  IT REFUSES A LIVE MOUNT. "already mounted at <path>" means there is nothing
  to do; unmount first if you want a fresh one.
  IT RESOLVES BY ACTING ORG, like "unmount": when the active org holds no row
  for the slug, the error lists the orgs that do.
  A WEBDAV OR RCLONE ROW IS REMOUNTED THE ORDINARY WAY — webdav with a fresh
  mount token, rclone with the current key. A row this platform cannot run
  (webdav off macOS, rclone on macOS) is refused, naming the engine to use.
  IT NEEDS A VALID KEY AND THE NETWORK: the drive is minted again. A direct
  row is minted under the profile it RECORDED; an --api-key on this command is
  not used for it.`
    )
    .action(async (slug: string) => {
      try {
        assertMountableSlug(slug);
        const globals = program.optsWithGlobals();
        const { apiKey, baseUrl, scope } = resolveAuth(globals);
        const mounts = readMounts();
        const found = findMount(mounts, slug, scope);
        if (!found) {
          const candidates = findMountsBySlug(mounts, slug);
          if (candidates.length > 0) {
            throw new Error(ownedElsewhereMessage(slug, candidates, scope, "recorded"));
          }
          throw new Error(
            `No mount of "${slug}" is recorded. Mount it: nexus workspace mount ${slug}`
          );
        }
        const { key, record } = found;
        if (isMountLive(record)) {
          throw new Error(`"${slug}" is already mounted at ${record.mountPath}. Nothing to do.`);
        }
        // 🔴 VALIDATED, not trusted. `mount` reaches its engine through
        // `resolveEngine`/`isEngine`; `remount` reads it off a registry row that
        // `readMounts` parses and CASTS. An unrecognised value — a row written by
        // a newer CLI, a hand edit — walked past `refuseEngineOffPlatform`'s
        // if-chain and reached the dispatch switch, whose `satisfies never` arm
        // RETURNS at runtime. `mounted.record` was then undefined, the spread
        // wrote nothing, the registry was rewritten, and the command printed
        // "Remounted" having mounted nothing — a False Green on the one verb
        // whose job is bringing a dead drive back.
        const engine = record.engine;
        if (!isEngine(engine)) {
          throw invalidInput(
            `The registry row for "${slug}" names engine "${String(engine)}", which this CLI does not have. It was probably written by a newer one.`,
            `Run: nexus workspace unmount ${slug}, then mount it again with this CLI — or upgrade: npm install -g @agent-nexus/cli@latest.`
          );
        }
        refuseEngineOffPlatform(engine, "remount");
        // 🔴 A row written before the mode was recorded says NOTHING about what
        // was asked for, and `status` prints `Mode ?` for exactly that reason.
        // `?? false` would resolve that silence to the MORE PERMISSIVE answer:
        // a drive deliberately mounted `--read-only` comes back writable, and
        // the row is then rewritten claiming `rw`, so the honest unknown is gone
        // too. Nobody is granted anything they lack — the server still grades
        // the credential — but a guardrail the caller chose disappears without
        // a word. The silence is refused instead, and the pair that can state a
        // mode is named.
        if (record.readOnly === undefined) {
          throw invalidInput(
            `The registry row for "${slug}" records no read-only mode — it was written before the CLI stored one, so remount cannot know whether you asked for a read-only drive.`,
            `Run: nexus workspace unmount ${slug}, then nexus workspace mount ${slug} (add --read-only to keep it read-only).`
          );
        }
        const requestedReadOnly = record.readOnly;
        const shared = record.shared ?? false;
        detachDeadMount(record);

        const mounted = await mountOnto(record.mountPath, () =>
          remountRecord({
            engine,
            slug,
            record,
            key,
            scope,
            baseUrl,
            apiKey,
            shared,
            readOnly: requestedReadOnly,
            globals
          })
        );
        const readOnly = requestedReadOnly || mounted.grantedReadOnly;
        // A remount mints too, so it hears the org's current name and the row
        // stops carrying whatever the name was when the drive was first mounted.
        const actingOrgName = mounted.serverOrgName ?? record.orgName;
        mounts[key] = {
          ...record,
          ...mounted.record,
          readOnly: requestedReadOnly,
          ...(actingOrgName ? { orgName: actingOrgName } : {})
        };
        writeMounts(mounts);

        if (isJsonMode()) {
          console.log(
            JSON.stringify(
              {
                remounted: true,
                slug,
                engine,
                mountPath: record.mountPath,
                readOnly,
                pid: mounted.record.pid ?? null,
                mountId: mounted.record.mountId ?? null,
                access: mounted.record.access ?? null,
                pendingUploads: mounted.pendingUploads
              },
              null,
              2
            )
          );
          return;
        }
        printSuccess(`Remounted "${slug}" at ${record.mountPath}`, {
          engine,
          mode: readOnly ? "read-only" : "read-write",
          ...(actingOrgName || record.orgId ? { org: actingOrgName ?? record.orgId } : {}),
          ...(record.profile ? { profile: record.profile } : {})
        });
        if (mounted.grantedReadOnly) printGrantedReadOnly(slug);
        printPendingUploads(mounted.pendingUploads);
        printMountFooter(engine, slug);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
