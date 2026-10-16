import { resolveProfile } from "./config-resolve";

/**
 * Resolve the API key.
 * Precedence: explicit --api-key override → the named --profile's key →
 * NEXUS_API_KEY env → active profile's key → error. An explicit --profile
 * outranks the ambient env var (resolution delegates to resolveProfile).
 *
 * Every term after the override belongs to {@link resolveProfile}, which is why
 * this is an adapter and not a fourth precedence: the only decision taken here
 * is that an explicit `--api-key` wins, and `resolveProfile` makes that same
 * decision itself for the profile it returns.
 */
export function resolveApiKey(override?: string, profile?: string): string {
  if (override) return override;
  return resolveProfile({ profile }).profile.apiKey;
}
