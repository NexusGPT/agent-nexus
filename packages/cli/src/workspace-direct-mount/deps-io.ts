import type { RcloneBinary } from "./managed-rclone";

/**
 * What running an install command came to. `not-found` is the program itself
 * missing (`unzip` on a stripped image, `brew` gone since it was probed):
 * a different sentence from a program that ran and failed, so the two are
 * kept apart here instead of being read back out of an exit code.
 */
export type RunOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "not-found" }
  | { readonly ok: false; readonly reason: "exit"; readonly status: number | null };

/**
 * Every way the preflight and the installers touch the world outside this
 * process, as one injectable bag — the `UpgradeEnvironment` shape from
 * `commands/upgrade.ts`. Production hands in the real disk, the real processes
 * and the real terminal; a spec hands in canned answers and drives the whole
 * probe → plan → ask → install → re-probe path with no network, no PATH, no
 * TTY and nothing written outside a temp directory.
 *
 * A member is here because a spec cannot re-enter it — a download, `sudo`, a
 * keystroke — and for no other reason. Plain filesystem work on the stage
 * directory is not on the seam: a spec gives it a temp HOME and lets it run.
 */
export interface DepsIo {
  /** The two facts the plan needs about this machine. */
  readonly platform: NodeJS.Platform;
  readonly arch: NodeJS.Architecture;
  /** The environment the CLI itself received; read for `CGOFUSE_LIBFUSE_PATH` and stripped for children. */
  readonly env: NodeJS.ProcessEnv;
  /** Whether a person can type an answer: `process.stdin.isTTY`, decided on STDIN, never stdout. */
  readonly stdinIsTTY: boolean;

  /** `fs.existsSync`: the managed rclone, the FUSE libraries. */
  exists(file: string): boolean;
  /** `<binary> version`, or null when it could not run at all. */
  rcloneVersion(binary: RcloneBinary): string | null;
  /** `load_macfuse` exits 0 → true; ran and failed → false; could not run → "unknown". */
  macFuseApproved(): boolean | "unknown";
  /** Whether `brew` answers; asked only when a FUSE-T step is being planned. */
  hasBrew(): boolean;

  /**
   * The bytes at a URL, whole, in memory; throws on a non-2xx, a transport
   * failure, or a connection that goes silent. Named `download`, not `fetch`:
   * the package's raw-fetch gate walks every `fetch`-shaped call, and a
   * download is bounded by silence, not by elapsed time.
   */
  download(url: string): Promise<Uint8Array>;
  /**
   * Run a command to completion with the terminal attached, so `sudo` prompts
   * the person directly and `brew` prints its own progress. `env` is the
   * allow-listed installer environment, never the CLI's own.
   */
  run(file: string, args: readonly string[], env: NodeJS.ProcessEnv): RunOutcome;

  /** One `[y/N]` question on the prompt stream; true only for a literal `y`. */
  askYesNo(question: string): Promise<boolean>;
  /** One line of the conversation, on the prompt stream — never stdout, so `--json` stays one document. */
  promptLine(text: string): void;
}
