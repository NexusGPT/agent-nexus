/**
 * The WIRE SHAPES `nexus apps domains …` reads off the Vibe custom-domain routes.
 *
 * Mirrors `packages/types/src/api/domains/vibe/schemas/app-domains.schemas.ts`,
 * re-declared for the reason `vibe-wire-types.ts` gives: the CLI ships
 * standalone and `@nexus/types` is not a runtime dependency. Its own module
 * because custom domains are their own surface, and
 * `vibe-domain-wire-types.conformance.ts` is the gate that fails `pnpm
 * typecheck` when one of these stops matching the contract.
 */

/** Where a custom domain is in its life. Mirrors the Prisma enum `VibeAppDomainStatus`. */
export const VIBE_APP_DOMAIN_STATUSES = [
  "PENDING_DNS",
  "ISSUING_CERT",
  "ACTIVE",
  "FAILED"
] as const;
export type VibeAppDomainStatus = (typeof VIBE_APP_DOMAIN_STATUSES)[number];

/**
 * Whether the host is a zone apex or a name under one. Decides the record type:
 * an apex cannot carry a CNAME, so it is pointed with A records.
 */
export const VIBE_APP_DOMAIN_KINDS = ["APEX", "SUBDOMAIN"] as const;
export type VibeAppDomainKind = (typeof VIBE_APP_DOMAIN_KINDS)[number];

/**
 * One DNS record the owner creates at their DNS provider. `name` is the FULL
 * host, never a zone-relative label — providers disagree on how to spell the
 * apex, and the full name is the one no provider misreads.
 */
export interface VibeAppDomainDnsRecordDto {
  type: "CNAME" | "A";
  name: string;
  value: string;
}

/**
 * What to create, or why nothing can be said yet.
 *
 * `unavailable` is an APEX domain before the edge's static addresses are
 * configured. The CLI prints the server's `reason` and NO record — an address it
 * made up would point the customer's apex at a machine that is not ours.
 */
export type VibeAppDomainDnsInstructionsDto =
  | { status: "ready"; records: VibeAppDomainDnsRecordDto[] }
  | { status: "unavailable"; reason: string };

export interface VibeAppDomainDto {
  id: string;
  appId: string;
  host: string;
  kind: VibeAppDomainKind;
  status: VibeAppDomainStatus;
  /** Why the domain is in its status — what the last DNS check found. `null` when nothing to say. */
  statusReason: string | null;
  verifiedAt: string | null;
  activatedAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  isPrimary: boolean;
  dns: VibeAppDomainDnsInstructionsDto;
}

export interface ListVibeAppDomainsResponse {
  domains: VibeAppDomainDto[];
}

export interface AddVibeAppDomainResponse {
  domain: VibeAppDomainDto;
}

export interface VerifyVibeAppDomainResponse {
  domain: VibeAppDomainDto;
}

export interface DeleteVibeAppDomainResponse {
  deletedHost: string;
}

export interface SetVibeAppPrimaryDomainResponse {
  primaryDomainId: string | null;
}
