import path from "node:path";

import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { defaultMountPath, mountKey, readMounts } from "../../mount-registry";
import { policyFrom } from "../../workspace-direct-mount/install/install-policy";
import { refuseCodeWorkspaceOnDirect } from "../workspace-mount-direct";
import { assertMountableSlug } from "./assert-mountable-slug";
import { claimMountSite } from "./claim-mount-site";
import { performMount } from "./perform-mount";
import { planMount } from "./plan-mount";
import { requestedReadOnlyFor } from "./read-only-mode";
import { reclaimDeadRows } from "./reclaim-dead-rows";
import { resolveAuth } from "./resolve-auth";
import { resolveEngine } from "./resolve-engine";
import { resolveMountCopy } from "./resolve-mount-copy";
import { settleMount } from "./settle-mount";

/** Everything `nexus workspace mount` reads off the command line. */
export interface WorkspaceMountOptions {
  at?: string;
  readOnly?: boolean;
  shared?: boolean;
  engine?: string;
  claudeMd?: boolean;
  installDeps?: boolean;
}

/** The `nexus workspace mount` action. */
export async function runWorkspaceMount(
  program: Command,
  slug: string,
  opts: WorkspaceMountOptions
): Promise<void> {
  try {
    assertMountableSlug(slug);
    const engine = resolveEngine(opts.engine);
    const { apiKey, baseUrl, scope } = resolveAuth(program.optsWithGlobals());
    const mountPath = path.resolve(opts.at || defaultMountPath(slug, scope));

    const mounts = readMounts();
    const { existing, claim } = claimMountSite(mounts, slug, scope, mountPath);

    // Every local refusal fires here, before the one network call below.
    const key = mountKey(scope, slug);
    const plan = await planMount(engine, scope, key, policyFrom(opts.installDeps));

    const client = createClient(program.optsWithGlobals());
    const { target, useShared } = await resolveMountCopy(client, slug, !!opts.shared);

    // A read-only KIND forces a read-only MOUNT, and the direct engine refuses
    // the kind outright — `requestedReadOnlyFor` carries the whole argument.
    const storageKind = target?.kind;
    if (plan.engine === "direct" && storageKind !== undefined) {
      refuseCodeWorkspaceOnDirect(slug, storageKind);
    }
    const requestedReadOnly = requestedReadOnlyFor(opts, storageKind);

    reclaimDeadRows(mounts, existing, claim, plan, mountPath);

    const mounted = await performMount({
      plan,
      slug,
      davPath: useShared ? `_shared/${slug}` : slug,
      mountPath,
      readOnly: requestedReadOnly,
      useShared,
      workspaceId: target?.workspaceId,
      baseUrl,
      apiKey,
      timeoutSeconds: program.optsWithGlobals().timeout as number | undefined,
      client
    });
    settleMount({
      mounts,
      key,
      slug,
      engine,
      mountPath,
      useShared,
      requestedReadOnly,
      target,
      storageKind,
      scope,
      opts,
      mounted
    });
  } catch (err) {
    process.exitCode = handleError(err);
  }
}
