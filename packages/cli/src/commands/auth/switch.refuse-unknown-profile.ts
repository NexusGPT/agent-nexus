import { listProfiles } from "../../config";
import { reportFailure } from "../../errors";

/**
 * Refuse a scoped switch to a profile that does not exist, naming the ones that
 * do. The machine-wide path gets the same refusal from `setActiveProfile`; the
 * scoped paths need it BEFORE they write a `.nexusrc` or print an export line,
 * because either one would otherwise bind the session to a name that resolves to
 * nothing and fails on the next command instead of this one.
 */
export function refuseUnknownProfile(name: string): number {
  const available = Object.keys(listProfiles().profiles).join(", ");
  return reportFailure(
    "not-found",
    `Profile "${name}" not found.`,
    available ? `Available: ${available}. Run: nexus auth list` : "Run: nexus auth login"
  );
}
