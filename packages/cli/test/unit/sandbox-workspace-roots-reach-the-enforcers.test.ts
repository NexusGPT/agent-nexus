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
 * ── Reading `hook_core.py` does not answer the question this file asks ──────────────
 *
 * The constant and the code that consults it are in DIFFERENT FILES, so a bundle can
 * declare all three roots and enforce one. That is not hypothetical — it is what
 * `@agent-nexus/cli@1.3.0` shipped, and it is the state this file used to pass over:
 * every assertion here read `lib/hook_core.py`, where `SANDBOX_WORKSPACE_ROOTS` was
 * present and correct, while `nexus-fs-firewall.py` still carried
 * `("/mnt/workspace", "/mnt/workspace/_shared")` and `destructive_guard.py` still tested
 * `path == "/mnt/workspace"`. Measured against the published bundle:
 * `rm -rf /mnt/workspace` denied, `rm -rf /mnt/workspace-shared` and
 * `rm -rf /mnt/workspaces` NO VERDICT.
 *
 * A declaration nothing reads is the reassuring shape of this defect, and the arms below
 * exist because `hook_core.py` cannot report it. They read the ENFORCERS.
 */
import fs from "node:fs";
import path from "node:path";

import { UC_ORG_WORKSPACE_MOUNT_ROOT, UC_SHARED_WORKSPACE_SIBLING_ROOT } from "@nexus/types/domain";
import { describe, expect, it } from "vitest";

import { getHookFiles, getSettingsJson } from "../../src/skills-content.generated";

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

function bundledHookFile(hookPath: string): string {
  const entry = getHookFiles().find((f) => f.path === hookPath);
  if (!entry) {
    throw new Error(
      `${hookPath} is not in the shipped hook bundle. A file this check reads being absent ` +
        "is a broken bundle, not a reason to skip the check."
    );
  }
  return entry.content;
}

function bundledHookCore(): string {
  return bundledHookFile("lib/hook_core.py");
}

/**
 * The two files that actually DECIDE. `hook_core.py` is where the shared list is
 * declared; these are where a path is judged against it.
 *
 * The distinction is the whole reason the arms below exist. `@agent-nexus/cli@1.3.0`
 * shipped a bundle in which `hook_core.SANDBOX_WORKSPACE_ROOTS` was present and correct
 * and NEITHER of these files referenced it — the constant was declared and no enforcer
 * consumed it. Every assertion that reads only `hook_core.py` is green over that state,
 * which is exactly what happened: this file's own docblock names these two enforcers and
 * every check in it read a third file.
 */
const ENFORCERS = ["nexus-fs-firewall.py", "lib/destructive_guard.py"] as const;

/**
 * Python source with `#` comments and triple-quoted blocks removed.
 *
 * Load-bearing, not tidiness. `main` mentions `SANDBOX_WORKSPACE_ROOTS` inside prose in
 * both enforcers ("The sandbox roots are `hook_core.SANDBOX_WORKSPACE_ROOTS`, not a
 * literal…"), so a raw `includes()` is satisfied by a SENTENCE ABOUT the fix and cannot
 * tell it from the fix. That is the single commonest way an assertion over a large text
 * passes for the wrong reason, and the state this file must catch is precisely one where
 * the prose is right and the code is not.
 *
 * Over-stripping fails toward a RED, which is the safe direction: it cannot manufacture a
 * pass. `strips prose and keeps code` below pins both directions.
 */
