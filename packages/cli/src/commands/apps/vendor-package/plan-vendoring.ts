/**
 * Every DECISION `nexus apps vendor-package` makes, composed from the three
 * planners beside it, as pure functions over file contents.
 *
 * Split from the command because the three rewrites — manifest, lockfile,
 * Dockerfile — have to agree with each other and with the vendored tarball's
 * filename, and the only way to prove they do is to run them over a fixture and
 * read the result. Nothing here touches a disk or a network, so a test needs
 * neither.
 */

import { rewriteManifestToVendoredTarball } from "@nexus/vibe-app-vendoring";

import { planDockerfile } from "./plan-dockerfile";
import { planLockfile } from "./plan-lockfile";
import { supersededVendorEntries } from "./superseded-vendor-entries";
import type { AppFiles, VendorPlanOutcome, VendorWrite } from "./vendor-plan";

/**
 * Decides every file change vendoring `packageName@version` into an app
 * requires, from the app's current contents alone.
 */
export function planVendoring(input: {
  files: AppFiles;
  packageName: string;
  version: string;
  integrity: string;
}): VendorPlanOutcome {
  const { files, packageName, version, integrity } = input;
  const writes: VendorWrite[] = [];
  const warnings: string[] = [];

  const manifest = rewriteManifestToVendoredTarball(files.packageJson, packageName, version, {
    addWhenAbsent: true
  });
  if (!manifest.ok) return { ok: false, reason: manifest.reason };
  writes.push({ path: "package.json", content: manifest.content });

  const lock = planLockfile({ files, packageName, version, integrity });
  if (!lock.ok) return lock;
  writes.push(...lock.writes);
  warnings.push(...lock.warnings);

  const docker = planDockerfile(files.dockerfile);
  writes.push(...docker.writes);
  warnings.push(...docker.warnings);

  return {
    ok: true,
    plan: {
      writes,
      removals: supersededVendorEntries(files.vendorEntries, packageName, version),
      warnings,
      nextCommand: lock.nextCommand
    }
  };
}
