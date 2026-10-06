/**
 * The bundle delta the release PR body carries, driven by the `settings.json`
 * change that was actually pending on 2026-10-06: upstream 8d1cd619e8 →
 * 0d58ef8787 widened `allow` from `Bash(nexus:*)`/`jq`/`git` to bare `Bash` and
 * removed `defaultMode: acceptEdits` (upstream 5ed4db28ed, 87755521da,
 * 1505e6695f). Both files are recorded under `fixtures/publish-pin/`; re-derive:
 *
 *   gh api "repos/NexusGPT/claude-code-skills-nexus/contents/settings.json?ref=<sha>" --jq .content | base64 -d
 *
 * The property under test is that a reviewer reading the release PR is TOLD this,
 * by name, before it ships.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { type BundlePayload, renderBundleDelta } from "../../scripts/skills-drift/bundle-delta";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "publish-pin");
const SETTINGS_BEFORE = fs
  .readFileSync(path.join(FIXTURES, "settings-8d1cd619e8.json"), "utf-8")
  .trim();
const SETTINGS_AFTER = fs
  .readFileSync(path.join(FIXTURES, "settings-0d58ef8787.json"), "utf-8")
  .trim();

function payload(sha: string, over: Partial<BundlePayload> = {}): BundlePayload {
  return {
    sha,
    SKILLS: { "nexus-a": { files: [{ path: "SKILL.md", content: "# A" }] } },
    CLAUDE_MD: "# Root",
    SHARED_FILES: [],
    SETTINGS_JSON: SETTINGS_BEFORE,
    HOOK_FILES: [{ path: "guard.py", content: "pass" }],
    AGENT_FILES: [],
    ...over
  };
}

const BEFORE = payload("8d1cd619e8fba201896b279fb171f8fd06097afa");
const AFTER = payload("0d58ef878728bf28e39858ef09db65917082d372", {
  SETTINGS_JSON: SETTINGS_AFTER
});

/** The permission table's rows, parsed — never a substring of the whole body. */
function permissionRows(markdown: string): string[][] {
  return markdown
    .split("\n")
    .filter((l) => /^\| (\*\*added\*\* to|removed from|`defaultMode`)/.test(l))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim())
    );
}

describe("the release PR is told about a permission change before it ships", () => {
  const md = renderBundleDelta(BEFORE, AFTER);
  const rows = permissionRows(md);

  it("names bare `Bash` as ADDED to allow", () => {
    expect(rows).toContainEqual(["**added** to `allow`", "`Bash`"]);
  });

  it("names every scoped Bash rule it replaces as REMOVED", () => {
    for (const rule of ["Bash(nexus:*)", "Bash(jq:*)", "Bash(git:*)"]) {
      expect(rows).toContainEqual(["removed from `allow`", `\`${rule}\``]);
    }
  });

  it("names the defaultMode change, acceptEdits → unset", () => {
    expect(rows).toContainEqual(["`defaultMode`", "`acceptEdits` → `(unset)`"]);
  });

  it("lists nothing that did not change — the two scoped Read/Edit rules survive", () => {
    // The discriminating half: a renderer that listed every entry of both files
    // would satisfy the arms above.
    expect(rows.map((r) => r[1])).not.toContain("`Read(~/nexus/**)`");
    expect(rows.map((r) => r[1])).not.toContain("`Edit(~/nexus/**)`");
  });

  it("links the exact upstream range", () => {
    expect(md).toContain(
      "https://github.com/NexusGPT/claude-code-skills-nexus/compare/8d1cd619e8fba201896b279fb171f8fd06097afa...0d58ef878728bf28e39858ef09db65917082d372"
    );
  });
});

describe("hooks and skills", () => {
  it("names an added, a removed and a modified hook, each once", () => {
    const md = renderBundleDelta(
      payload("a".repeat(40), {
        HOOK_FILES: [
          { path: "guard.py", content: "pass" },
          { path: "old.py", content: "x" }
        ]
      }),
      payload("b".repeat(40), {
        HOOK_FILES: [
          { path: "guard.py", content: "pass\nblock()" },
          { path: "new.py", content: "y" }
        ]
      })
    );
    const hookRows = md.split("\n").filter((l) => l.startsWith("- `hooks/"));
    expect(hookRows).toEqual([
      "- `hooks/guard.py` — modified (+1 −0)",
      "- `hooks/new.py` — **added** (+1 −0)",
      "- `hooks/old.py` — **removed** (+0 −1)"
    ]);
  });

  it("counts a new skill", () => {
    const md = renderBundleDelta(
      payload("a".repeat(40)),
      payload("b".repeat(40), {
        SKILLS: {
          "nexus-a": { files: [{ path: "SKILL.md", content: "# A" }] },
          "nexus-b": { files: [{ path: "SKILL.md", content: "# B" }] }
        }
      })
    );
    expect(md.split("\n")).toContain("- `nexus-b` — **new skill**, 1 file(s)");
  });
});

describe("an unchanged bundle says so in one line, and differently", () => {
  it("does not render a permission table when the pin did not move", () => {
    const md = renderBundleDelta(BEFORE, BEFORE);
    expect(md).toContain("Unchanged");
    expect(permissionRows(md)).toEqual([]);
  });

  it("CONTROL — the same settings change under a moved pin does render rows", () => {
    expect(permissionRows(renderBundleDelta(BEFORE, AFTER)).length).toBeGreaterThan(3);
  });
});
