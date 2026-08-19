import assert from "node:assert/strict";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { beforeAll, test } from "vitest";

import { buildProgram, parseExample, tokenize } from "./help-truth-scan";

/**
 * FOUR FLAGS THAT WERE DECLARED OPTIONAL AND REFUSED WHEN ABSENT (NEX-3925).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A PARSE TEST AND NOT AN ASSERTION ABOUT THE DECLARATION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Reading `.requiredOption` out of the source proves the source says it. It does
 * not prove a caller is refused, and the two came apart for months precisely
 * because nobody checked the second one: the declaration said optional, the
 * action refused, and every gate in this package agreed with the declaration.
 *
 * So each case drives the REAL command tree through commander and asserts on
 * what a caller gets. `parseExample` replaces every action with a stub, so a
 * refusal here is the PARSER refusing — never the action — which is the whole
 * distinction being pinned.
 *
 * ⚠️ THIS TEST FAILS IF `requiredOption` IS REVERTED TO `option`, and that is
 * the point. With `.option()` the parse SUCCEEDS (the stub action never runs, so
 * the action's own refusal is unreachable) and `expectRefused` reds. A test that
 * asserted the source text would pass against a tree that refuses nobody.
 *
 * ⚠️ `flag-defaults-never-overwrite-body.test.ts` DOES NOT COVER THIS, three
 * ways over: `literalDefault()` there takes three arguments, `optionKey()` does
 * not strip a `no-` prefix, and neither looks at a MISSING declaration at all.
 * Do not fold these cases into it.
 */

interface Case {
  /** What a caller types, minus the flag under test. */
  readonly without: string;
  /** The same call with the flag supplied. */
  readonly with: string;
  /** The flag commander must name in its refusal. */
  readonly flag: string;
}

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

const CASES: readonly Case[] = [
  {
    flag: "--operation-id",
    without: `nexus external-tool test-auth ${UUID}`,
    with: `nexus external-tool test-auth ${UUID} --operation-id listItems`
  },
  {
    flag: "--body",
    without: `nexus tool resolve-options ${UUID}`,
    with: `nexus tool resolve-options ${UUID} --body {}`
  },
  {
    flag: "--body",
    without: `nexus task-eval dataset add ${UUID} ${UUID2}`,
    with: `nexus task-eval dataset add ${UUID} ${UUID2} --body {}`
  },
  {
    flag: "--body",
    without: `nexus template generate ${UUID}`,
    with: `nexus template generate ${UUID} --body {}`
  }
];

async function parse(line: string): Promise<{ kind: string; code?: string; message?: string }> {
  const { argv } = tokenize(`$ ${line}`);
  const program = await buildProgram();
  return (await parseExample(program, argv.slice(1))) as {
    kind: string;
    code?: string;
    message?: string;
  };
}

beforeAll(async () => {
  // A control on the harness itself: if `buildProgram` ever stopped registering
  // these namespaces, every case below would "pass" by being refused as an
  // unknown command rather than as a missing flag.
  const ok = await parse(CASES[0]!.with);
  assert.equal(
    ok.kind,
    "ok",
    `the harness cannot parse a VALID call — every case below would be vacuous: ${ok.message}`
  );
});

/**
 * WRAPPED for the same reason the sibling detector test is: vitest registers
 * these eight tests at collection, so an empty `CASES` registers NONE and the
 * file still reports PASSED at exit 0. This gate is the only thing asserting the
 * four flags are refused BY THE PARSER, so a silent zero here reopens NEX-3925
 * with every check still green.
 */
for (const c of eachOrRefuse(
  CASES,
  "CASES \u2014 every flag declared required that a caller must be refused for omitting"
)) {
  const name = c.without.replace(/^nexus /, "").replace(/ [0-9a-f-]{36}/g, " <id>");

  test(`${name} — omitting ${c.flag} is refused BY THE PARSER`, async () => {
    const outcome = await parse(c.without);
    assert.equal(
      outcome.kind,
      "refused",
      `commander accepted the call without ${c.flag}. The declaration is back to ` +
        `.option(), so the refusal has moved into the action where --help cannot see it.`
    );
    assert.equal(
      outcome.code,
      "commander.missingMandatoryOptionValue",
      `refused with ${outcome.code} rather than as a missing required option: ${outcome.message}`
    );
    assert.ok(
      (outcome.message ?? "").includes(c.flag),
      `the refusal does not name ${c.flag}: ${outcome.message}`
    );
  });

  test(`${name} — supplying ${c.flag} parses`, async () => {
    const outcome = await parse(c.with);
    assert.equal(
      outcome.kind,
      "ok",
      `supplying ${c.flag} was still refused (${outcome.code}): ${outcome.message}`
    );
  });
}
