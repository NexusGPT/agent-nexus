/** The macFUSE library rclone loads first, and the FUSE-T one it falls back to. */
export const MACFUSE_LIBRARY = "/usr/local/lib/libfuse.2.dylib";
export const FUSE_T_LIBRARY = "/usr/local/lib/libfuse-t.dylib";

/** Exits 0 when macFUSE's kernel extension is approved; needs no privilege. */
export const MACFUSE_LOADER = "/Library/Filesystems/macfuse.fs/Contents/Resources/load_macfuse";
