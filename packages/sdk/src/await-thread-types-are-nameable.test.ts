import { describe, expect, it } from "vitest";

import * as Root from "./index";
import type * as PromptAssistant from "./resources/prompt-assistant";

/**
 * 🚨 THE ASSERTIONS THAT MATTER IN THIS FILE ARE TYPES, AND `vitest` CANNOT SEE
 * THEM. `pnpm --filter @agent-nexus/sdk typecheck` is the gate. A green vitest
 * run over this file proves only the one runtime case at the bottom.
 *
 * `awaitThread` is public — it is the long-poll a caller uses instead of its own
 * retry loop — and its parameter type, its return type and the progress object
 * inside that return were all unnameable from the package root. The method
 * worked the whole time; what was impossible was DECLARING a variable to hold
 * what it takes or what it hands back, which is the same shape that cost
 * `packages/cli` 15 `as any` casts when the types barrel had a hole. An import
 * that does not resolve is a compile error and nothing else, so no runtime test
 * could ever have noticed.
 *
 * The root's hand-maintained `./resources/prompt-assistant` list is the reason
 * these four were missing: `export *` cannot drift and a list can, so the names
 * are pinned INDIVIDUALLY here. A regression that drops one fails with that
 * name in the compiler error rather than as a count.
 */

/** Compile error unless `T` is exactly `never`. */
type AssertNever<T extends never> = T;

/** Compile error unless `T` is assignable to `U`. */
type AssertAssignableTo<T extends U, U> = T;

/**
 * `never` when `A` and `B` are mutually assignable, and otherwise the side that
 * does not fit — so the failure names a type rather than reporting a boolean.
 *
 * The dominant arm is still PRESENCE: where the root stops exporting a name,
 * `Root.<name>` is a hard compile error before this conditional is ever
 * evaluated. This layer adds the second half — that the root publishes the
 * resource module's OWN declaration and not some re-declaration that merely
 * shares its spelling.
 */
type NotTheSameTypeAs<A, B> = [A] extends [B] ? ([B] extends [A] ? never : B) : A;

export type _AwaitThreadOptionsIsNameableAtTheRoot = AssertNever<
  NotTheSameTypeAs<Root.AwaitThreadOptions, PromptAssistant.AwaitThreadOptions>
>;

export type _AwaitThreadResultIsNameableAtTheRoot = AssertNever<
  NotTheSameTypeAs<Root.AwaitThreadResult, PromptAssistant.AwaitThreadResult>
>;

export type _PromptAssistantThreadProgressIsNameableAtTheRoot = AssertNever<
  NotTheSameTypeAs<
    Root.PromptAssistantThreadProgress,
    PromptAssistant.PromptAssistantThreadProgress
  >
>;

/**
 * The const, and this arm is why it is in the VALUE export block.
 *
 * `typeof` on it is a compile error in both directions that matter: if the root
 * stops exporting the name at all, and if the root exports it as a TYPE only —
 * which would satisfy nothing a caller needs and is exactly the mistake
 * `export type *` over the resources would have shipped. The annotation is
 * `number` rather than the literal `55` on purpose: the server's hold cap is
 * free to move, and coupling this file to its value would make an unrelated
 * change here read as a regression.
 */
export type _MaxWaitSecondsIsAValueAtTheRoot = AssertAssignableTo<
  typeof Root.PROMPT_ASSISTANT_MAX_WAIT_SECONDS,
  number
>;

describe("awaitThread's surface is nameable from the package root", () => {
  /**
   * The one thing a runtime check adds here, and its whole scope.
   *
   * Every assertion above is satisfied by a type-only export of the const, and
   * a type-only export ships a root where reading
   * `PROMPT_ASSISTANT_MAX_WAIT_SECONDS` to size a caller's own abort is a
   * runtime `undefined`. Sizing that abort is the point of exporting it, so the
   * value has to be real. Nothing else in this file can see that.
   */
  it("exposes PROMPT_ASSISTANT_MAX_WAIT_SECONDS as a real number, not only as a type", () => {
    expect(typeof Root.PROMPT_ASSISTANT_MAX_WAIT_SECONDS).toBe("number");
  });
});
