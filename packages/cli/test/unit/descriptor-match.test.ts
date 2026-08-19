import assert from "node:assert/strict";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { beforeAll, test } from "vitest";

import { runHelpTruthScan, type ScanReport } from "./help-truth-rules";
import { descriptorFor, descriptorIndex, sdkRouteIndex } from "./help-truth-scan";

/**
 * A TRAILING INTERPOLATION IS NOT PART OF THE PATH (NEX-3927).
 *
 * `descriptorFor` compares a path segment by segment. A segment that IS a slot
 * (`${id}`) matches a `:var`; anything else is compared literally. The SDK also
 * appends a query string INSIDE the template —
 * `` `/tools/${id}/initiate-client-credentials${query}` `` — so the last segment
 * reads `initiate-client-credentials${query}`: not a slot, and not equal to the
 * contract's literal. The route went unresolved and the command was reported as
 * having NO DESCRIPTOR, while
 * `/public/v1/tools/:toolId/initiate-client-credentials` had existed all along.
 *
 * ⚠️ THIS IS THE THIRD DEFECT IN THE SAME DETECTOR, and each was invisible in
 * the same way: a command whose route does not resolve is not judged by rules
 * 2-4 at all, so it reads as clean rather than as unchecked. The first missed a
 * nested SDK resource (three path segments), the second read one file, this one
 * breaks on a query string.
 *
 * The cases below assert on the MATCH, not on the source text — reading
 * `pathLiteral` out of the file would prove only that the file says it.
 */

interface Case {
  readonly name: string;
  readonly sdk: string;
  readonly contract: string;
  readonly matches: boolean;
}

const CASES: readonly Case[] = [
  {
    name: "a query string appended to a LITERAL segment",
    sdk: "/tools/${id}/initiate-client-credentials${query}",
    contract: "/public/v1/tools/:toolId/initiate-client-credentials",
    matches: true
  },
  {
    name: "a query string appended to a SLOT segment (already worked)",
    sdk: "/skills/external-tools/${id}${query}",
    contract: "/public/v1/skills/external-tools/:externalToolId",
    matches: true
  },
  {
    name: "a plain slot still matches a :var",
    sdk: "/folders/${folderId}",
    contract: "/public/v1/folders/:folderId",
    matches: true
  },
  {
    name: "a plain literal still matches itself",
    sdk: "/agents",
    contract: "/public/v1/agents",
    matches: true
  },
  {
    // The guard on the fix: dropping the interpolation must not make a segment
    // match a DIFFERENT literal. `initiate` is not `initiate-client-credentials`.
    name: "a literal prefix does NOT match a different literal",
    sdk: "/tools/${id}/initiate${query}",
    contract: "/public/v1/tools/:toolId/initiate-client-credentials",
    matches: false
  },
  {
    // A sibling route must still be refused: this is what the EXACT matcher was
    // written for, and the fix must not reopen it.
    name: "a sibling route is still refused",
    sdk: "/agents/${id}/versions",
    contract: "/public/v1/agents/:agentId/skills",
    matches: false
  }
];

/**
 * The loop is WRAPPED because vitest registers tests from it at collection time
 * and an empty `CASES` would register ZERO — a file reported PASSED over nothing,
 * at exit 0. These cases were run by `tsx --test` until this package folded its
 * two runners into one; node:test's `--test-force-exit` accounting would have
 * shown 0 tests, but vitest's summary shows only the total, and nobody diffs a
 * total. `eachOrRefuse` turns that silent zero into a refusal at collection.
 */
for (const c of eachOrRefuse(
  CASES,
  "CASES \u2014 every path shape the SDK-to-contract matcher must judge"
)) {
  test(`descriptorFor — ${c.name}`, () => {
    const index = new Map([
      [`POST ${c.contract}`, { name: "Probe", method: "POST", path: c.contract }]
    ]);
    const found = descriptorFor(index, { method: "POST", path: c.sdk });
    assert.equal(
      found !== undefined,
      c.matches,
      c.matches
        ? `expected ${c.sdk} to match ${c.contract} and it did not`
        : `expected ${c.sdk} NOT to match ${c.contract} — the matcher is too loose`
    );
  });
}

let report: ScanReport;

beforeAll(async () => {
  report = await runHelpTruthScan();
});

test("the real tree: no command is reported as missing a descriptor it HAS", () => {
  // The tree-level consequence, and the reason the unit cases above are not
  // enough on their own: they prove the comparison, not that the SDK and the
  // contract still spell this route the way they did.
  const missing = report.unresolvedCommands
    .filter((u) => u.reason.includes("no v1 descriptor"))
    .map((u) => `${u.command} — ${u.reason}`);

  assert.deepEqual(
    missing,
    ["deployment duplicate — no v1 descriptor for deployments.duplicate"],
    `the set of commands with no v1 descriptor changed.\n` +
      `  'deployment duplicate' is CORRECT and permanent: the Public API v1 serves no\n` +
      `  POST /deployments/:id/duplicate, the SDK method is @deprecated and typed\n` +
      `  Promise<never>, and the command's own --help says it cannot succeed.\n` +
      `  Anything ELSE here is a detector defect or a genuinely absent contract:\n` +
      missing.map((m) => `    ${m}`).join("\n")
  );
});

test("CONTROL: the indexes the match runs against are not empty", () => {
  // Every case above is vacuous if either index is empty — `descriptorFor` would
  // simply find nothing and the `matches: false` cases would pass for the wrong
  // reason.
  assert.ok(descriptorIndex().size > 300, "the v1 descriptor index is too small to be real");
  assert.ok(sdkRouteIndex().size > 200, "the SDK route index is too small to be real");
});
