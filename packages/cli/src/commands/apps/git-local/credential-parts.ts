/**
 * The credential shape `nexus apps git-project clone|pull` work from, and the
 * reason every other file in this folder exists.
 *
 * ## Which credential
 *
 * The PER-PROJECT one, from `GET /api/vibe/git-projects/:id/credentials`: a
 * machine user that is a `write` collaborator on that one repository and
 * nothing else. The org-wide token (`GET /api/vibe/git-credentials`, the
 * platform admin's) pushes to every repository in the tenant and is served to
 * nobody — the route answers 410 Gone — so nothing in this CLI asks for it.
 *
 * ## Why the token never reaches argv, `.git/config` or a credential store
 *
 * The obvious implementation — `git clone https://user:token@host/org/repo.git`
 * — puts the token in the process's argv, where any other user on the machine
 * can read it out of `ps`, and then writes it verbatim into the clone's
 * `.git/config` as the `origin` URL, where it outlives the command.
 *
 * So: write the credential to a throwaway 0600 file, make
 * `credential.helper=store --file=…` the ONLY helper git consults
 * (`credential-helper-args.ts` carries why the reset matters), clone the
 * TOKEN-FREE URL, and delete the file in a `finally`. The token is then absent
 * from argv, from `.git/config`, from every helper the user has configured —
 * the macOS keychain included — and from disk when the command returns.
 */

/** Credential fields `clone`/`pull` need — the subset of the per-project payload. */
export interface VibeGitCredentialParts {
  username: string;
  pushToken: string;
  /** Token-free remote for the one repository, e.g. `https://git.<tenant>.<domain>/<org>/<name>.git`. */
  cloneUrl: string;
}
