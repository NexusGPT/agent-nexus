import fs from "node:fs";
import path from "node:path";

import { failure } from "../../../errors";
import { ensureStateSubdir, STATE_DIR } from "../../../mount-registry";
import type { DepsIo, RunOutcome } from "../../../workspace-direct-mount/deps-io";
import type { PasswordPrompt } from "../../../workspace-direct-mount/install/install-plan";
import { installerEnvFor } from "../../../workspace-direct-mount/install/installer-env";
import { downloadVerified } from "./download-verified";

/** Where a downloaded installer waits for `installer` to read it; removed as soon as it returns. */
const DOWNLOADS_DIR = path.join(STATE_DIR, "downloads");

/**
 * What the macOS password window says. Without it macOS names the program that
 * asks — "osascript wants to make changes" — which tells a person nothing.
 * A constant with no quotes in it, so it is safe inside the AppleScript string.
 *
 * debt: the window's TITLE still reads "osascript" — macOS takes it from the
 *       asking program's own identity (a link named "Nexus CLI" was tried
 *       live, 2026-09-25, and changed nothing). Ask from a signed Nexus
 *       helper app if the CLI ever ships one.
 */
export const DIALOG_PROMPT =
  "Nexus CLI wants to install FUSE-T (a file-system library) so your workspace can mount.";

const SUDO_HINT =
  "sudo exits 1 for a declined password or when no terminal is attached. Run the command yourself " +
  "to see its own output, then mount again.";

/**
 * The brew road: one command, and brew does the download, the hash check
 * against the cask's own sha256 and the `sudo` itself, on the user's terminal.
 * Chosen when brew exists so that `brew upgrade` and `brew uninstall` keep
 * knowing about FUSE-T afterwards.
 */
export function installFuseTCask(io: DepsIo, cask: string): void {
  const outcome = io.run("brew", ["install", cask], installerEnvFor(io.env));
  refuseUnless(outcome, `brew install ${cask}`, "brew", SUDO_HINT);
}

/** What the pkg road needs: where the installer is, what it must hash to, what to call the file. */
export interface FuseTPkgSpec {
  readonly url: string;
  readonly sha256: string;
  readonly name: string;
  readonly password: PasswordPrompt;
}

/** The road for each place the password is asked. A new prompt kind must add its road here. */
const INSTALLER_FOR = {
  terminal: sudoInstaller,
  dialog: dialogInstaller
} as const satisfies Record<PasswordPrompt, (pkg: string) => Road>;

/**
 * The pkg road, for a Mac without brew or without a terminal: download,
 * verify against the pin, write the installer under the CLI's own state
 * directory with a per-process name, run Apple's `installer` as administrator
 * — `sudo` at a terminal, the macOS password window without one — and
 * remove the file whatever happened — a write that fails half
 * way included. The per-process name keeps two mounts installing at once from
 * truncating each other's pkg under a pending password prompt, and it goes
 * BEFORE the name: Apple's `installer` refuses any path not ending in `.pkg`.
 */
export async function installFuseTPkg(io: DepsIo, spec: FuseTPkgSpec): Promise<void> {
  const bytes = await downloadVerified(io, spec.url, spec.sha256);
  ensureStateSubdir(DOWNLOADS_DIR);
  const pkg = path.join(DOWNLOADS_DIR, `${process.pid}-${spec.name}`);
  try {
    fs.writeFileSync(pkg, bytes);
    const road = INSTALLER_FOR[spec.password](pkg);
    const outcome = io.run(road.file, road.args, installerEnvFor(io.env));
    refuseUnless(
      outcome,
      `${road.file} … installer -pkg ${spec.name} -target /`,
      road.file,
      road.hint
    );
  } finally {
    fs.rmSync(pkg, { force: true });
  }
}

interface Road {
  readonly file: string;
  readonly args: readonly string[];
  readonly hint: string;
}

function sudoInstaller(pkg: string): Road {
  return {
    file: "sudo",
    args: ["installer", "-pkg", pkg, "-target", "/"],
    hint: SUDO_HINT
  };
}

/**
 * No terminal: macOS asks for the password in its own window, so an agent can
 * run the install and the password never passes through it. The pkg path is
 * an ARGUMENT, quoted by AppleScript's `quoted form of`, never spliced into
 * the script text — a home directory with a space or a quote stays one path.
 */
function dialogInstaller(pkg: string): Road {
  return {
    file: "osascript",
    args: [
      "-e",
      "on run argv",
      "-e",
      'do shell script "/usr/sbin/installer -pkg " & quoted form of (item 1 of argv) & " -target /" ' +
        `with prompt "${DIALOG_PROMPT}" with administrator privileges`,
      "-e",
      "end run",
      pkg
    ],
    hint:
      "osascript exits 1 when the password window is cancelled. Mount again to be asked " +
      "again, or run it at a terminal to use sudo."
  };
}
/** Turn a failed run into the CLI's own refusal, with a different sentence for "not there" and "ran and failed". */
function refuseUnless(outcome: RunOutcome, command: string, program: string, hint: string): void {
  if (outcome.ok) return;
  if (outcome.reason === "not-found") {
    throw failure(
      "local-failed",
      `${program} is not installed, so \`${command}\` could not run.`,
      "Install it, or install FUSE-T yourself from https://www.fuse-t.org, then mount again."
    );
  }
  throw failure(
    "local-failed",
    `\`${command}\` exited ${outcome.status ?? "abnormally"}; FUSE-T is not installed.`,
    hint
  );
}
