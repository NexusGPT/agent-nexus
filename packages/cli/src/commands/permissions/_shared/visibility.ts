import type { PermissionResourceType, ResourceVisibility } from "@agent-nexus/sdk";

/**
 * Resolve `--visibility` into what the API expects.
 *
 * `none` is a token this CLI invents — the wire value is `null`, which removes
 * the override so the type falls back to the org default. Omitting the field is
 * refused by the server, so "clear it" has to be sayable, and it cannot be said
 * by leaving the flag off. The check is local because a typo (`--visibility
 * non`) would otherwise be forwarded verbatim and 400 with a message listing
 * enum values that do not include `none`.
 */
export function resolveVisibility(raw: string): ResourceVisibility | null {
  if (raw === "none" || raw === "null") return null;
  if (raw === "open" || raw === "closed") return raw;
  throw new Error(`Invalid --visibility "${raw}". Expected: open, closed, or none (clears it).`);
}

/** Render a resource-type → visibility map as `agent=open, workflow=closed`. */
export function formatVisibilityMap(
  map: Partial<Record<PermissionResourceType, ResourceVisibility>>
): string {
  const parts = Object.entries(map).map(([type, visibility]) => `${type}=${String(visibility)}`);
  return parts.length > 0 ? parts.join(", ") : "—";
}
