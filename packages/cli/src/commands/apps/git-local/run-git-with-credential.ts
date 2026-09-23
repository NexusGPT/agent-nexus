import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeSecretFile } from "../../../util/secret-file";
import { composeCredentialLine } from "./compose-credential-line";
import type { VibeGitCredentialParts } from "./credential-parts";
import { GitCommandFailedError } from "./git-errors";

/**
 * Run one `git` invocation with a scoped credential file that exists only for
 * the duration of the call.
 *
 * stdout is discarded and stderr inherited: git reports progress on stderr, so
 * the user still sees it, and `--json` mode's stdout stays a single parseable
 * document (the house rule in `apps.ts`).
 *
 * The `finally` is the whole point — see `credential-parts.ts` for why the
 * token must not survive the call.
 */
export function runGitWithCredential(
  credentials: VibeGitCredentialParts,
  operation: string,
  buildArgs: (credentialPath: string) => string[]
): void {
  const credentialLine = composeCredentialLine(credentials);
  if (credentialLine === null) {
    throw new Error(
      `The git host address returned for your org is not a valid https URL ("${credentials.cloneUrlBase}"). Run "nexus apps git-credentials" to inspect it.`
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
