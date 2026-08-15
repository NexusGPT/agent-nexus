import { AssetsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * `nexus asset delete` must surface `objectRemoved`.
 *
 * Deleting an asset is TWO operations. The record is soft-deleted, then the
 * stored object is reclaimed — and the second one is allowed to fail without
 * failing the request. The object is what serves the public URL (stored
 * public-read, URL points straight at it), so `objectRemoved: false` means the
 * URL IS STILL SERVING and that field is the only thing that says so.
 *
 * The command used to run `await client.assets.delete(id)` and drop the
 * response, under a help note promising in capitals that the URL stops serving.
 * So the one signal the backend deliberately preserves was unreachable from this
 * client, `--json` included (NEX-3850).
 *
 * Driven through the real `AssetsResource` rather than a mocked one, following
 * `deployment-folder-unassign.test.ts`: mocking the resource would assert that
 * the CLI calls a function, which was never in doubt. What is in doubt is what
 * the CLI does with what comes BACK, so the stub sits at the transport and the
 * real resource types and returns the document.
 */
const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({ assets: new AssetsResource({ request } as never) })
}));

import { registerAssetCommands } from "./asset";

const ASSET_ID = "11111111-1111-1111-1111-111111111111";
const URL = "https://bucket.s3.amazonaws.com/orgs/org_1/assets/abc/logo.svg";

let stdout: string[];
let stderr: string[];

/**
 * `printSuccess` writes through `console.log` and `printWarning` through
 * `process.stderr.write`, and the split is the behaviour under test — a warning
 * on stdout would contaminate the `--json` document. Capture them separately so
 * a test can never satisfy itself from the wrong stream.
 */
async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerAssetCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

beforeEach(() => {
  vi.clearAllMocks();
  stdout = [];
  stderr = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(" "));
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("nexus asset delete surfaces objectRemoved", () => {
  describe("when the stored object was NOT removed", () => {
    beforeEach(() => {
      request.mockResolvedValue({
        id: ASSET_ID,
        deleted: true,
        objectRemoved: false,
        url: URL
      });
    });

    it("puts objectRemoved and the url in the --json document", async () => {
      await run(["asset", "delete", ASSET_ID, "--yes"]);

      const doc: unknown = JSON.parse(stdout.join("\n"));
      expect(doc).toMatchObject({ id: ASSET_ID, objectRemoved: false, url: URL });
    });

    it("warns on STDERR that the public URL is still serving, and names it", async () => {
      await run(["asset", "delete", ASSET_ID, "--yes"]);

      const warning = stderr.join("");
      expect(warning).toContain("still serving");
      expect(warning).toContain(URL);
    });

    /**
     * The warning must not reach stdout: the root `--help` promises `--json`
     * prints ONE document there and nothing else, so a warning written to stdout
     * would break every consumer parsing it — trading one lie for another.
     */
    it("keeps the warning off STDOUT so the --json document stays parseable", async () => {
      await run(["asset", "delete", ASSET_ID, "--yes"]);

      expect(() => JSON.parse(stdout.join("\n"))).not.toThrow();
      expect(stdout.join("\n")).not.toContain("still serving");
    });

    /**
     * Deliberate, and the help says so. The request succeeded and the record
     * really is deleted, and the root `--help` binds exit 1 to a failure that
     * carries an error document on stdout — which this call does not have.
     * Exiting 1 here would be a second contract lie, so the signal is the
     * warning plus the field.
     */
    it("does not fail the command — the record IS deleted", async () => {
      await run(["asset", "delete", ASSET_ID, "--yes"]);

      expect(process.exitCode).toBeUndefined();
    });

    /**
     * The command must not offer a retry it cannot perform: the record is
     * soft-deleted, so a second DELETE answers 404 "Asset not found", which
     * reads like confirmation the asset is gone.
     */
    it("says re-running will not retry the reclaim", async () => {
      await run(["asset", "delete", ASSET_ID, "--yes"]);

      const warning = stderr.join("");
      expect(warning).toMatch(/not retry|NOT retry/);
      expect(warning).toContain("404");
    });
  });

  describe("when the stored object WAS removed", () => {
    beforeEach(() => {
      request.mockResolvedValue({
        id: ASSET_ID,
        deleted: true,
        objectRemoved: true,
        url: URL
      });
    });

    it("reports objectRemoved: true and warns about nothing", async () => {
      await run(["asset", "delete", ASSET_ID, "--yes"]);

      expect(JSON.parse(stdout.join("\n"))).toMatchObject({ objectRemoved: true });
      expect(stderr.join("")).toBe("");
    });
  });

  it("sends the delete to the asset route", async () => {
    request.mockResolvedValue({ id: ASSET_ID, deleted: true, objectRemoved: true, url: URL });

    await run(["asset", "delete", ASSET_ID, "--yes"]);

    expect(request).toHaveBeenCalledWith("DELETE", `/assets/${ASSET_ID}`);
  });
});