function pythonCodeOnly(source: string): string {
  return source
    .replace(/"""[\s\S]*?"""/g, " ")
    .replace(/'''[\s\S]*?'''/g, " ")
    .replace(/(^|\n)[^\n]*?#[^\n]*/g, (m) => m.split("#")[0]);
}

/** The tool names `settings.json` routes to the firewall on PreToolUse. */
function toolsRoutedToFirewall(): string[] {
  const settings = JSON.parse(getSettingsJson()) as {
    hooks?: { PreToolUse?: { matcher?: string; hooks?: { command?: string }[] }[] };
  };
  const entries = settings.hooks?.PreToolUse ?? [];
  const routed = new Set<string>();
  for (const entry of entries) {
    const hitsFirewall = (entry.hooks ?? []).some((h) =>
      (h.command ?? "").includes("nexus-fs-firewall.py")
    );
    if (!hitsFirewall) continue;
    // A matcher built only from names, `|` and spaces is an exact-name list rather than a
    // regex — `Write|Edit` matches `Write` or `Edit` and never `MultiEdit`. Anything
    // carrying regex metacharacters is a pattern this check cannot enumerate, so it is
    // skipped rather than guessed at.
    const matcher = entry.matcher ?? "";
    if (!/^[A-Za-z0-9_ |,-]+$/.test(matcher)) continue;
    for (const name of matcher.split("|").map((s) => s.trim())) {
      if (name) routed.add(name);
    }
  }
  return [...routed];
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

    // No pending escape. There was one — it returned early when the bundle predated
    // NexusGPT/claude-code-skills-nexus#42 and asserted the lock was exactly the pre-fix
    // sha instead. That was correct while the fix was unlanded and became a hole the
    // moment it shipped: rolling the lock BACK to that one sha would take the early
    // return and pass, over a bundle carrying the fail-open this suite exists to catch.
    // An escape keyed on the defect being present cannot outlive the defect.
    expect(hookCore).toContain("SANDBOX_WORKSPACE_ROOTS");

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
    expect(hookCore).toContain("SANDBOX_WORKSPACE_ROOTS");
    // `/mnt/workspace/_shared` cannot exist under in-sandbox mount-s3: the kernel refuses
    // to attach a mount at a path resolving through a mountpoint-s3 filesystem. It is
    // still COVERED, as a subtree of the org root; it must not come back as a root of its
    // own, because a root entry for it reads as shared-workspace coverage and is not.
    const declaration = /SANDBOX_WORKSPACE_ROOTS\s*=\s*\(([\s\S]*?)\)/.exec(hookCore);
    expect(declaration).not.toBeNull();
    expect(declaration?.[1]).not.toContain(`${UC_ORG_WORKSPACE_MOUNT_ROOT}/_shared`);
  });

  it("strips prose and keeps code (the anchor control for the two arms below)", () => {
    // Both directions. Without the first two, the enforcer arm is satisfied by a docstring
    // and reports the fix present over a bundle that does not have it. Without the third,
    // the stripper could delete everything and the arm would red for the wrong reason.
    expect(pythonCodeOnly("# see SANDBOX_WORKSPACE_ROOTS\nx = 1\n")).not.toContain(
      "SANDBOX_WORKSPACE_ROOTS"
    );
    expect(
      pythonCodeOnly('"""\nThe roots are SANDBOX_WORKSPACE_ROOTS.\n"""\nx = 1\n')
    ).not.toContain("SANDBOX_WORKSPACE_ROOTS");
    expect(pythonCodeOnly("roots = SANDBOX_WORKSPACE_ROOTS\n")).toContain(
      "SANDBOX_WORKSPACE_ROOTS"
    );
  });

  it("every enforcer CONSUMES the shared root list rather than a literal of its own", () => {
    for (const enforcer of ENFORCERS) {
      const code = pythonCodeOnly(bundledHookFile(enforcer));
      expect(
        /SANDBOX_WORKSPACE_ROOTS|under_sandbox_workspace/.test(code),
        `${enforcer} does not reference hook_core's shared root list anywhere in its CODE, ` +
          "so it is judging mount roots against a literal of its own. That is the W69 defect " +
          "exactly: `/mnt/workspace` reads as covering its siblings and covers one member, " +
          'because "/mnt/workspace-shared".startsWith("/mnt/workspace/") is false. Land ' +
          "NexusGPT/claude-code-skills-nexus#45 and bump packages/cli/skills-nexus.lock — a " +
          "root the enforcers do not consult is a root they do not guard."
      ).toBe(true);
    }
  });

  it("the firewall examines every tool settings.json routes to it", () => {
    // A matcher is an exact-name list, so widening it does not widen the adapter: shipped
    // 1.3.0 routed `Write|Edit|MultiEdit|NotebookEdit` to the firewall while the adapter
    // tested `("Write", "Edit")`, and the two extra tools arrived and left unexamined. The
    // config then DECLARED coverage the code did not perform, which is worse than not
    // routing them at all — the wiring is where a reader checks.
    const firewall = pythonCodeOnly(bundledHookFile("nexus-fs-firewall.py"));
    const routed = toolsRoutedToFirewall();

    // Control: an empty routed set would make the loop below vacuous, and a matcher
    // rename upstream is exactly how that happens silently.
    expect(routed.length).toBeGreaterThanOrEqual(3);
    expect(routed).toContain("Bash");

    for (const tool of routed) {
      expect(
        firewall.includes(`"${tool}"`),
        `settings.json routes ${tool} to nexus-fs-firewall.py and the adapter never names ` +
          `it, so every ${tool} call reaches the firewall and falls straight through ` +
          "unexamined. Either the adapter must handle it or the matcher must stop claiming it."
      ).toBe(true);
    }
  });
});
