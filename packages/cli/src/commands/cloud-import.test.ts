import { CloudImportsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

// Real SDK resource over a fake HTTP client: the point of these tests is which
// URL and query the CLI ends up requesting, so the resource must not be mocked.
const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    cloudImports: new CloudImportsResource({ request } as never)
  })
}));

import { registerCloudImportCommands } from "./cloud-import";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerCloudImportCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

/**
 * Same, in the default table mode, capturing stdout.
 *
 * The tests above all force JSON mode, which is its own output path — a value
 * dropped only from the human-readable rendering is invisible to every one of
 * them.
 */
async function runTable(argv: string[]): Promise<string> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerCloudImportCommands(program);
  setJsonMode(false);

  const chunks: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };

  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    console.log = log;
    setJsonMode(true);
  }

  return chunks.join("\n");
}

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";

/**
 * The per-provider listing endpoints these commands used to call are served by
 * a stub that answers with no files whether or not files exist, and Google
 * Drive's took an access token in the query string. The commands now go through
 * the browsing endpoints, which take a connection id.
 */
describe("cloud-import commands", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ items: [], nextPageToken: undefined });
  });

  it("browses through the provider-agnostic endpoint", async () => {
    await run([
      "cloud-import",
      "browse",
      "notion",
      "--connection-id",
      CONNECTION_ID,
      "--folder-id",
      "db-1"
    ]);

    expect(request).toHaveBeenCalledWith("GET", "/documents/imports/notion/items", {
      query: {
        connectionId: CONNECTION_ID,
        folderId: "db-1",
        siteId: undefined,
        pageToken: undefined
      }
    });
  });

  it("rejects a provider the API does not serve, without calling it", async () => {
    await expect(
      run([
        "cloud-import",
        "browse",
        "dropbox",
        "--connection-id",
        CONNECTION_ID,
        "--folder-id",
        "x"
      ])
    ).resolves.toBeUndefined();

    expect(request).not.toHaveBeenCalled();
  });

  it("searches through the provider-agnostic endpoint", async () => {
    await run([
      "cloud-import",
      "search",
      "google-drive",
      "--connection-id",
      CONNECTION_ID,
      "--query",
      "budget"
    ]);

    expect(request).toHaveBeenCalledWith("GET", "/documents/imports/google-drive/search", {
      query: {
        connectionId: CONNECTION_ID,
        query: "budget",
        folderId: undefined,
        pageToken: undefined
      }
    });
  });

  it("routes google-drive list-files to browse, with no token in the query", async () => {
    await run(["cloud-import", "google-drive", "list-files", "--connection-id", CONNECTION_ID]);

    const [method, path, options] = request.mock.calls[0] ?? [];
    expect([method, path]).toEqual(["GET", "/documents/imports/google-drive/items"]);
    // The old endpoint took `accessToken` — a credential in a URL, which proxies
    // log and browsers keep in history.
    expect(Object.keys((options as { query: Record<string, unknown> }).query)).not.toContain(
      "accessToken"
    );
  });

  it("routes sharepoint list-files to browse, keeping the site id", async () => {
    await run([
      "cloud-import",
      "sharepoint",
      "list-files",
      "--connection-id",
      CONNECTION_ID,
      "--site-id",
      "site-1"
    ]);

    expect(request).toHaveBeenCalledWith("GET", "/documents/imports/sharepoint/items", {
      query: {
        connectionId: CONNECTION_ID,
        siteId: "site-1",
        folderId: "root",
        pageToken: undefined
      }
    });
  });

  it("routes notion search to the search endpoint", async () => {
    await run([
      "cloud-import",
      "notion",
      "search",
      "--connection-id",
      CONNECTION_ID,
      "--query",
      "roadmap"
    ]);

    const [method, path] = request.mock.calls[0] ?? [];
    expect([method, path]).toEqual(["GET", "/documents/imports/notion/search"]);
  });

  it("explains the removed --access-token flag instead of calling the old endpoint", async () => {
    // The upgrade path: an existing script passes ONLY the old flag. Making
    // --connection-id a requiredOption would make commander reject this before
    // the action runs, so the explanation would never print.
    await run(["cloud-import", "google-drive", "list-files", "--access-token", "ya29.legacy"]);

    // Commander would answer "unknown option", which does not say what to do;
    // and calling anything with a token would reach the endpoint that answers
    // with no files.
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("asks for a connection id when neither flag is given", async () => {
    await run(["cloud-import", "google-drive", "list-files"]);

    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("shows how to fetch the next page in table mode, not only in JSON", async () => {
    request.mockResolvedValue({
      items: [{ id: "f1", name: "Report", isFolder: false }],
      nextPageToken: "page-2"
    });

    const out = await runTable([
      "cloud-import",
      "browse",
      "notion",
      "--connection-id",
      CONNECTION_ID,
      "--folder-id",
      "db-1"
    ]);

    // Without this the listing looks complete: the generic pagination footer
    // only understands total/page/hasMore and drops the token entirely.
    expect(out).toContain("page-2");
    expect(out).toContain("--page-token");
  });

  it("says nothing about paging when there is no next page", async () => {
    request.mockResolvedValue({ items: [], nextPageToken: undefined });

    const out = await runTable([
      "cloud-import",
      "browse",
      "notion",
      "--connection-id",
      CONNECTION_ID,
      "--folder-id",
      "db-1"
    ]);

    expect(out).not.toContain("--page-token");
  });

  it("lists providers from the API rather than from a built-in list", async () => {
    request.mockResolvedValue({ providers: [] });

    await run(["cloud-import", "providers"]);

    expect(request).toHaveBeenCalledWith("GET", "/documents/imports/providers");
  });
});
