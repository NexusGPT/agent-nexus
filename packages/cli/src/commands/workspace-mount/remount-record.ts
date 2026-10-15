import { DEFAULT_REQUEST_TIMEOUT_MS } from "@agent-nexus/sdk";

import { createClient, type Seconds, seconds } from "../../client";
import type { Engine, MountRecord, MountScope } from "../../mount-registry";
import type { InstallPolicy } from "../../workspace-direct-mount/install/install-policy";
import { mountIdFor } from "../../workspace-direct-mount/mount-id";
import { mountDirect } from "../workspace-mount-direct";
import { mountGateway, settleGatewayMount } from "../workspace-mount-gateway";
import type { MountOutcome } from "./mount-outcome";
import { planDirectMount } from "./plan-direct-mount";

/** Everything replaying one recorded row through its own engine needs. */
export interface RemountInput {
  readonly engine: Engine;
  readonly slug: string;
  readonly record: MountRecord;
  readonly key: string;
  readonly scope: MountScope;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly shared: boolean;
  readonly readOnly: boolean;
  readonly policy: InstallPolicy;
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
export async function remountRecord(input: RemountInput): Promise<MountOutcome> {
  const { slug, record } = input;
  const davPath = input.shared ? `_shared/${slug}` : slug;
  switch (input.engine) {
    case "webdav":
    case "rclone":
      return mountGateway({
        settled: await settleGatewayMount(input.engine, input.policy),
        slug,
        davPath,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        mountPath: record.mountPath,
        readOnly: input.readOnly,
        timeoutSeconds: input.globals.timeout
      });
    case "direct": {
      const plan = await planDirectMount(
        {
          profile: record.profile ?? input.scope.profile,
          orgId: record.orgId ?? input.scope.orgId,
          orgName: record.orgName ?? input.scope.orgName,
          baseUrl: record.baseUrl
        },
        record.mountId ?? mountIdFor(input.key),
        input.policy
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
        binary: plan.binary,
        client
      });
    }
    default:
      return input.engine satisfies never;
  }
}
