import type { Engine } from "../../mount-registry";

/**
 * Where each engine runs, and what to say when it does not. One row per engine:
 * `runsOn` is the platform test; `why` is the refusal `remount` shows; `mountWhy`
 * and `mountFix` are the longer pair `mount` shows, because `mount` can type a
 * flag and `remount` cannot. A new engine does not compile until it has a row.
 */
type PlatformRule = {
  readonly runsOn: (platform: NodeJS.Platform) => boolean;
  readonly why: string;
  readonly mountWhy: string;
  readonly mountFix: string;
};

export const PLATFORM_RULES = {
  webdav: {
    runsOn: (platform) => platform === "darwin",
    why: "The native WebDAV engine is macOS-only.",
    mountWhy: "The native WebDAV engine is macOS-only.",
    mountFix:
      "Drop --engine: rclone (the same gateway, over FUSE) is the default on Linux and Windows."
  },
  rclone: {
    runsOn: (platform) => platform !== "darwin",
    why: "--engine rclone is retired on macOS.",
    mountWhy:
      "--engine rclone is retired on macOS: the WebDAV default and --engine direct cover everything it did.",
    mountFix:
      'Use "--engine direct" (fast; needs macFUSE or FUSE-T) or drop --engine for the WebDAV default.'
  },
  direct: {
    runsOn: (platform) => platform !== "win32",
    why: "--engine direct is not available on Windows yet.",
    mountWhy:
      "--engine direct is not available on Windows yet: its hourly renewal hook runs through a POSIX shell.",
    mountFix: "Drop --engine: rclone (the Nexus gateway over FUSE) is the default on Windows."
  }
} satisfies Record<Engine, PlatformRule>;
