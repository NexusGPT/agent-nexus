import type { NexusClient } from "@agent-nexus/sdk";

/**
 * This organization's Roles as `id -> name`, or an EMPTY map.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 BEST-EFFORT ON PURPOSE: A NAME LOOKUP MAY NEVER SUPPRESS A WARNING.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Its only callers are the two warning lines this CLI's own `--help` nominates as
 * the whole signal that another team just lost something. Listing Roles needs
 * `roles:read`, which a write-scoped key need not hold — {@link resolveRoleId}
 * carries the same caveat — so this lookup can 403 on a call that otherwise
 * succeeded. Throwing here would replace the warning with an error about the
 * cosmetics of the warning, on the one line that must always print.
 *
 * So a failure degrades to an empty map and {@link describeRole} falls back to the
 * bare UUID, which is exactly what shipped before. A name IMPROVES the sentence; it
 * is never a precondition for printing it.
 */
export async function roleNamesById(client: NexusClient): Promise<Map<string, string>> {
  try {
    const { roles } = await client.roles.list();
    return new Map(roles.map((entry) => [entry.id, entry.name]));
  } catch {
    return new Map();
  }
}

/**
 * Identify a Role to a READER: `Name (uuid)`, or the bare UUID when unresolved.
 *
 * BOTH HALVES ARE LOAD-BEARING, and this is the spelling {@link resolveRoleId}
 * already uses when it refuses an ambiguous name. The NAME is the half a human
 * recognises — a UUID names no team to anybody, and these sentences exist to tell
 * a reader WHICH team was affected. The UUID stays because a name is not a key
 * here: `resolveRoleId` REFUSES a name matching more than one Role, so a warning
 * that prescribes "attach the system back to that Role" would otherwise hand the
 * reader a string the remedy can reject.
 *
 * ⚠️ THIS IS STDERR PROSE AND NOTHING ELSE. `printWarning` writes to stderr and is
 * excluded from the `--json` document by construction (see `output.ts`), so no
 * script parses it. The machine-readable answer is the `movedFrom` field of the
 * `printSuccess` payload, which stays a bare UUID because seizure detection is
 * built on it — do NOT "improve" that field to match this one.
 */
export function describeRole(names: Map<string, string>, roleId: string): string {
  const name = names.get(roleId);
  return name === undefined ? roleId : `${name} (${roleId})`;
}
