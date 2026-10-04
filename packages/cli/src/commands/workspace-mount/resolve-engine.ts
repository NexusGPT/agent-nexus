import { invalidInput } from "../../errors";
import { type Engine, ENGINES } from "../../mount-registry";
import { isEngine } from "./engine-name";
import { refuseEngineOffPlatform } from "./refuse-engine-off-platform";

const ENGINE_VALUES = ["auto", ...ENGINES] as const;

/** `auto` is the engine that needs nothing installed where one exists, else the gateway over FUSE. */
export function defaultEngine(): Engine {
  return process.platform === "darwin" ? "webdav" : "rclone";
}

export function resolveEngine(requested: string | undefined): Engine {
  const value = requested ?? "auto";
  if (value !== "auto" && !isEngine(value)) {
    throw invalidInput(
      `Unknown --engine "${value}".`,
      `Use one of: ${ENGINE_VALUES.map((engine) => `"${engine}"`).join(", ")}.`
    );
  }
  const engine = value === "auto" ? defaultEngine() : value;
  refuseEngineOffPlatform(engine);
  return engine;
}
