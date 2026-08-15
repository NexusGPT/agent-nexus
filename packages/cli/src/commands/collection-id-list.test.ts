/**
 * `--document-ids` and `--collection-ids` parse the SAME comma-separated form.
 *
 * They did not. `attach-documents` split on the comma and sent every entry
 * verbatim, so `"doc-1, doc-2"` reached the route as `[" doc-2"]` and came back
 * as a 404 naming a document id the operator could not find in what they typed.
 * `search-multiple`, in the same file, trimmed. One parser now serves both.
 *
 * WHAT THESE ASSERT, AND WHY IT IS THE REQUEST RATHER THAN THE RESPONSE. The
 * defect is in what the CLI SENDS, so a test that stubs a 404 and checks the
 * exit code passes against the bug — the 404 was real, it was the ids that were
 * wrong. The real SDK resource runs over a fake transport for the same reason:
 * mocking the resource would assert on the mock.
 */

import { SkillsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    skills: new SkillsResource({ request } as never)
  })
}));

import { registerCollectionCommands } from "./collection";

const COLLECTION_ID = "11111111-1111-4111-8111-111111111111";
const DOC_A = "22222222-2222-4222-8222-222222222222";
const DOC_B = "33333333-3333-4333-8333-333333333333";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerCollectionCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

/** The `documentIds` the CLI actually put on the wire for the last call. */
function sentDocumentIds(): unknown {
  const [, , options] = request.mock.calls[0] as [
    string,
    string,
    { body: { documentIds: string[] } }
  ];
  return options.body.documentIds;
}

describe("collection attach-documents — --document-ids", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ message: "ok" });
  });

  it("trims the whitespace around a comma instead of sending it as part of the id", async () => {
    await run([
      "collection",
      "attach-documents",
      COLLECTION_ID,
      "--document-ids",
      `${DOC_A}, ${DOC_B}`
    ]);

    expect(sentDocumentIds()).toEqual([DOC_A, DOC_B]);
  });

  it("drops a trailing comma rather than sending an empty id", async () => {
    await run(["collection", "attach-documents", COLLECTION_ID, "--document-ids", `${DOC_A},`]);

    expect(sentDocumentIds()).toEqual([DOC_A]);
  });

  it("refuses a list that is empty once trimmed, by flag name, without a request", async () => {
    await expect(
      run(["collection", "attach-documents", COLLECTION_ID, "--document-ids", " , "])
    ).rejects.toThrow("--document-ids needs at least one ID");

    expect(request).not.toHaveBeenCalled();
  });

  /**
   * The CLI does NOT de-duplicate: the route does, and it is the layer every
   * client reaches. Asserting the pass-through here is what keeps the two
   * decisions separable — if de-duplication ever moves into the CLI, this test
   * says so out loud rather than hiding the move behind a green server test.
   */
  it("passes a repeated id through untouched, for the route to collapse", async () => {
    await run([
      "collection",
      "attach-documents",
      COLLECTION_ID,
      "--document-ids",
      `${DOC_A},${DOC_A}`
    ]);

    expect(sentDocumentIds()).toEqual([DOC_A, DOC_A]);
  });
});

describe("collection search-multiple — --collection-ids parses identically", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ results: [] });
  });

  it("trims and drops the empty entries, exactly as --document-ids does", async () => {
    await run([
      "collection",
      "search-multiple",
      "--query",
      "pricing",
      "--collection-ids",
      `${DOC_A}, ${DOC_B},`
    ]);

    const [, , options] = request.mock.calls[0] as [
      string,
      string,
      { body: { collectionIds: string[] } }
    ];
    expect(options.body.collectionIds).toEqual([DOC_A, DOC_B]);
  });
});
