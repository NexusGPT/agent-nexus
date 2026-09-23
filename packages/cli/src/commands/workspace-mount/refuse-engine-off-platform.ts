import { invalidInput } from "../../errors";
import type { Engine } from "../../mount-registry";
import { PLATFORM_RULES } from "./platform-rules";

/**
 * The engines each platform can run. Asked for before any auth by `mount`, and
 * again by `remount` on the engine a row recorded — a row written on one
 * machine can be replayed on another. Both callers read `PLATFORM_RULES`.
 */
export function refuseEngineOffPlatform(
  engine: Engine,
  caller: "mount" | "remount" = "mount"
): void {
  const rule = PLATFORM_RULES[engine];
  if (rule.runsOn(process.platform)) return;
  // 🔴 `remount` takes NO `--engine` and no `--read-only`: it replays the engine
  // the registry row recorded. `mountFix` names a flag, so on `remount` it is an
  // instruction the caller cannot type, on a row they cannot otherwise move. The
  // way out is the pair that CAN change an engine.
  if (caller === "remount") {
    throw invalidInput(
      `${rule.why} This drive's row recorded it, and remount replays the recorded engine.`,
      `Run: nexus workspace unmount <slug>, then nexus workspace mount <slug> --engine <one this platform runs>.`
    );
  }
  throw invalidInput(rule.mountWhy, rule.mountFix);
}
