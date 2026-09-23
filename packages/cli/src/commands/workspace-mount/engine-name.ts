import { type Engine, ENGINES } from "../../mount-registry";

export function isEngine(value: string): value is Engine {
  return ENGINES.some((engine) => engine === value);
}
