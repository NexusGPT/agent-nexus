// ============================================================================
// Me / Organization info (whoami endpoint)
// ============================================================================

/** Organization info returned by `client.me.get()`. */
export interface MeResponse {
  /** Organization unique ID. */
  orgId: string;
  /** Human-readable organization name. */
  orgName: string;
}
