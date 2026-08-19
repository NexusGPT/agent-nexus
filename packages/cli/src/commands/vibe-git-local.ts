/**
 * Local git plumbing for `nexus vibe git-project clone|pull` — the only two
 * Vibe commands that drive a `git` subprocess on the user's own machine.
 *
 * Split out of `vibe.ts` (already ~3k lines) for the same reason `vibe-watch.ts`
 * is: the interesting logic here is pure and worth testing on its own, and the
 * IO is a thin shell around it.
 *
 * ## Why the token never reaches argv
 *
 * `git-credentials` hands back a live push token. The obvious implementation —
 * `git clone https://user:token@host/org/repo.git` — puts that token in the
 * process's argv, where any other user on the machine can read it out of `ps`,
 * and then writes it verbatim into the clone's `.git/config` as the `origin`
 * URL, where it outlives the command entirely and travels with any copy of the
 * directory.
 *
 * So we do what the backend already does for the Ch26 CODE-workspace checkout
 * (`SyncSandboxWriter.cloneShallow`): write the credential to a throwaway
 * 0600 file, point `credential.helper=store --file=…` at it, clone the
 * TOKEN-FREE URL, and delete the file in a `finally`. The token is then absent
 * from argv, absent from `.git/config`, and gone from disk when the command
 * returns.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeSecretFile } from "../util/secret-file";

/** Credential fields `clone`/`pull` need — the subset of the git-credentials payload. */
export interface VibeGitCredentialParts {
  username: string;
  pushToken: string;
  /** Token-free base ending in a slash, e.g. `https://git.<tenant>.<domain>/<org>/`. */
  cloneUrlBase: string;
}

/**
 * Token-free clone URL for a project: `<cloneUrlBase><name>.git`.
 *
 * `cloneUrlBase` is documented as ending in `/<org>/`, but a base that lost its
 * trailing slash would silently produce `…/orgmy-lib.git`, so normalise rather
 * than trust it.
 */
export function composeCloneUrl(cloneUrlBase: string, projectName: string): string {
  const base = cloneUrlBase.endsWith("/") ? cloneUrlBase : `${cloneUrlBase}/`;
  return `${base}${projectName}.git`;
}

/**
 * One line in git-credential-store format, scoped to the host so the helper
 * never offers this token to any other origin.
 *
 * Returns `null` when `cloneUrlBase` is not a parseable https URL — the caller
 * must surface that rather than clone unauthenticated and fail confusingly.
 */
export function composeCredentialLine(credentials: VibeGitCredentialParts): string | null {
  let host: string;
  try {
    host = new URL(credentials.cloneUrlBase).host;
  } catch {
    return null;
  }
  if (!host) return null;
  const user = encodeURIComponent(credentials.username);
  const token = encodeURIComponent(credentials.pushToken);
  return `https://${user}:${token}@${host}\n`;
}

/**
 * Directory the clone lands in: the caller's choice, else the project name.
 * Never absolutised — git resolves it against the cwd, same as `git clone`.
 */
export function resolveCloneDirectory(explicit: string | undefined, projectName: string): string {
  const trimmed = explicit?.trim();
  return trimmed ? trimmed : projectName;
}

/**
 * `credential.helper=store --file=<path>`, with the path quoted.
 *
 * Git runs a helper value containing whitespace THROUGH A SHELL, so an
 * unquoted path splits on its spaces and the store helper is handed a truncated
 * filename: it finds no credential, and the clone fails to authenticate with no
 * hint that a path was the cause. The file lives under `os.tmpdir()`, which on
 * Windows is routinely `C:\Users\First Last\AppData\Local\Temp` — so this is
 * the ordinary case there, not an exotic one.
 *
 * POSIX single-quoting, because the shell git reaches for is `sh` on every
 * platform it supports, Git for Windows included.
 */
function credentialHelperArg(credentialPath: string): string {
  // `replace(/'/g, …)` rather than `replaceAll`, which this package's TS lib
  // target does not carry.
  const quoted = `'${credentialPath.replace(/'/g, `'\\''`)}'`;
  return `credential.helper=store --file=${quoted}`;
}

/** `git` argv for the clone. `credentialPath` is self-generated, never user input. */
export function buildCloneArgs(
  credentialPath: string,
  cloneUrl: string,
  directory: string,
  branch: string | undefined
): string[] {
  const args = ["-c", credentialHelperArg(credentialPath), "clone"];
  if (branch) args.push("--branch", branch);
  args.push("--", cloneUrl, directory);
  return args;
}

/**
 * `git` argv for the pull. `--ff-only` on purpose: a Vibe git project cloned
 * locally is normally a mirror you build from, and a silent merge commit
 * created by a background `pull` is a worse outcome than a loud refusal that
 * tells you the branch diverged.
 */
export function buildPullArgs(credentialPath: string, directory: string): string[] {
  return ["-C", directory, "-c", credentialHelperArg(credentialPath), "pull", "--ff-only"];
}

/** Thrown when the local `git` binary is missing — actionable, not a stack trace. */
export class GitNotAvailableError extends Error {
  constructor() {
    super("git is not installed (or not on PATH). Install git, then re-run this command.");
    this.name = "GitNotAvailableError";
  }
}

/** Thrown when a `git` subprocess exits non-zero. Git's own stderr already reached the user. */
export class GitCommandFailedError extends Error {
  constructor(public readonly operation: string) {
    super(`git ${operation} failed — see the git output above.`);
    this.name = "GitCommandFailedError";
  }
}

/** Thrown when `pull` is pointed at something that is not a git working tree. */
export class NotAGitRepositoryError extends Error {
  constructor(public readonly directory: string) {
    super(
      `"${directory}" is not a git repository. Clone it first: nexus vibe git-project clone <projectId> ${directory}`
    );
    this.name = "NotAGitRepositoryError";
  }
}

export function assertGitAvailable(): void {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
  } catch {
    throw new GitNotAvailableError();
  }
}

export function assertGitRepository(directory: string): void {
  try {
    execFileSync("git", ["-C", directory, "rev-parse", "--git-dir"], { stdio: "ignore" });
  } catch {
    throw new NotAGitRepositoryError(directory);
  }
}

/**
 * Run one `git` invocation with a scoped credential file that exists only for
 * the duration of the call.
 *
 * stdout is discarded and stderr inherited: git reports progress on stderr, so
 * the user still sees it, and `--json` mode's stdout stays a single parseable
 * document (the house rule in `vibe.ts`).
 */
export function runGitWithCredential(
  credentials: VibeGitCredentialParts,
  operation: string,
  buildArgs: (credentialPath: string) => string[]
): void {
  const credentialLine = composeCredentialLine(credentials);
  if (credentialLine === null) {
    throw new Error(
      `The git host address returned for your org is not a valid https URL ("${credentials.cloneUrlBase}"). Run "nexus vibe git-credentials" to inspect it.`
    );
  }

  const scratchDir = mkdtempSync(join(tmpdir(), "nexus-vibe-git-"));
  const credentialPath = join(scratchDir, "credentials");
  try {
    writeSecretFile(credentialPath, credentialLine);
    try {
      execFileSync("git", buildArgs(credentialPath), { stdio: ["ignore", "ignore", "inherit"] });
    } catch {
      throw new GitCommandFailedError(operation);
    }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}
