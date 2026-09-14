import { describe, expect, it } from "vitest";

import { buildCorpusFromFiles } from "./build-corpus";

const SHA = "c".repeat(40);

function corpusOf(files: Record<string, string>) {
  return buildCorpusFromFiles(SHA, {
    paths: Object.keys(files),
    read: (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`read a file that is not there: ${path}`);
      return content;
    }
  });
}

describe("buildCorpusFromFiles", () => {
  it("selects nexus-* skills, collects shared/, hooks/, agents/ and the two root files", () => {
    const corpus = corpusOf({
      "skills/nexus-b/SKILL.md": "---\nname: b\n---\n# B\n\nThe b skill.\n",
      "skills/nexus-a/SKILL.md": "# A\n\nThe a skill.",
      "skills/shared/api-client.ts": "export {};\n",
      "skills/plain/SKILL.md": "not bundled",
      "hooks/guard.py": "#!/usr/bin/env python3\n",
      "agents/app-rig.md": "rig\n",
      "CLAUDE.md": "\n# Root\n\n",
      "settings.json": "{}\n",
      "cli-compat.json": '{ "minCliVersion": "1.5.0" }',
      "tools/ignored.py": "not collected"
    });

    expect(corpus.commitSha).toBe(SHA);
    expect(corpus.skillList).toEqual(["nexus-a", "nexus-b"]);
    expect(corpus.skills["nexus-b"].description).toBe("The b skill.");
    expect(corpus.sharedFiles).toEqual([{ path: "api-client.ts", content: "export {};" }]);
    expect(corpus.hookFiles).toEqual([{ path: "guard.py", content: "#!/usr/bin/env python3" }]);
    expect(corpus.agentFiles).toEqual([{ path: "app-rig.md", content: "rig" }]);
    expect(corpus.claudeMd).toBe("# Root");
    expect(corpus.settingsJson).toBe("{}");
  });

  it("never reads a file that does not ship", () => {
    const read: string[] = [];
    buildCorpusFromFiles(SHA, {
      paths: ["skills/nexus-a/SKILL.md", "skills/plain/logo.png", "tools/x.bin", "hooks/.DS_Store"],
      read: (path) => {
        read.push(path);
        return "# A";
      }
    });
    expect([...new Set(read)]).toEqual(["skills/nexus-a/SKILL.md"]);
  });

  it("skips dot-named segments, __pycache__ and .pyc below a collected root", () => {
    const corpus = corpusOf({
      "hooks/lib/core.py": "core",
      "hooks/lib/__pycache__/core.cpython-312.pyc": "x",
      "hooks/lib/core.pyc": "x",
      "hooks/.observe-hold": "x",
      "hooks/.cache/state.json": "x"
    });
    expect(corpus.hookFiles.map((f) => f.path)).toEqual(["lib/core.py"]);
  });

  it("orders files the way a directory walk visits them, not as plain strings", () => {
    // `-` sorts before `/`, so a string sort would put b-x.md first. A walk lists
    // the directory `b` before the file `b-x.md` and visits b/y.md first.
    const corpus = corpusOf({ "agents/b-x.md": "1", "agents/b/y.md": "2", "agents/a.md": "3" });
    expect(corpus.agentFiles.map((f) => f.path)).toEqual(["a.md", "b/y.md", "b-x.md"]);
  });

  it("answers empty strings for root files the commit does not have", () => {
    const corpus = corpusOf({ "skills/nexus-a/SKILL.md": "# A" });
    expect(corpus.claudeMd).toBe("");
    expect(corpus.settingsJson).toBe("");
    expect(corpus.skills["nexus-a"].description).toBe("");
  });
});
