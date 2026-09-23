import type { RoleScopeLineInput } from "@agent-nexus/sdk";

import { CONTINUATION } from "./key-column";

/**
 * The whole of a scope line.
 *
 * `scope` is the field callers miss: it is REQUIRED, and there is no `note` on a
 * line — a body carrying one is refused by name, because the schema is strict.
 */
export const SCOPE_LINE_FIELDS: Record<keyof RoleScopeLineInput, string> = {
  jobTypeId: 'uuid     from "nexus role job-types"',
  quantity: "number   how many units of that type. 0 is legal",
  scope: `string   REQUIRED. What this line covers, in words.\n${CONTINUATION}"" is legal.`
};
