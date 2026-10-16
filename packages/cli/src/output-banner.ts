// ---------------------------------------------------------------------------
// Context banner — shows active profile on every command
// ---------------------------------------------------------------------------

import type { ProfileSource, ResolvedProfile } from "./config";
import { color } from "./output-color";
import { isJsonMode } from "./output-json-mode";

const SOURCE_LABELS: Record<ProfileSource, string> = {
  flag: "flag override",
  env: "env",
  directory: ".nexusrc",
  active: "active",
  default: "default",
  override: "api-key override"
};

/**
 * Print a one-line context banner to stderr showing the active profile.
 * Suppressed in JSON mode and non-TTY mode.
 *
 * Example: `▸ acme-corp (Acme Corp) · active`
 */
export function printContextBanner(resolved: ResolvedProfile): void {
  if (isJsonMode()) return;
  if (!process.stderr.isTTY) return;

  const orgPart = resolved.profile.orgName ? ` (${resolved.profile.orgName})` : "";
  const line = `▸ ${resolved.name}${orgPart} · ${SOURCE_LABELS[resolved.source]}`;
  process.stderr.write(color.dim(line) + "\n");
}
