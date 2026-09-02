/**
 * Every sandbox workspace mount root this product declares must be known to the two
 * PYTHON ENFORCERS this package ships into every user's `.claude/hooks/`.
 *
 * ── The defect this exists to catch ─────────────────────────────────────────────────
 *
 * `nexus claude-code install` writes `hooks/nexus-fs-firewall.py` and
 * `hooks/lib/destructive_guard.py` onto the user's machine and into the UC sandbox
 * snapshot, and both key safety decisions on "is this path a workspace mount root".
 * Measured on the bundle pinned at `bc52b93c42b6d9cda80746e5ef43856984d96c57`, each
 * carried its own copy of a different SUBSET:
 *
 *   firewall work dirs          ("/mnt/workspace", "/mnt/workspace/_shared")
 *   destructive_guard._fs_hostile   "/mnt/workspace" and its subtree
 *   destructive_guard EQUALITY tier "/mnt/workspace" alone
 *
 * `/mnt/workspace/_shared` is the volume-era layout and is impossible under in-sandbox
 * mount-s3 — see `UC_SHARED_WORKSPACE_SIBLING_ROOT`'s docblock, which records the
 * four-month bug that moved shared workspaces to a sibling root. So the only entry those
 * copies shared beyond the org root was DEAD, and `/mnt/workspace-shared` and
 * `/mnt/workspaces` were in none of them.
 *
 * The separator is what hid it: `"/mnt/workspace-shared".startsWith("/mnt/workspace/")`
 * is false, so a literal that reads as covering the family covers one member.
 *
 * ── Why the check has to live on THIS side ──────────────────────────────────────────
 *
 * The roots are strings the PRODUCT chooses. The enforcers are in
 * `NexusGPT/claude-code-skills-nexus`, a different repository, and nothing there can
 * notice this repository adding a fourth grammar. `mount-roots-share-one-parent.spec.ts`
 * already pins that every root shares one parent; this file pins that every root reaches
 * the code that guards it. Same subject, the two halves nobody could see together.
 *
 * ── Why it does not fail today ──────────────────────────────────────────────────────
 *
 * The fix is `NexusGPT/claude-code-skills-nexus#42` and the pin has not moved, so the
 * bundle on disk still predates it. That is stated as a POSITIVE assertion rather than
 * skipped: the pending branch requires the lock to be exactly the pre-fix sha, so bumping
 * the lock to anything else without the fix is red, and it is red BY NAME. There is no
 * allowlist of roots anywhere in this file — the escape is keyed on a fact about the
 * bundle (the symbol is absent), never on a list somebody can append to.
 *
 * A characterisation test of the broken state would be worse than none, which is why the
 * pending branch asserts the pin and not the subset.
 */
import fs from "node:fs";
import path from "node:path";

import { UC_ORG_WORKSPACE_MOUNT_ROOT, UC_SHARED_WORKSPACE_SIBLING_ROOT } from "@nexus/types";
import { describe, expect, it } from "vitest";

import { getHookFiles } from "../../src/skills-content.generated";

/**
 * `packages/cli/test/unit` -> the monorepo root.
 *
 * This file lives under `test/` rather than `src/` because it imports
 * `@nexus/types`, and `src/wire-types-bundle.test.ts` refuses that for every file
 * under `src/` that is not a `*.conformance.ts` — the gate that keeps the types
 * package, its Zod runtime and the generated Prisma enums out of the published
 * CLI bundle. `test/` is where this package's other `@nexus/types` consumers
 * already live, and `vitest.config.ts` runs both trees.
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

/**
 * The code-interpreter root, read out of the backend rather than imported.
 *
 * `WORKSPACE_MOUNT_ROOT` is declared in `apps/backend`, which this package does not and
 * should not depend on. Copying its value here would reproduce the exact defect this file
 * exists to catch, one repository closer. So the declaration is READ, and a read that
 * finds nothing THROWS rather than returning a default — an absent third root would
 * otherwise shrink the checked set to two and pass.
 */
function readCodeInterpreterRoot(): string {
  const declPath = path.join(
    REPO_ROOT,
    "apps/backend/src/chats/code-interpreter/workspace-mount-key.ts"
  );
  const source = fs.readFileSync(declPath, "utf8");
  const match = /export const WORKSPACE_MOUNT_ROOT\s*=\s*"([^"]+)"/.exec(source);
  if (!match) {
    throw new Error(
      `WORKSPACE_MOUNT_ROOT not found in ${declPath}. It was renamed, moved, or respelled — ` +
        "which silently drops a mount root from this check. Fix the pattern, do not delete it."
    );
  }
  return match[1];
}

