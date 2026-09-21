/**
 * The organization a login run settled on, however it got there — picked from a
 * membership list, or typed in by the holder of a platform-operator key.
 *
 * `orgName` stays optional because a platform-operator key can name a FOREIGN
 * org, which has no membership row to read a name from.
 */
export interface OrgChoice {
  readonly orgId: string;
  readonly orgName: string | undefined;
}
