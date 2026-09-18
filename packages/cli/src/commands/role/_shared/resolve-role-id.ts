import type { NexusClient } from "@agent-nexus/sdk";

/** A Role id is `@db.Uuid`, so a uuid-shaped argument is never a name. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turn a `<role>` argument into a Role id.
 *
 * A uuid is returned untouched — no lookup, no extra request. A name costs one
 * `GET /roles`, which is unpaginated.
 *
 * ── WHY THE MATCH IS TWO PASSES AND WHY IT REFUSES ───────────────────────────
 *
 * An exact case-insensitive name wins outright. Only when nothing matches exactly
 * does it fall back to a substring, and BOTH passes refuse on more than one
 * candidate rather than picking. That refusal is the whole point: several of these
 * commands write, and `attach` MOVES a system off whichever Role held it — so a
 * silently wrong Role here takes a customer's production system away from the
 * team that owns it. Ambiguity names its candidates and stops.
 *
 * ⚠️ THIS NEEDS `roles:read`. A key holding only `role_coverage:read` can reach
 * `nexus role coverage <uuid>` and cannot resolve a NAME at all, because the list
 * it would resolve against is behind a scope it does not hold. The error says so
 * instead of reporting the Role as missing.
 */
export async function resolveRoleId(client: NexusClient, ref: string): Promise<string> {
  if (UUID_PATTERN.test(ref)) return ref;

  let roles: { id: string; name: string }[];
  try {
    ({ roles } = await client.roles.list());
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot resolve the Role name "${ref}": listing Roles failed (${detail}). ` +
        `Resolving a name needs the roles:read scope — pass the Role's UUID instead if this key does not hold it.`
    );
  }

  const needle = ref.toLowerCase();
  const exact = roles.filter((role) => role.name.toLowerCase() === needle);
  const candidates =
    exact.length > 0 ? exact : roles.filter((r) => r.name.toLowerCase().includes(needle));

  // Ambiguity is decided FIRST so the single-match case can be narrowed by
  // destructuring rather than asserted. `candidates.length === 1` tells tsc
  // nothing about element 0, so indexing it needs a non-null assertion — which
  // this package's lint budget correctly refuses.
  if (candidates.length > 1) {
    const named = candidates.map((role) => `${role.name} (${role.id})`).join(", ");
    throw new Error(
      `"${ref}" matches ${String(candidates.length)} Roles: ${named}. Pass the UUID you mean.`
    );
  }

  const [only] = candidates;
  if (only !== undefined) return only.id;

  const available = roles
    .map((role) => role.name)
    .sort()
    .join(", ");
  throw new Error(
    `No Role named "${ref}" in this organization.` +
      (available.length > 0 ? ` Roles here: ${available}.` : " This organization has no Roles.")
  );
}
