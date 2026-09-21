/**
 * What a login run learned about who the key belongs to and which organization
 * it will act on. Every field is optional because `/me` is best-effort on both
 * paths — an older backend that cannot answer it still logs the user in.
 */
export interface LoginIdentity {
  readonly orgName: string | undefined;
  readonly orgId: string | undefined;
  readonly userEmail: string | undefined;
}
