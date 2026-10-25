import { describe, expect, it } from "vitest";

import {
  CGOFUSE_LIBFUSE_PATH_ENV,
  FUSE_T_LIBRARY,
  fuseLibraryCandidates,
  LEGACY_MACFUSE_LIBRARY,
  MACFUSE_LIBRARY
} from "./fuse-libraries";

// cgofuse host_cgo.go, read 2026-09-23: the env override, then libfuse.2,
// then libosxfuse.2, then libfuse-t. Nothing else, and the order is fixed.
const CGOFUSE_ORDER = [
  "/usr/local/lib/libfuse.2.dylib",
  "/usr/local/lib/libosxfuse.2.dylib",
  "/usr/local/lib/libfuse-t.dylib"
];

describe("fuseLibraryCandidates — rclone's loader order, not ours", () => {
  it("walks the three fixed paths in cgofuse's order, each tagged with what a hit means", () => {
    const candidates = fuseLibraryCandidates({});
    expect(candidates.map((c) => c.path)).toEqual(CGOFUSE_ORDER);
    expect(candidates.map((c) => c.kind)).toEqual(["macfuse", "macfuse", "fuse-t"]);
    expect(MACFUSE_LIBRARY).toBe(CGOFUSE_ORDER[0]);
    expect(LEGACY_MACFUSE_LIBRARY).toBe(CGOFUSE_ORDER[1]);
    expect(FUSE_T_LIBRARY).toBe(CGOFUSE_ORDER[2]);
  });

  it("puts the user's CGOFUSE_LIBFUSE_PATH first, as the loader does, and only when set and non-empty", () => {
    const custom = "/opt/local/lib/libfuse.2.dylib";
    expect(fuseLibraryCandidates({ [CGOFUSE_LIBFUSE_PATH_ENV]: custom })[0]).toEqual({
      kind: "custom",
      path: custom
    });
    expect(
      fuseLibraryCandidates({ [CGOFUSE_LIBFUSE_PATH_ENV]: custom })
        .map((c) => c.path)
        .slice(1)
    ).toEqual(CGOFUSE_ORDER);
    expect(fuseLibraryCandidates({ [CGOFUSE_LIBFUSE_PATH_ENV]: "" }).map((c) => c.path)).toEqual(
      CGOFUSE_ORDER
    );
  });

  it("returns a fresh list each call, so a caller cannot reorder the loader for the next one", () => {
    const first = fuseLibraryCandidates({});
    const second = fuseLibraryCandidates({});
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});
