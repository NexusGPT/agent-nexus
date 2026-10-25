/**
 * The FUSE libraries rclone can load on macOS, in the order its loader tries
 * them. The order is rclone's, not ours: cgofuse (`host_cgo.go`, the loader
 * rclone is built on) tries exactly these paths and stops at the first that
 * opens. A library anywhere else is invisible to rclone too, so "missing" is
 * the right verdict for it — unless the user points the loader at it with the
 * environment variable, which is the one escape hatch and must be honoured.
 */
export const CGOFUSE_LIBFUSE_PATH_ENV = "CGOFUSE_LIBFUSE_PATH";

/** macFUSE 4 and newer: the library rclone loads first. */
export const MACFUSE_LIBRARY = "/usr/local/lib/libfuse.2.dylib";
/** macFUSE before 4 (then called osxfuse): still on rclone's list, so still on ours. */
export const LEGACY_MACFUSE_LIBRARY = "/usr/local/lib/libosxfuse.2.dylib";
/** FUSE-T: the library rclone falls back to, and the one this CLI installs. */
export const FUSE_T_LIBRARY = "/usr/local/lib/libfuse-t.dylib";

/**
 * Exits 0 when macFUSE's kernel extension is approved; needs no privilege.
 * Ships with macFUSE 4 only: on a pre-4 install the file is absent, the probe
 * reads "unknown", and the mount proceeds so rclone can report the real state.
 */
export const MACFUSE_LOADER = "/Library/Filesystems/macfuse.fs/Contents/Resources/load_macfuse";

/**
 * One path the loader will try, tagged with what a present file means: a
 * `macfuse` library needs its kernel extension approved before it can load;
 * a `fuse-t` library needs nothing; a `custom` library is the user's own
 * choice and not ours to judge.
 */
export type FuseLibraryCandidate =
  | { readonly kind: "custom"; readonly path: string }
  | { readonly kind: "macfuse"; readonly path: string }
  | { readonly kind: "fuse-t"; readonly path: string };

/** rclone's loader order, verbatim; the env override first, only when set and non-empty. */
export function fuseLibraryCandidates(env: NodeJS.ProcessEnv): readonly FuseLibraryCandidate[] {
  const custom = env[CGOFUSE_LIBFUSE_PATH_ENV];
  const fixed: readonly FuseLibraryCandidate[] = [
    { kind: "macfuse", path: MACFUSE_LIBRARY },
    { kind: "macfuse", path: LEGACY_MACFUSE_LIBRARY },
    { kind: "fuse-t", path: FUSE_T_LIBRARY }
  ];
  if (custom === undefined || custom === "") return fixed;
  return [{ kind: "custom", path: custom }, ...fixed];
}
