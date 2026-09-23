/**
 * The credential shape `nexus apps git-project clone|pull` work from, and the
 * reason every other file in this folder exists.
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
 * So: write the credential to a throwaway 0600 file, point
 * `credential.helper=store --file=…` at it, clone the TOKEN-FREE URL, and
 * delete the file in a `finally`. The token is then absent from argv, absent
 * from `.git/config`, and gone from disk when the command returns.
 *
 * That split is why `compose-clone-url.ts` and `compose-credential-line.ts` are
 * separate files: one produces the URL git is ALLOWED to persist, the other the
 * secret git must never see on a command line.
 */

/** Credential fields `clone`/`pull` need — the subset of the git-credentials payload. */
export interface VibeGitCredentialParts {
  username: string;
  pushToken: string;
  /** Token-free base ending in a slash, e.g. `https://git.<tenant>.<domain>/<org>/`. */
  cloneUrlBase: string;
}
