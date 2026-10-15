import type { GenericGrantResourceType } from "@agent-nexus/sdk";

/**
 * Every member of `GenericGrantResourceType`, as a runtime lookup.
 *
 * A `Record` over the union rather than an array: a resource type added to the
 * SDK is a COMPILE ERROR here until it is listed, where an array would silently
 * start rejecting a type the server accepts. The CLI needs the runtime list at
 * all because `nexus permissions access` takes the type as a positional
 * argument, and a `string` from commander has to be narrowed rather than cast.
 *
 * 🚨 IT IS KEYED ON THE NARROW UNION, NOT ON `PermissionResourceType`, and that
 * is what keeps this list and the route in step. `knowledge` and `workspace` are
 * REFUSED by every route in this namespace — their access is held in Role grants
 * and nowhere else — so listing them here would re-offer, from the one file that
 * is hand-written, exactly the two values the generated contract just stopped
 * advertising (NEX-3761). Keying on the response-side union would compile and
 * would say the wrong thing.
 */
const GENERIC_GRANT_RESOURCE_TYPES: Record<GenericGrantResourceType, true> = {
  agent: true,
  workflow: true,
  credential: true,
  access_card: true,
  template: true,
  document: true,
  deployment: true,
  feature: true,
  vibe_app: true,
  track: true
};

export const RESOURCE_TYPE_NAMES = Object.keys(GENERIC_GRANT_RESOURCE_TYPES).sort().join(", ");

export function isGenericGrantResourceType(value: string): value is GenericGrantResourceType {
  return Object.prototype.hasOwnProperty.call(GENERIC_GRANT_RESOURCE_TYPES, value);
}
