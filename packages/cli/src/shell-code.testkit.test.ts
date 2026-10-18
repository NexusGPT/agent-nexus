/**
 * `shell-code.testkit.ts`: the shell reader every shell presence pin projects
 * through, and the `#` predicate it restates.
 *
 * The predicate is restated rather than imported because the public mirror
 * ships every `packages/cli/src/` file and strips `@nexus/types`. A spec is not
 * shipped, so it may import the shared predicate, and it holds the copy EQUAL
 * to it so the two cannot drift.
 *
 * Every `shellCode` arm that blanks a carrier is paired with a control the same
 * shape keeps, because a reader that blanked everything would pass the refusals.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isHashCommentLine } from "@nexus/types/testing/hash-comments";
import { describe, expect, it } from "vitest";

import { isShellCommentLine, shellCode } from "./shell-code.testkit";
import { atStatement } from "./source-code.testkit";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");

/** Spellings at the edge of "full-line comment", each one a different answer path. */
const EDGES = [
  "#",
  "# x",
  "   # x",
  "\t# x",
  "#!/usr/bin/env bash",
  "x # y",
  "$#",
  "${x#y}",
  '"# x"',
  "",
  "  "
];

describe("the testkit's `#` predicate is the shared one", () => {
  it("agrees with `isHashCommentLine` on every line of the scripts the pins read", () => {
    for (const script of ["sweep.sh", "seed-sweep-fixtures.sh"]) {
      const lines = readFileSync(join(SCRIPTS, script), "utf8").split("\n");
      // The floor: an unreadable or emptied script would make the loop vacuous.
      expect(lines.filter((line) => isHashCommentLine(line)).length, script).toBeGreaterThan(0);
      expect(lines.filter((line) => !isHashCommentLine(line)).length, script).toBeGreaterThan(0);
      for (const line of lines) {
        expect(isShellCommentLine(line), `${script}: ${JSON.stringify(line)}`).toBe(
          isHashCommentLine(line)
        );
      }
    }
  });

  it("agrees on the edge spellings, which answer both ways", () => {
    const shared = EDGES.map((line) => isHashCommentLine(line));
    // The control: a table answering one way only could not show a disagreement.
    expect(shared).toContain(true);
    expect(shared).toContain(false);
    expect(EDGES.map((line) => isShellCommentLine(line))).toEqual(shared);
  });
});

/** `shellCode` of the lines, split back into lines: the projection, line for line. */
const code = (...lines: string[]): string[] => shellCode(lines.join("\n")).split("\n");

const PINNED = 'if is_policy_refusal "$transcript"; then';
const pinned = atStatement(/if is_policy_refusal "\$transcript"; then/);

describe("shellCode keeps the code, line for line", () => {
  it("returns exactly as many lines as it was given, and leaves plain code untouched", () => {
    const script = ["set -u", PINNED, '  echo "$x"', "fi", ""];
    expect(code(...script)).toEqual(script);
  });

  it("blanks a full-line comment and cuts a trailing one, with the space before it", () => {
    expect(code("# " + PINNED, "true # " + PINNED, "  x=1   # note")).toEqual([
      "",
      "true",
      "  x=1"
    ]);
  });

  it("reads a `#` that does not open a word as code", () => {
    const kept = [
      'echo "$#"',
      "n=${#list[@]}",
      "v=${x#prefix}",
      "w=${line%% #*}",
      'echo "a # b"',
      "echo 'a # b'",
      "x=a#b",
      "echo $'it\\'s # here'"
    ];
    expect(code(...kept)).toEqual(kept);
  });
});

