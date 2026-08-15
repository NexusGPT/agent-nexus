import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `collection search --include-metadata` — ASSERTED ON THE REQUEST BODY.
 *
 * The route has accepted `includeMetadata` since NEX-3228:
 * `SearchCollectionBodySchema` declares it, the controller destructures it, and
 * `SkillsRepositoryAdapter.searchCollection` reads the document's
 * `searchMetadata` column when it is true. The CLI declared no flag and sent no
 * field, so every hit came back `metadata: null` at 200 — the shipped `--help`
 * then explained the null as an API limitation rather than a missing flag.
 *
 * Every case here inspects the BODY the SDK was handed. A test that only asserts
 * the command exited 0 passes against the original defect: the call succeeded
 * the whole time, it just carried nothing.
 */

const searched: Array<{ collectionId: string; body: Record<string, unknown> }> = [];
const queried: Array<{ collectionId: string; body: Record<string, unknown> }> = [];
const searchedMultiple: Array<Record<string, unknown>> = [];

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    createClient: () => ({
      skills: {
        searchCollection: (collectionId: string, body: Record<string, unknown>) => {
          searched.push({ collectionId, body });
          return Promise.resolve({ results: [] });
        },
        queryCollection: (collectionId: string, body: Record<string, unknown>) => {
          queried.push({ collectionId, body });
          return Promise.resolve({ results: [] });
        },
        searchMultipleCollections: (body: Record<string, unknown>) => {
          searchedMultiple.push(body);
          return Promise.resolve({ results: [] });
        }
      }
    })
  };
});

import { registerCollectionCommands } from "./collection";

const COLLECTION_ID = "11111111-1111-4111-8111-111111111111";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON");
  registerCollectionCommands(program);

  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.exitCode = undefined;
  }
}

beforeEach(() => {
  searched.length = 0;
  queried.length = 0;
  searchedMultiple.length = 0;
});

describe("collection search", () => {
  it("sends includeMetadata: true when --include-metadata is given", async () => {
    await run(["collection", "search", COLLECTION_ID, "--query", "invoice", "--include-metadata"]);

    expect(searched).toHaveLength(1);
    expect(searched[0].collectionId).toBe(COLLECTION_ID);
    expect(searched[0].body).toMatchObject({ query: "invoice", includeMetadata: true });
  });

  it("leaves includeMetadata undefined when the flag is absent, so the route default decides", async () => {
    await run(["collection", "search", COLLECTION_ID, "--query", "invoice"]);

    expect(searched).toHaveLength(1);
    // Not `false`: the CLI must not overwrite the schema's own `.default(false)`
    // with a value the operator never typed. `undefined` is dropped by
    // JSON.stringify, so the route sees an absent key.
    expect(searched[0].body.includeMetadata).toBeUndefined();
  });

  it("carries the flag alongside --limit, so neither displaces the other", async () => {
    await run([
      "collection",
      "search",
      COLLECTION_ID,
      "--query",
      "pricing",
      "--limit",
      "5",
      "--include-metadata"
    ]);

    expect(searched[0].body).toMatchObject({
      query: "pricing",
      limit: 5,
      includeMetadata: true
    });
  });

  it("CONTROL: the flag is declared on the command, not swallowed by the root program", () => {
    const program = new Command();
    program.name("nexus").option("--json", "Output as JSON");
    registerCollectionCommands(program);

    const collection = program.commands.find((c) => c.name() === "collection");
    const search = collection?.commands.find((c) => c.name() === "search");
    const names = search?.options.map((o) => o.long) ?? [];

    // Without this, a typo in the flag spelling above would make commander treat
    // `--include-metadata` as an unknown option — and the action would still run
    // with `includeMetadata` undefined, which is the pre-fix behaviour wearing a
    // green tick.
    expect(names).toContain("--include-metadata");
    expect(names).toContain("--query");
  });
});

describe("collection query", () => {
  it("CONTROL: the sibling flag that already worked still reaches the body", async () => {
    await run([
      "collection",
      "query",
      COLLECTION_ID,
      "--query",
      "how do I reset my PIN?",
      "--include-metadata"
    ]);

    expect(queried[0].body).toMatchObject({ includeMetadata: true });
  });
});

describe("collection search-multiple", () => {
  /**
   * The route genuinely has no `includeMetadata`:
   * `SearchMultipleCollectionsBodySchema` omits the field and the repository
   * hardcodes `metadata: null`. So the absence of a flag here is correct, and
   * `--help` says so. This case pins that asymmetry — a future copy-paste of the
   * single-collection fix onto this command would send a key the schema strips.
   */
  it("sends no includeMetadata, because the route carries no such field", async () => {
    await run([
      "collection",
      "search-multiple",
      "--query",
      "pricing",
      "--collection-ids",
      COLLECTION_ID
    ]);

    expect(searchedMultiple).toHaveLength(1);
    expect(searchedMultiple[0]).not.toHaveProperty("includeMetadata");
  });
});
