import assert from "node:assert/strict";

import { test } from "vitest";

import { examplesIn, invocationsIn } from "./help-truth-scan";

/**
 * THE EXTRACTOR BEHIND THE `--help` EXAMPLE POPULATION (NEX-3714).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE EXTRACTOR NEEDS ITS OWN GATE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `help-truth.test.ts` asserts that no example is REFUSED. An extractor that
 * quietly returns fewer invocations passes that assertion perfectly — it is the
 * cheapest way there is to make the whole gate green, and nothing downstream can
 * tell a clean corpus from an uncollected one.
 *
 * That is not hypothetical. The collection rule was `line.startsWith("$ nexus ")`
 * until 2026-08-15, and it dropped 22 printed invocations: every piped form
 * (`cat prompt.md | nexus agent create … --prompt -`) and every command
 * substitution (`eval "$(nexus auth switch work --session)"`). TWELVE of the 22
 * were the `-`-stdin shapes, which is precisely the population NEX-3714 is
 * about — the body-carrying example a caller copies BECAUSE the body is the hard
 * part. The gate reported those namespaces clean without ever parsing them.
 *
 * So the cases below are the shapes, one assertion each. The report-level floor
 * in `help-truth.test.ts` catches a collection that collapses; these catch one
 * that gets a single shape wrong.
 */

test("a piped example is an invocation, and the pipe is not part of it", () => {
  const [found, ...rest] = invocationsIn(
    "$ cat prompt.md | nexus agent create --first-name Ada --prompt -"
  );

  assert.deepEqual(rest, [], "the upstream `cat` is not a second invocation");
  assert.deepEqual(found?.argv, ["agent", "create", "--first-name", "Ada", "--prompt", "-"]);
  // `cat <file>` names bytes this scan cannot read. `undefined` is that, and it
  // is deliberately not the empty document — the two lead to opposite verdicts
  // on a `--body -` example.
  assert.equal(found?.stdin, undefined);
});

test("an `echo` upstream STATES the document, so the parse can use it", () => {
  const [found] = invocationsIn(`$ echo '{"name":"Ada"}' | nexus role create --body -`);

  assert.deepEqual(found?.argv, ["role", "create", "--body", "-"]);
  assert.equal(found?.stdin, '{"name":"Ada"}');
});

test("a DOWNSTREAM pipe leaves one invocation, marked truncated", () => {
  const [found, ...rest] = invocationsIn("$ nexus tracing generation abc --json | jq -r .prompt");

  assert.deepEqual(rest, [], "`jq` is not an invocation of this CLI");
  assert.deepEqual(found?.argv, ["tracing", "generation", "abc", "--json"]);
  assert.equal(found?.truncated, true, "the tail was cut, and the counter must know");
  assert.equal(found?.stdin, undefined, "nothing upstream feeds it");
});

test("a command substitution is an invocation wherever it is buried", () => {
  const found = invocationsIn(`$ cfg=$(nexus agent-tool get 1111 2222 --json | jq -c '.config')`);

  assert.equal(found.length, 1);
  assert.deepEqual(found[0]?.argv, ["agent-tool", "get", "1111", "2222", "--json"]);
});

test("one line can hold TWO invocations, and both are judged", () => {
  const found = invocationsIn(`$ nexus user-group update 1111 --name "$(nexus user-group list)"`);

  assert.equal(found.length, 2, "the outer command and the one that computes its argument");
  assert.deepEqual(found[0]?.argv.slice(0, 2), ["user-group", "update"]);
  assert.deepEqual(found[1]?.argv, ["user-group", "list"]);
});

test("an UNQUOTED substitution is one argument to the outer command, not four", () => {
  // A shell hands the outer command a single argument here however many words
  // the inner one spans. Tokenising the raw line instead would give the outer
  // command `$(nexus`, `user-group`, `list)` as three operands and get it
  // refused for excess arguments — the scanner's defect, reported as the help's.
  const found = invocationsIn(`$ nexus user-group update 1111 --name $(nexus user-group list)`);

  assert.equal(found.length, 2);
  assert.deepEqual(found[0]?.argv, ["user-group", "update", "1111", "--name", "$SUBSTITUTION"]);
  assert.deepEqual(found[1]?.argv, ["user-group", "list"]);
});

test("an `xargs` template is an invocation, and its `{}` is not an id", () => {
  // `prompt-assistant delete-thread`'s Notes print the one-call-per-id loop that
  // stands in for the bulk delete this namespace does not have. xargs rewrites
  // `{}` per input line, so the token never reaches the CLI — read as a literal
  // it is a UUID slot holding `{}`, and R4 then reports the shell's own syntax
  // as a defect in a help block that is genuinely runnable as printed.
  const found = invocationsIn(
    `$ nexus prompt-assistant list-threads --json | jq -r '.data[] | .threadId' ` +
      `| xargs -n1 -I{} nexus prompt-assistant delete-thread {} --yes`
  );

  assert.equal(found.length, 2, "`jq` is not an invocation of this CLI");
  assert.deepEqual(found[0]?.argv, ["prompt-assistant", "list-threads", "--json"]);
  assert.equal(found[0]?.substituted, undefined, "an ordinary stage substitutes nothing");
  assert.deepEqual(found[1]?.argv, ["prompt-assistant", "delete-thread", "{}", "--yes"]);
  assert.equal(found[1]?.substituted, "{}", "the token xargs fills in, so R4 and R6 skip it");

  // The same flag with a space in it, which every xargs accepts and one half of
  // the corpus could be written with.
  const [spaced] = invocationsIn("$ cat ids.txt | xargs -I % nexus role get % --json");
  assert.equal(spaced?.substituted, "%");
});

test("a line that merely NAMES nexus is not an invocation of it", () => {
  // `workspace restore`'s help sets the scene with `rm ~/nexus/support-docs/…`.
  // A substring match would promote that into a command and then report the
  // refusal of a file path as a help defect. The token has to BE `nexus`.
  assert.deepEqual(invocationsIn("$ rm ~/nexus/support-docs/notes/probe.md"), []);
});

test("a wrapped example is rejoined before anything looks at it", () => {
  const help = ["Examples:", "  $ cat p.md | nexus task create \\", "      --name Classify"].join(
    "\n"
  );

  const [example] = examplesIn(help);
  assert.equal(example, "$ cat p.md | nexus task create --name Classify");
  assert.deepEqual(invocationsIn(example ?? "")[0]?.argv, ["task", "create", "--name", "Classify"]);
});

test("collection is by `$ `, so a non-nexus line reaches the extractor and dies there", () => {
  // The two halves of the rule: `examplesIn` is generous (every `$ ` line) and
  // `invocationsIn` is strict (a `nexus` token). Putting the strictness in the
  // second one is what lets a piped example through without also letting `rm` in.
  const help = ["Examples:", "  $ rm ~/nexus/x", "  $ nexus workspace restore docs"].join("\n");

  assert.equal(examplesIn(help).length, 2);
  assert.equal(examplesIn(help).flatMap(invocationsIn).length, 1);
});
