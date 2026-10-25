import { NexusApiError } from "@agent-nexus/sdk";

import type { createClient } from "../../client";
import { CategorizedCliError, categoryForHttpStatus } from "../../exit-codes";

/**
 * A workspace list the server REFUSED is an answer, not a network hiccup: 401
 * is a key the server does not accept, 403 a key that is not this
 * organization's. Neither may mount anything — the gateway engines send only
 * the key, so they would open the key's OWN organization under a registry row
 * that names this one. Every other failure (offline, a 5xx) is `null`, and the
 * caller degrades as before.
 */
export function keyRefusalOf(listError: unknown, organization: string): CategorizedCliError | null {
  if (!(listError instanceof NexusApiError)) return null;
  if (listError.status !== 401 && listError.status !== 403) return null;
  const hint =
    listError.status === 401
      ? "Run: nexus auth login, then mount again."
      : `This key belongs to another organization. Run: nexus auth status, then mount with the profile of "${organization}" (--profile <name>).`;
  return new CategorizedCliError(
    categoryForHttpStatus(listError.status),
    listError.code,
    `The workspace list for "${organization}" was refused (${String(listError.status)}): ${listError.message}`,
    hint
  );
}

/** The first name that says something: a blank org name is no name (`??` would stop at it). */
export function organizationLabel(...names: ReadonlyArray<string | undefined>): string {
  return names.find((name) => name !== undefined && name.trim() !== "") ?? "this organization";
}

/** `remount` reads no list of its own: it asks once, and refuses on the same rule. */
export async function refuseKeyOfAnotherOrganization(
  client: ReturnType<typeof createClient>,
  organization: string
): Promise<void> {
  try {
    await client.workspaces.list();
  } catch (error) {
    const refusal = keyRefusalOf(error, organization);
    if (refusal !== null) throw refusal;
  }
}
