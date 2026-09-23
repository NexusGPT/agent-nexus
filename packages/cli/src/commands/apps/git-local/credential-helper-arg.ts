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
 *
 * Exported because both `build-clone-args.ts` and `build-pull-args.ts` need it
 * and neither owns it. It is not part of this folder's outward surface.
 */
export function credentialHelperArg(credentialPath: string): string {
  // `replace(/'/g, …)` rather than `replaceAll`, which this package's TS lib
  // target does not carry.
  const quoted = `'${credentialPath.replace(/'/g, `'\\''`)}'`;
  return `credential.helper=store --file=${quoted}`;
}
