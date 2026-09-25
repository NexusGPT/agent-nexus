import { execFileSync } from "node:child_process";
import fs from "node:fs";

import { askYesNo } from "../../util/ask";
import { promptLine, promptStream } from "../../util/confirm";
import {
  DOWNLOAD_STALL_DEFAULT_TIMEOUT_MS,
  downloadWithStallDeadline
} from "../../util/stall-deadline";
import type { DepsIo, RunOutcome } from "../../workspace-direct-mount/deps-io";
import type { RcloneBinary } from "../../workspace-direct-mount/managed-rclone";
import { macFuseApproved } from "./mac-fuse-approved";

/** The one place the seam meets the real disk, the real processes and the real terminal. */
export function realDepsIo(): DepsIo {
  return {
    platform: process.platform,
    arch: process.arch,
    env: process.env,
    stdinIsTTY: process.stdin.isTTY === true,
    // The DEFAULT `fs` import, on purpose: the driven mount specs fake
    // `node:fs` through its default export only, so a named `existsSync`
    // would read the developer's real disk under them.
    exists: (file) => fs.existsSync(file),
    rcloneVersion: (binary) => versionOf(binary),
    macFuseApproved,
    hasBrew: () => runs("brew", ["--prefix"]),
    download: downloadBytes,
    run: runInherited,
    askYesNo: (question) => askYesNo(question, promptStream()),
    promptLine
  };
}

/** `<binary> version` as text, or null when the binary could not run at all. */
function versionOf(binary: RcloneBinary): string | null {
  try {
    return execFileSync(binary, ["version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
}

/** True when the command ran and exited 0; its output is not read. */
function runs(file: string, args: readonly string[]): boolean {
  try {
    execFileSync(file, [...args], { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

/**
 * A deadline on SILENCE, not on elapsed time: rclone's zip is ~30 MB and a
 * slow line must not fail a transfer that is arriving, while a dead socket
 * must not hang the mount. `downloadWithStallDeadline` re-arms on every chunk
 * and reads the whole body itself, which is the half a bare `fetch` leaves
 * to the caller.
 */
async function downloadBytes(url: string): Promise<Uint8Array> {
  const { response, body } = await downloadWithStallDeadline(
    url,
    {},
    { timeout: DOWNLOAD_STALL_DEFAULT_TIMEOUT_MS }
  );
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return new Uint8Array(body);
}

/**
 * Run with the terminal attached for input and the PROMPT STREAM for output:
 * `sudo` asks for the password on the user's own tty either way, and `brew`'s
 * progress lands where a conversation goes — never on stdout, where a `--json`
 * document must stay the only thing printed. Only `execFileSync` and `spawn`
 * are used on the whole mount path: the driven specs' `node:child_process`
 * fakes expose nothing else, and a `spawnSync` import would throw under them.
 */
function runInherited(file: string, args: readonly string[], env: NodeJS.ProcessEnv): RunOutcome {
  try {
    execFileSync(file, [...args], { stdio: [0, promptFd(), 2], env });
    return { ok: true };
  } catch (error) {
    return classifyRunFailure(error);
  }
}

/** The file descriptor behind `promptStream()`: 1 only when stdout is the sole terminal, else 2. */
function promptFd(): 1 | 2 {
  return promptStream() === process.stdout ? 1 : 2;
}

/**
 * `execFileSync` throws one error for two different facts: the program was
 * never found (`code: "ENOENT"`, no status), or it ran and exited non-zero
 * (`status: N`). They owe the user different sentences, so they are told apart
 * here and nowhere downstream.
 */
function classifyRunFailure(error: unknown): RunOutcome {
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  if (code === "ENOENT") return { ok: false, reason: "not-found" };
  const status = error instanceof Error && "status" in error ? error.status : undefined;
  return { ok: false, reason: "exit", status: typeof status === "number" ? status : null };
}
