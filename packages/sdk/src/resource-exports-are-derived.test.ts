import { describe, expect, it } from "vitest";

import * as Root from "./index";
import * as Resources from "./resources";

/**
 * 🚨 THE ASSERTIONS THAT MATTER IN THIS FILE ARE TYPES, AND `vitest` CANNOT SEE
 * THEM. `pnpm --filter @agent-nexus/sdk typecheck` is the gate. A green vitest
 * run over this file proves only the small runtime case at the bottom.
 *
 * That is not a caveat, it is the defect this file exists for. Eight resource
 * classes were exported from `./resources` and missing from the package root for
 * as long as anyone had been adding to a hand-maintained list. No runtime test
 * could ever have noticed: `client.customers.list()` worked the whole time —
 * `NexusClient` constructs every resource internally — and what was impossible
 * was NAMING the class. An import that does not resolve is a compile error and
 * nothing else.
 *
 * The same shape cost `packages/cli` 15 `as any` casts when the TYPES barrel had
 * the same hole, and it is why `./index.ts` now derives both surfaces instead of
 * restating either.
 */

/** Compile error unless `T` is exactly `never`. */
type AssertNever<T extends never> = T;

type ResourceKeysOf<T> = Extract<keyof T, `${string}Resource`>;

/**
 * Every resource the barrel exports must be nameable from the package root.
 *
 * With `export *` this holds by construction — which is the point. If someone
 * replaces it with a list again, this stops compiling on the first name they
 * forget, rather than on the day a consumer needs that name.
 */
type MissingFromRoot = Exclude<ResourceKeysOf<typeof Resources>, ResourceKeysOf<typeof Root>>;
export type _EveryResourceIsNameable = AssertNever<MissingFromRoot>;

/**
 * `BaseResource` is WITHHELD, and both halves of that are pinned.
 *
 * It is the abstract base every resource extends. Keeping it out of the barrel
 * is what keeps it out of the root now that the root derives — so the barrel is
 * where the decision lives, and re-adding it there would silently publish it.
 */
export type _BaseResourceIsNotInTheBarrel = AssertNever<
  Extract<keyof typeof Resources, "BaseResource">
>;
export type _BaseResourceIsNotAtTheRoot = AssertNever<Extract<keyof typeof Root, "BaseResource">>;

/**
 * The eight that were missing, named individually and on purpose.
 *
 * The assertion above is general and would keep passing if the barrel itself
 * lost a name. These are the eight this ticket was filed for, so a regression
 * that removes one fails with that name in the error rather than as a count.
 */
export type _TheEightAreNameable = [
  typeof Root.ChannelsResource,
  typeof Root.CustomModelsResource,
  typeof Root.CustomersResource,
  typeof Root.DocsResource,
  typeof Root.KnownIssuesResource,
  typeof Root.MeResource,
  typeof Root.PhoneNumbersResource,
  typeof Root.SkillFoldersResource
];

describe("the resource classes are exported as VALUES, not only as types", () => {
  /**
   * The one thing a runtime check adds, and its whole scope.
   *
   * `export type * from "./types"` sits ten lines below the resource export in
   * `index.ts`. Writing `export type *` for the resources instead would satisfy
   * every type assertion above and ship a root where `new CustomersResource(...)`
   * is a runtime `undefined`. Constructing one is the point of the ticket, so the
   * value has to be real.
   */
  it.each([
    "ChannelsResource",
    "CustomModelsResource",
    "CustomersResource",
    "DocsResource",
    "KnownIssuesResource",
    "MeResource",
    "PhoneNumbersResource",
    "SkillFoldersResource"
  ])("%s is a constructor at the package root", (name) => {
    expect(typeof (Root as Record<string, unknown>)[name]).toBe("function");
  });

  it("exposes every resource the barrel does, and no more", () => {
    const barrel = Object.keys(Resources).filter((key) => key.endsWith("Resource"));
    const root = Object.keys(Root).filter((key) => key.endsWith("Resource"));

    expect(barrel.length).toBeGreaterThan(0);
    expect([...root].sort()).toEqual([...barrel].sort());
  });

  it("withholds BaseResource from both", () => {
    expect(Object.keys(Resources)).not.toContain("BaseResource");
    expect(Object.keys(Root)).not.toContain("BaseResource");
  });
});
