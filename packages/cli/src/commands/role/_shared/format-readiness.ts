/** Render `permissionSets=PENDING, owner=READY`, or a dash when there is nothing. */
export function formatReadiness(value: unknown): string {
  if (value === null || typeof value !== "object") return "—";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "roleId")
    .map(([key, state]) => `${key}=${String(state)}`);
  return entries.length > 0 ? entries.join(", ") : "—";
}
