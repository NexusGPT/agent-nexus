import type {
  CreateUserGroupBody,
  DeleteUserGroupResponse,
  ListUserGroupsResponse,
  UpdateUserGroupBody,
  UserGroupMemberBody,
  UserGroupResponse
} from "../types/user-groups";
import { BaseResource } from "./base-resource";

/**
 * User groups — the `group` principal a permission grant names. Accessed via
 * `client.userGroups`.
 *
 * A grant row's `subjectId` IS a group's `id`, with no foreign key between them,
 * so `client.userGroups.create()` followed by `client.permissions.grant()` is
 * the whole of "share this with the support team".
 */
export class UserGroupsResource extends BaseResource {
  /**
   * List every user group in the organization, each with its membership.
   *
   * @returns All groups, with member ids and counts.
   */
  async list(): Promise<ListUserGroupsResponse> {
    return this.http.request<ListUserGroupsResponse>("GET", "/user-groups");
  }

  /**
   * Create a user group.
   *
   * @param body - The group name, and optionally the Clerk user ids to seed it with.
   * @returns The created group.
   */
  async create(body: CreateUserGroupBody): Promise<UserGroupResponse> {
    return this.http.request<UserGroupResponse>("POST", "/user-groups", { body });
  }

  /**
   * Rename a group and optionally REPLACE its membership.
   *
   * @param userGroupId - Group UUID.
   * @param body - The new name; `userIds` replaces the membership when present, and `[]` empties it.
   * @returns The group after the write.
   */
  async update(userGroupId: string, body: UpdateUserGroupBody): Promise<UserGroupResponse> {
    return this.http.request<UserGroupResponse>("PUT", `/user-groups/${userGroupId}`, { body });
  }

  /**
   * Delete a group and every permission grant that named it.
   *
   * @param userGroupId - Group UUID.
   * @returns Confirmation, plus how many grant rows were revoked alongside it.
   */
  async delete(userGroupId: string): Promise<DeleteUserGroupResponse> {
    return this.http.request<DeleteUserGroupResponse>("DELETE", `/user-groups/${userGroupId}`);
  }

  /**
   * Add one user to a group, leaving the rest of the membership alone.
   *
   * @param userGroupId - Group UUID.
   * @param body - The Clerk user id to add.
   * @returns The group after the write.
   */
  async addMember(userGroupId: string, body: UserGroupMemberBody): Promise<UserGroupResponse> {
    return this.http.request<UserGroupResponse>("POST", `/user-groups/${userGroupId}/members/add`, {
      body
    });
  }

  /**
   * Remove one user from a group, leaving the rest of the membership alone.
   *
   * @param userGroupId - Group UUID.
   * @param body - The Clerk user id to remove.
   * @returns The group after the write.
   */
  async removeMember(userGroupId: string, body: UserGroupMemberBody): Promise<UserGroupResponse> {
    return this.http.request<UserGroupResponse>(
      "POST",
      `/user-groups/${userGroupId}/members/remove`,
      { body }
    );
  }
}
