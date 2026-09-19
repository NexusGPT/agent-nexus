import {
  isVibeEnvVarScope,
  VIBE_ENV_VAR_SCOPES,
  type VibeEnvVarScope
} from "../../../vibe-wire-types";

export function resolveEnvScope(raw: string | undefined): VibeEnvVarScope | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toUpperCase();
  if (!isVibeEnvVarScope(v)) {
    throw new Error(
      `Invalid --scope "${raw}". Expected one of: ${VIBE_ENV_VAR_SCOPES.join(", ")}.`
    );
  }
  return v;
}
