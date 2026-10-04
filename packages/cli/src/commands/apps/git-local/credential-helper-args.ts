/**
 * The `-c` pairs that make a scoped 0600 credential file the ONLY credential
 * helper one `git` invocation consults:
 *
 *   -c credential.helper=   -c credential.helper=store --file='<path>'
 *
 * ## Why the empty helper comes first
 *
 * `credential.helper` is a multi-valued list, and a `-c` entry is APPENDED to
 * the helpers git already has from system, global and repository config. After
 * a successful authentication git hands the credential to EVERY helper in the
 * list to `store`. Homebrew's and Apple's git both ship
 * `credential.helper=osxkeychain` in their system config, so without the reset
 * the token passed through the temporary file and was ALSO written to the macOS
 * login keychain, where it outlived the command.
 *
 * An empty value resets the list. Because `-c` is read after every config file
 * and after `GIT_CONFIG_COUNT`, the reset clears a plain, a host-scoped, a
 * path-scoped and a repository-local helper alike, leaving only the store file
 * below — which is deleted when the command returns.
 *
 * ## Why the path is quoted
 *
 * Git runs a helper value containing whitespace THROUGH A SHELL, so an unquoted
 * path splits on its spaces and the store helper is handed a truncated filename:
 * it finds no credential, and the clone fails to authenticate with no hint that
 * a path was the cause. The file lives under `os.tmpdir()`, which on Windows is
 * routinely `C:\Users\First Last\AppData\Local\Temp`. POSIX single-quoting,
 * because the shell git reaches for is `sh` on every platform it supports.
 *
 * Shared by `build-clone-args.ts` and `build-pull-args.ts`; not part of this
 * folder's outward surface.
 */
export function credentialHelperArgs(credentialPath: string): string[] {
  // `replace(/'/g, …)` rather than `replaceAll`, which this package's TS lib
  // target does not carry.
  const quoted = `'${credentialPath.replace(/'/g, `'\\''`)}'`;
  return ["-c", "credential.helper=", "-c", `credential.helper=store --file=${quoted}`];
}