/**
 * Written out by hand, for the reason `mount-roots-share-one-parent.spec.ts` gives: a
 * list derived from a module's exports finds a new root automatically and therefore
 * asserts nothing about it. Adding a root means adding a line here, and that is the point.
 */
const DECLARED_ROOTS = [
  UC_ORG_WORKSPACE_MOUNT_ROOT,
  UC_SHARED_WORKSPACE_SIBLING_ROOT,
  readCodeInterpreterRoot()
] as const;

/** The sha the enforcers' subset was measured on. The pending branch below pins it. */
const PRE_FIX_SKILLS_SHA = "bc52b93c42b6d9cda80746e5ef43856984d96c57";

function lockedSkillsSha(): string {
  return fs.readFileSync(path.join(REPO_ROOT, "packages/cli/skills-nexus.lock"), "utf8").trim();
}

function bundledHookCore(): string {
  const entry = getHookFiles().find((f) => f.path === "lib/hook_core.py");
  if (!entry) {
    throw new Error(
      "lib/hook_core.py is not in the shipped hook bundle. Every adapter imports it, so " +
        "its absence is a broken bundle, not a reason to skip this check."
    );
  }
  return entry.content;
}

describe("sandbox workspace roots reach the shipped enforcers", () => {
  it("declares three distinct roots, none a path-prefix of another", () => {
    // The precondition every assertion below rests on. `/mnt/workspace` IS a string
    // prefix of `/mnt/workspace-shared`, so a substring search for one would find the
    // other and this file would pass while a root was missing.
    expect(new Set(DECLARED_ROOTS).size).toBe(3);
    for (const root of DECLARED_ROOTS) {
      for (const other of DECLARED_ROOTS.filter((r) => r !== root)) {
        expect(other.startsWith(`${root}/`)).toBe(false);
      }
    }
  });

  it("reads the backend's own root rather than a copy of it", () => {
    // The control for `readCodeInterpreterRoot`. A regex that silently matched nothing
    // would have thrown above; this proves it matched the RIGHT thing, so a passing run
    // cannot mean "the pattern found some other string".
    expect(readCodeInterpreterRoot()).toBe("/mnt/workspaces");
  });

  it("every declared root is known to the bundled enforcers", () => {
    const hookCore = bundledHookCore();

    if (!hookCore.includes("SANDBOX_WORKSPACE_ROOTS")) {
      // PENDING — NexusGPT/claude-code-skills-nexus#42 is not in the pinned bundle yet.
      // Asserting the pin, not the subset: any other sha reaching this branch means the
      // lock moved and the fix did not come with it.
      expect(lockedSkillsSha()).toBe(PRE_FIX_SKILLS_SHA);
      return;
    }

    for (const root of DECLARED_ROOTS) {
      expect(
        hookCore.includes(`"${root}"`),
        `${root} is declared by this product and absent from the bundled enforcers' ` +
          "SANDBOX_WORKSPACE_ROOTS. Land it in NexusGPT/claude-code-skills-nexus and bump " +
          "packages/cli/skills-nexus.lock; a root the guards do not know is a root they " +
          "do not guard."
      ).toBe(true);
    }
  });

  it("the dead nested layout is not reintroduced as a root", () => {
    const hookCore = bundledHookCore();
    if (!hookCore.includes("SANDBOX_WORKSPACE_ROOTS")) {
      expect(lockedSkillsSha()).toBe(PRE_FIX_SKILLS_SHA);
      return;
    }
    // `/mnt/workspace/_shared` cannot exist under in-sandbox mount-s3: the kernel refuses
    // to attach a mount at a path resolving through a mountpoint-s3 filesystem. It is
    // still COVERED, as a subtree of the org root; it must not come back as a root of its
    // own, because a root entry for it reads as shared-workspace coverage and is not.
    const declaration = /SANDBOX_WORKSPACE_ROOTS\s*=\s*\(([\s\S]*?)\)/.exec(hookCore);
    expect(declaration).not.toBeNull();
    expect(declaration?.[1]).not.toContain(`${UC_ORG_WORKSPACE_MOUNT_ROOT}/_shared`);
  });
});
