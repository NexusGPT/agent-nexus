import type { VibeLogColor } from "../../../vibe-wire-types";

/** What the caller typed. Every field is raw, exactly as commander hands it over. */
export interface AppLogsFlags {
  since?: string;
  until?: string;
  color?: string;
  grep?: string;
  limit?: string;
  follow?: boolean;
}

/** A resolved, validated request. `to` is absent for a follow — a follow's end is always now. */
export interface AppLogsRequest {
  from: number;
  to?: number;
  color?: VibeLogColor;
  contains?: string;
  limit: number;
  follow: boolean;
}
