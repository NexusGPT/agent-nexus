import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import {
  findMount,
  findMountsBySlug,
  ownedElsewhereMessage,
  readMounts,
  writeMounts
} from "../../mount-registry";
import { policyFrom } from "../../workspace-direct-mount/install/install-policy";
import { assertMountableSlug } from "./assert-mountable-slug";
import { detachDeadMount } from "./detach-dead-mount";
import { isMountLive } from "./is-mount-live";
import { organizationLabel, refuseKeyOfAnotherOrganization } from "./key-refusal";
import { mountOnto } from "./mount-onto";
import { refuseEngineOffPlatform } from "./refuse-engine-off-platform";
import { remountRecord } from "./remount-record";
import { recordedReadOnly, remountableEngine } from "./remountable-row";
import { reportRemount } from "./report-remount";
import { resolveAuth } from "./resolve-auth";
import { refuseElevatedTerminal } from "./win32/refuse-elevated-terminal";

/** Everything `nexus workspace remount` reads off the command line. */
export interface WorkspaceRemountOptions {
  installDeps?: boolean;
}

/** The `nexus workspace remount` action: replay a recorded row through the engine it names. */
export async function runWorkspaceRemount(
  program: Command,
  slug: string,
  opts: WorkspaceRemountOptions
): Promise<void> {
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
      throw new Error(`No mount of "${slug}" is recorded. Mount it: nexus workspace mount ${slug}`);
    }
    const { key, record } = found;
    if (isMountLive(record)) {
      throw new Error(`"${slug}" is already mounted at ${record.mountPath}. Nothing to do.`);
    }
    const engine = remountableEngine(record, slug);
    refuseEngineOffPlatform(engine, "remount");
    refuseElevatedTerminal("remount");
    const requestedReadOnly = recordedReadOnly(record, slug);
    const shared = record.shared ?? false;
    // A gateway engine sends only the key, so the key must be this row's
    // organization's before the drive opens; a direct row minted under the
    // row's pins refuses that on its own.
    if (engine !== "direct") {
      await refuseKeyOfAnotherOrganization(
        createClient({ ...globals, organizationId: record.orgId ?? scope.orgId }),
        organizationLabel(record.orgName, scope.orgName, record.orgId, scope.orgId)
      );
    }
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
        policy: policyFrom(opts.installDeps),
        globals
      })
    );
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

    reportRemount({ slug, engine, record, mounted, requestedReadOnly, actingOrgName });
  } catch (err) {
    process.exitCode = handleError(err);
  }
}
