import { invalidInput } from "../../errors";
import { type Engine, ENGINES } from "../../mount-registry";
import { isEngine } from "./engine-name";
import { refuseEngineOffPlatform } from "./refuse-engine-off-platform";
import { refuseElevatedTerminal } from "./win32/refuse-elevated-terminal";

const ENGINE_VALUES = ["auto", ...ENGINES] as const;

/** The engine asked for; `auto` is settled by `planAutoMount`, and an engine off its platform is refused here. */
export function resolveEngine(requested: string | undefined): Engine | "auto" {
  const value = requested ?? "auto";
  if (value !== "auto" && !isEngine(value)) {
    throw invalidInput(
      `Unknown --engine "${value}".`,
      `Use one of: ${ENGINE_VALUES.map((engine) => `"${engine}"`).join(", ")}.`
    );
  }
  if (value !== "auto") refuseEngineOffPlatform(value);
  refuseElevatedTerminal();
  return value;
}
