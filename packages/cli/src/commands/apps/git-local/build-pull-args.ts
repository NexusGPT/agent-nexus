import { credentialHelperArg } from "./credential-helper-arg";

/**
 * `git` argv for the pull. `--ff-only` on purpose: a Vibe git project cloned
 * locally is normally a mirror you build from, and a silent merge commit
 * created by a background `pull` is a worse outcome than a loud refusal that
 * tells you the branch diverged.
 */
export function buildPullArgs(credentialPath: string, directory: string): string[] {
  return ["-C", directory, "-c", credentialHelperArg(credentialPath), "pull", "--ff-only"];
}
