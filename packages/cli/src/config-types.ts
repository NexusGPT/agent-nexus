/**
 * THE VOCABULARY THE CONFIG LAYER IS WRITTEN IN — a profile, the file that
 * holds a set of them, and the resolution of which one a command is using.
 *
 * Types only, and no imports at all, so every file below it can declare what it
 * returns without importing the index that re-exports them all. A shared value
 * declared in a re-export index instead is what costs `import/no-cycle` one
 * warning per sibling.
 */

/** A single saved organization/key pair. */
export interface NexusProfile {
  apiKey: string;
  baseUrl?: string;
  dashboardUrl?: string;
  orgName?: string;
  orgId?: string;
  /** Email of the user that owns the API key (captured at login from /me). */
  userEmail?: string;
  /**
   * True when `apiKey` is org-unbound — a personal cross-org token (`nxs_p_`) or
   * a platform-operator token (`nxs_o_`, NEX-3037). One
   * key usable across every org the user belongs to. The active org is `orgId`,
   * sent as the `organization-id` header; switch it with `nexus auth use-org`.
   * See NEX-2474.
   */
  personalToken?: boolean;
}

/** V2 config: multiple named profiles with one active. */
export interface NexusConfigV2 {
  activeProfile: string;
  profiles: Record<string, NexusProfile>;
}

/** How the active profile was determined. */
export type ProfileSource =
  | "flag" // --profile flag
  | "env" // NEXUS_PROFILE env var
  | "directory" // .nexusrc file
  | "active" // config.activeProfile
  | "default" // fallback to "default" profile
  | "override"; // --api-key flag or NEXUS_API_KEY env (bypasses profiles)

/** Result of profile resolution — includes the source for the context banner. */
export interface ResolvedProfile {
  name: string;
  profile: NexusProfile;
  source: ProfileSource;
  /** Path to .nexusrc when source === "directory". */
  rcPath?: string;
}
