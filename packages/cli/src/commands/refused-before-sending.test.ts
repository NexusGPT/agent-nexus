import { fileURLToPath } from "node:url";

import { Command, CommanderError } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../exit-codes";

/**
 * A metadata key the API refuses and a reranker name outside the contract are
 * refused by the CLI BEFORE ANY REQUEST, driven through the real commands.
 *
 * Every client method these commands can reach records its call, so "refused
 * locally" is asserted as zero recorded calls, and each refusal case has a
 * control that sends the same command with a valid value and sees one call.
 */

const sent: string[] = [];

function record(method: string): () => Promise<{ id: string; name: string }> {
  return () => {
    sent.push(method);
    return Promise.resolve({ id: "doc-1", name: "doc" });
  };
}

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    createClient: () => ({
      documents: {
        uploadFile: record("documents.uploadFile"),
        createText: record("documents.createText"),
        addWebsite: record("documents.addWebsite"),
        update: record("documents.update")
      },
      skills: {
        updateCollection: record("skills.updateCollection"),
        queryCollection: record("skills.queryCollection")
      }
    })
  };
});

import { registerCollectionCommands } from "./collection";
import { registerDocumentCommands } from "./document";

const ID = "11111111-1111-4111-8111-111111111111";
const THIS_FILE = fileURLToPath(import.meta.url);

interface Outcome {
  readonly exitCode: number | undefined;
  readonly printed: string;
}

async function run(argv: readonly string[]): Promise<Outcome> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  let printed = "";
  program.configureOutput({
    writeOut: (text) => {
      printed += text;
    },
    writeErr: (text) => {
      printed += text;
    }
  });
  registerDocumentCommands(program);
  registerCollectionCommands(program);

  const capture = (...parts: unknown[]): void => {
    printed += parts.map(String).join(" ");
  };
  const logSpy = vi.spyOn(console, "log").mockImplementation(capture);
  const errSpy = vi.spyOn(console, "error").mockImplementation(capture);
  process.exitCode = undefined;
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
    return { exitCode: Number(process.exitCode ?? 0), printed };
  } catch (error) {
    if (error instanceof CommanderError) return { exitCode: error.exitCode, printed };
    throw error;
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.exitCode = undefined;
  }
}

const METADATA_LEAVES: ReadonlyArray<{
  readonly leaf: string;
  readonly argv: readonly string[];
  readonly method: string;
}> = [
  { leaf: "upload", argv: ["document", "upload", THIS_FILE], method: "documents.uploadFile" },
  {
    leaf: "create-text",
    argv: ["document", "create-text", "--name", "n", "--content", "hello"],
    method: "documents.createText"
  },
  {
    leaf: "add-website",
    argv: ["document", "add-website", "--url", "https://example.com", "--mode", "crawl"],
    method: "documents.addWebsite"
  },
  { leaf: "update", argv: ["document", "update", ID], method: "documents.update" }
];

beforeEach(() => {
  sent.length = 0;
});

describe("a filter key the API refuses never leaves the machine", () => {
  // The filter parser applies the same key rule as the metadata parser, so
  // `collection query --filter` refuses locally what the route answers 400 to.
  const QUERY = ["collection", "query", ID, "--query", "pricing"];

  it("collection query refuses --filter _x=y with no request", async () => {
    const outcome = await run([...QUERY, "--filter", "_x=y"]);

    expect(sent).toEqual([]);
    expect(outcome.exitCode).toBe(EXIT_CODES["invalid-input"]);
    expect(outcome.printed).toContain('Metadata key "_x" is refused');
  });

  it("CONTROL: collection query sends --filter region=eu", async () => {
    await run([...QUERY, "--filter", "region=eu"]);

    expect(sent).toEqual(["skills.queryCollection"]);
  });
});

describe("a metadata key the API refuses never leaves the machine", () => {
  for (const { leaf, argv, method } of METADATA_LEAVES) {
    it(`document ${leaf} refuses --metadata _priority=high with no request`, async () => {
      const outcome = await run([...argv, "--metadata", "_priority=high"]);

      expect(sent).toEqual([]);
      expect(outcome.exitCode).toBe(EXIT_CODES["invalid-input"]);
      expect(outcome.printed).toContain('Metadata key "_priority" is refused');
    });

    it(`document ${leaf} refuses a 65-character key with no request`, async () => {
      const outcome = await run([...argv, "--metadata", `${"k".repeat(65)}=x`]);

      expect(sent).toEqual([]);
      expect(outcome.exitCode).toBe(EXIT_CODES["invalid-input"]);
    });

    it(`CONTROL: document ${leaf} sends --metadata priority=high`, async () => {
      await run([...argv, "--metadata", "priority=high"]);

      expect(sent).toEqual([method]);
    });
  }
});

describe("a reranker outside the contract never leaves the machine", () => {
  it("collection update refuses --reranker zerank-1 with the allowed list and no request", async () => {
    const outcome = await run(["collection", "update", ID, "--reranker", "zerank-1"]);

    expect(sent).toEqual([]);
    expect(outcome.exitCode).not.toBe(0);
    expect(outcome.printed).toContain(
      "Allowed choices are cohere-rerank-4-fast, bge-reranker-v2-m3, pinecone-rerank-v0"
    );
  });

  it("CONTROL: collection update sends --reranker bge-reranker-v2-m3", async () => {
    await run(["collection", "update", ID, "--reranker", "bge-reranker-v2-m3"]);

    expect(sent).toEqual(["skills.updateCollection"]);
  });
});
