import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { defaultMountPath, mountKey, readMounts } from "../../mount-registry";
import { policyFrom } from "../../workspace-direct-mount/install/install-policy";
import { mountIdFor } from "../../workspace-direct-mount/mount-id";
import { refuseCodeWorkspaceOnDirect } from "../../workspace-direct-mount/refuse-code-workspace-on-direct";
import { assertMountableSlug } from "./assert-mountable-slug";
import { claimMountSite } from "./claim-mount-site";
import { organizationLabel } from "./key-refusal";
import { performMount } from "./perform-mount";
import { planMount, retireDeadRow } from "./plan-mount";
import { requestedReadOnlyFor } from "./read-only-mode";
import { reclaimStaleRows } from "./reclaim-dead-rows";
import { resolveAuth } from "./resolve-auth";
import { resolveEngine } from "./resolve-engine";
import { resolveMountCopy } from "./resolve-mount-copy";
import { resolveMountPath } from "./resolve-mount-path";
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
    const requested = resolveEngine(opts.engine);
    const { apiKey, baseUrl, scope } = resolveAuth(program.optsWithGlobals());
    const mountPath = resolveMountPath(opts.at, defaultMountPath(slug, scope));

    const mounts = readMounts();
    const { existing, claim } = claimMountSite(mounts, slug, scope, mountPath);
    reclaimStaleRows(mounts, claim, mountPath);

    const client = createClient(program.optsWithGlobals());
    const { target, useShared } = await resolveMountCopy(
      client,
      slug,
      !!opts.shared,
      organizationLabel(scope.orgName, scope.orgId)
    );

    // A read-only KIND forces a read-only MOUNT, and the direct engine refuses
    // the kind outright — `requestedReadOnlyFor` carries the whole argument.
    const storageKind = target?.kind;
    // A CODE workspace the list already named is refused before any install is
    // offered for an engine that will not mount it. `auto` never plans direct
    // for one: it falls back.
    if (requested === "direct" && storageKind !== undefined) {
      refuseCodeWorkspaceOnDirect(slug, storageKind);
    }
    // The engines' local refusals, before the one mint. `auto` falls back to
    // the gateway instead of most of them — which is why it plans only after
    // the list answered.
    const key = mountKey(scope, slug);
    const plan = await planMount(requested, {
      scope,
      mountId: mountIdFor(key),
      policy: policyFrom(opts.installDeps),
      listAnswered: target !== null,
      storageKind,
      deadRow: existing?.record,
      shared: useShared
    });
    const requestedReadOnly = requestedReadOnlyFor(opts, storageKind);

    // This scope's own dead row: its unsent saves refuse a plan that would not upload them.
    if (existing) retireDeadRow(mounts, existing, plan, useShared);

    const mounted = await performMount({
      plan,
      slug,
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
      engine: plan.engine,
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
