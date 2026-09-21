import { isCrossOrgToken } from "./token-prefixes";

/** Why `nexus auth use-org` cannot proceed, or `null` when it can. */
export type UseOrgRefusal = "org-scoped-key" | "env-override" | null;

/**
 * Decide whether `use-org` can run, in PRECEDENCE order. Extracted and exported
 * because the order IS the behaviour and is otherwise unreachable from a test.
 *
 * Being bound to one organization outranks the env-override complaint. An
 * org-scoped key told "use the NEXUS_ORGANIZATION_ID env var instead" would be
 * sent down a path that cannot work: the server refuses a mismatched org with
 * `ORG_SCOPED_KEY_ORG_MISMATCH` rather than quietly answering from the key's own
 * org (NEX-3175). Its real remedy — obtain a personal token — is the same with or
 * without an override, so it is reported first.
 */
export function classifyUseOrgRefusal(input: {
  apiKey: string;
  personalToken?: boolean;
  source: string;
}): UseOrgRefusal {
  const isPersonalToken = input.personalToken === true || isCrossOrgToken(input.apiKey);
  if (!isPersonalToken) {
    return "org-scoped-key";
  }
  if (input.source === "override") {
    return "env-override";
  }
  return null;
}
