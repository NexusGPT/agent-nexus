import type { CloudImportProviderSlug } from "@agent-nexus/sdk";

import { parseRequiredIdList } from "../../../util/ids";

export const PROVIDER_SLUGS: CloudImportProviderSlug[] = ["google-drive", "sharepoint", "notion"];

export function assertProvider(provider: string): CloudImportProviderSlug {
  if (!PROVIDER_SLUGS.includes(provider as CloudImportProviderSlug)) {
    throw new Error(
      `Unknown provider "${provider}". Expected one of: ${PROVIDER_SLUGS.join(", ")}`
    );
  }

  return provider as CloudImportProviderSlug;
}

/**
 * Splits the id list once, here, so every import command rejects an empty list
 * the same way instead of sending one and having the API answer for it.
 */
export function parseItemIds(value: string): string[] {
  return parseRequiredIdList(value, "--item-ids");
}
