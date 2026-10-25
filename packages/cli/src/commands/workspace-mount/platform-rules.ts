import type { Engine } from "../../mount-registry";
import type { MountPlatform } from "../../workspace-direct-mount/mount-platform";

/**
 * Where each engine runs, and what to say when it does not. One row per engine:
 * `runsOn` is the platform test; `why` is the refusal `remount` shows; `mountWhy`
 * and `mountFix` are the longer pair `mount` shows, because `mount` can type a
 * flag and `remount` cannot. An engine that runs on every platform is
 * `runsOn: "everywhere"` and carries no refusal texts, since none can show. A
 * new engine does not compile until it has a row.
 */
type PlatformRule =
  | { readonly runsOn: "everywhere" }
  | {
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
    mountFix: "Use --engine rclone (the same gateway, over FUSE), or drop --engine."
  },
  rclone: {
    runsOn: (platform) => platform !== "darwin",
    why: "--engine rclone is retired on macOS.",
    mountWhy:
      "--engine rclone is retired on macOS: --engine direct (the default) and --engine webdav cover everything it did.",
    mountFix:
      'Drop --engine for direct (fast; needs macFUSE or FUSE-T), or use "--engine webdav", which needs nothing installed.'
  },
  direct: { runsOn: "everywhere" }
} satisfies Record<Engine, PlatformRule>;

/**
 * The engines each platform can run — the `runsOn` rows above, at the type
 * level, so a table below cannot name an engine its platform refuses. A
 * platform added to `MountPlatform` without a row here fails where the tables
 * are indexed by it.
 */
type EngineOn = {
  readonly darwin: Extract<Engine, "direct" | "webdav">;
  readonly linux: Extract<Engine, "direct" | "rclone">;
  readonly win32: Extract<Engine, "direct" | "rclone">;
};

/**
 * `auto` mounts direct on every platform; this is where it falls back when
 * direct cannot run: the gateway engine each
 * platform has. macOS's needs nothing installed; the others need the same
 * rclone and FUSE layer direct does.
 */
export const GATEWAY_FALLBACK_FOR = {
  darwin: "webdav",
  linux: "rclone",
  win32: "rclone"
} as const satisfies { readonly [P in MountPlatform]: Exclude<EngineOn[P], "direct"> };
