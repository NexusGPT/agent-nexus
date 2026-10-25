import fs from "node:fs";
import path from "node:path";

import { failure } from "../../../../errors";
import { ensureStateSubdir } from "../../../../mount-registry";
import type { DepsIo } from "../../../../workspace-direct-mount/deps-io";
import {
  elevateMsiRoad,
  WINFSP_LOG_ENV,
  WINFSP_MSI_ENV,
  WINFSP_SHA256_ENV
} from "../../../../workspace-direct-mount/install/win32/elevate-msi";
import { msiExitVerdict } from "../../../../workspace-direct-mount/install/win32/msi-exit";
import { win32InstallerEnvFor } from "../../../../workspace-direct-mount/install/win32/win32-installer-env";
import { winFspRestartMarker } from "../../../../workspace-direct-mount/install/win32/winfsp-restart-marker";
import { downloadVerified } from "../download-verified";
import { DOWNLOADS_DIR, removeDownload } from "../downloads-dir";

/** What the MSI road needs: where the installer is, what it must hash to, what to call the file. */
export interface WinFspMsiSpec {
  readonly url: string;
  readonly sha256: string;
  readonly name: string;
}

/**
 * The Windows mirror of `installFuseTPkg`: download, verify against the pin,
 * write the MSI under the CLI's own state directory with a per-process name,
 * run `msiexec` as administrator behind the UAC prompt, and remove the MSI
 * whatever happened. The road is handed the pin's sha256 too: it hashes the
 * file again through a handle it holds open until msiexec is done, so the
 * bytes this check accepted are the bytes installed (`elevate-msi.ts`). The
 * verbose log stays on disk where the refusal names it, because with `/qn`
 * there is otherwise nothing to hand an administrator; it is removed on
 * success and wherever the refusal does not name it.
 *
 * A downloads path holding a double quote is refused before anything is
 * downloaded: the script wraps the two paths in quotes for msiexec, and a
 * quote inside one would end the argument early.
 */
export async function installWinFspMsi(io: DepsIo, spec: WinFspMsiSpec): Promise<void> {
  if (DOWNLOADS_DIR.includes('"')) {
    throw failure(
      "local-failed",
      `The downloads folder ${DOWNLOADS_DIR} contains a double quote, which msiexec's command line cannot carry.`,
      "Install WinFsp yourself from https://winfsp.dev, then mount again."
    );
  }
  const bytes = await downloadVerified(io, spec.url, spec.sha256);
  ensureStateSubdir(DOWNLOADS_DIR);
  const msi = path.join(DOWNLOADS_DIR, `${String(process.pid)}-${spec.name}`);
  const log = path.join(DOWNLOADS_DIR, `${String(process.pid)}-winfsp.log`);
  try {
    fs.writeFileSync(msi, bytes);
    const road = elevateMsiRoad(io.env);
    const outcome = io.run(road.file, road.args, {
      ...win32InstallerEnvFor(io.env),
      [WINFSP_MSI_ENV]: msi,
      [WINFSP_LOG_ENV]: log,
      [WINFSP_SHA256_ENV]: spec.sha256
    });
    // Not found, or started and gone with no exit code (refused by a policy,
    // stopped): msiexec never answered, so no exit-code sentence applies.
    if (!outcome.ok && (outcome.reason === "not-found" || outcome.status === null)) {
      throw failure(
        "local-failed",
        "PowerShell could not be run, so the WinFsp installer could not be started as administrator.",
        "Install WinFsp yourself from https://winfsp.dev, then mount again."
      );
    }
    const status = outcome.ok ? 0 : outcome.status;
    // A restart pending: no mount of this boot may start rclone against the half-replaced driver.
    if (status === 3010 || status === 1641)
      fs.writeFileSync(winFspRestartMarker(), `${String(status)}\n`);
    const verdict = msiExitVerdict(status, log);
    // The log stays only where the refusal names it: elsewhere one more
    // unnamed file would pile up on every retry.
    if (verdict.ok || !verdict.hint.includes(log)) removeDownload(io, log);
    if (verdict.ok) return;
    throw failure("local-failed", verdict.message, verdict.hint);
  } finally {
    removeDownload(io, msi);
  }
}