describe("shellCode blanks a heredoc", () => {
  it.each([
    ["a quoted word", "cat >/dev/null <<'EOF'", "EOF"],
    ["a bare word", "cat >/dev/null <<EOF", "EOF"],
    ["a double-quoted word", 'python3 <<"PY"', "PY"],
    ["an escaped word", "cat <<\\EOF", "EOF"],
    ["`<<-` and a tab-indented terminator", "\tcat <<-EOF", "\tEOF"]
  ])("with %s: its body and terminator, and nothing after", (_shape, opener, terminator) => {
    expect(code(opener, PINNED, terminator, PINNED)).toEqual([opener, "", "", PINNED]);
  });

  it("ends a plain `<<` heredoc only on an unindented terminator, as bash does", () => {
    expect(code("cat <<EOF", "  EOF", PINNED, "EOF", PINNED)).toEqual([
      "cat <<EOF",
      "",
      "",
      "",
      PINNED
    ]);
  });

  it("reads two heredocs opened on one line in order", () => {
    expect(code("cmd <<A <<'B'", PINNED, "A", PINNED, "B", PINNED)).toEqual([
      "cmd <<A <<'B'",
      "",
      "",
      "",
      "",
      PINNED
    ]);
  });

  it("blanks the rest of the text after an unterminated heredoc, so a pin fails loud", () => {
    expect(code("cat <<EOF", PINNED, "true")).toEqual(["cat <<EOF", "", ""]);
  });

  it("does not open one for a here-string, a shift, or a `<<` in a string or a comment", () => {
    const kept = [
      'read -ra CMD <<< "$x"',
      "n=$(( 1 << width ))",
      "(( mask << bits ))",
      'echo "cat <<EOF"',
      "true # cat <<EOF",
      PINNED
    ];
    expect(code(...kept)).toEqual([...kept.slice(0, 4), "true", PINNED]);
  });
});

describe("shellCode blanks the lines of a multi-line string after its first", () => {
  // A body with no quote in it: a `"` inside a double-quoted string closes it, so a
  // double-quoted carrier cannot hold a statement that has its own `"` (bash agrees).
  const BODY = "run_leaf leaf true";

  it.each([
    ["single", ": '", "'"],
    ["double", 'echo "', '"'],
    ["ANSI-C", "printf $'", "'"]
  ])("a %s-quoted string: the opening line is kept, the rest is blank", (_kind, open, close) => {
    expect(code(open, BODY, close, BODY)).toEqual([open, "", "", BODY]);
  });

  it("keeps the code after the closing quote, at its column", () => {
    expect(code("x='a", "b'; next")).toEqual(["x='a", "  ; next"]);
  });

  it("does not end a double-quoted string on an escaped quote", () => {
    expect(code('echo "a \\"', BODY, '"', BODY)).toEqual(['echo "a \\"', "", "", BODY]);
  });

  it("reads quotes nested in a `$(…)` inside a string as their own pair", () => {
    const kept = ['x="$(printf \'%s\' "it\'s")"', PINNED];
    expect(code(...kept)).toEqual(kept);
  });
});

describe("a statement pin reads shellCode, so no carrier that starts a line satisfies it", () => {
  // CONTROL: the projection keeps the statement where it is code, so a refusal
  // below is the carrier being blanked, never the statement being lost.
  it("finds the statement in code", () => {
    expect(pinned.test(shellCode(`set -u\n${PINNED}\nfi`))).toBe(true);
  });

  // `anchored` is whether the anchor alone already refuses the carrier. The rows
  // where it does not are the ones the projection exists for.
  it.each([
    ["a heredoc body", false, `cat >/dev/null <<'EOF'\n${PINNED}\nEOF\nif false; then`],
    ["a multi-line single-quoted string", false, `: '\n${PINNED}\n'\nif false; then`],
    ["a full-line comment", true, `# ${PINNED}\nif false; then`],
    ["a trailing comment", true, `if false; then # ${PINNED}`]
  ])("refuses %s", (_carrier, anchored, script) => {
    expect(script).toContain(PINNED);
    expect(pinned.test(script)).toBe(!anchored);
    expect(pinned.test(shellCode(script))).toBe(false);
  });
});
