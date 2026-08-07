// ============================================================================
// User group (response shape)
// ============================================================================

/**
 * A user group — the `group` principal a permission grant names.
 *
 * A `ResourcePermission` row with `subjectType: "group"` carries this object's
 * `id` in its `subjectId`, with no foreign key between the two. So creating a
 * group and granting it access are two halves of one operation.
 *
 * The row also carries an `organizationId`, which this surface deliberately does
 * not echo — a caller already knows its own organization, and reading a tenant
 * boundary off a response body rather than off the key is how one gets crossed.
 */
export interface UserGroup {
  /** Group UUID. */
  id: string;
  /** Group display name. */
  name: string;
  /** Free-text description, or `null`. */
  description: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /**
   * The group's members, as Clerk user ids (`user_…`).
   *
   * Present on EVERY response, so a build can assert who is in a group in the
   * same call that changed it.
   */
  memberUserIds: string[];
  /** How many users belong to the group. */
  memberCount: number;
}

/** Response from `client.userGroups.list()`. */
export interface ListUserGroupsResponse {
  /** Every user group in the organization. */
  userGroups: UserGroup[];
}

/** Response from every user-group write — create, update, and both membership verbs. */
export interface UserGroupResponse {
  /** The group as it stands after the write. */
  userGroup: UserGroup;
}

// ============================================================================
// Request bodies
// ============================================================================

/**
 * Request body for `client.userGroups.create()`.
 *
 * `userIds` REPLACES the membership when present and is left alone when
 * omitted. Passing `[]` empties the group; omitting the key does not.
 */
export interface CreateUserGroupBody {
  /** Group display name. Must not be empty. */
  name: string;
  /** Clerk user ids (`user_…`) to set as the membership. */
  userIds?: string[];
}

/** Request body for `client.userGroups.update()`. Same semantics as {@link CreateUserGroupBody}. */
export type UpdateUserGroupBody = CreateUserGroupBody;

/**
 * Request body for `client.userGroups.addMember()` and `client.userGroups.removeMember()`.
 *
 * The user id travels in the BODY rather than the path: a group id is a UUID
 * and a Clerk user id is not, so keeping them apart means no object on this
 * surface mixes a uuid-checked id with an unchecked sibling.
 */
export interface UserGroupMemberBody {
  /** Clerk user id (`user_…`). Never a UUID. */
  userId: string;
}

// ============================================================================
// Delete response
// ============================================================================

/**
 * Response from `client.userGroups.delete()`.
 *
 * `revokedPermissionCount` is not decoration. A group is a permission subject
 * with no foreign key to the grant table, so deleting one leaves every grant
 * that named it behind unless something removes them — and those orphans keep
 * appearing in a resource's access list naming a group that no longer exists.
 * The count is how a caller tells a delete that cleaned up from one that did not.
 */
export interface DeleteUserGroupResponse {
  /** Always `true` on a successful delete. */
  deleted: true;
  /** How many grant rows naming this group were removed alongside it. */
  revokedPermissionCount: number;
}
