/** The packages this verb will vendor. Mirrors the contract's closed list. */
export const VENDORABLE_PACKAGES = ["@agent-nexus/apps-ui"] as const;
export const DEFAULT_VENDORABLE_PACKAGE = "@agent-nexus/apps-ui";

export function isVendorablePackage(name: string): boolean {
  return (VENDORABLE_PACKAGES as readonly string[]).includes(name);
}
