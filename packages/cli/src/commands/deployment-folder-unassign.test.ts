import { DeploymentFoldersResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * `nexus deployment folder assign --folder-id null` must reach the wire as
 * `folderId: null`.
 *
 * The route types `folderId` as `uuid | null` and treats null as an
 * unassignment — deleting the assignment row and answering `assigned: false`.
 * The flag is a REQUIRED string, so before this the only way to say null was
 * the literal four characters "null", which the body schema rejects as a
 * malformed uuid: the one documented way out of a folder was unreachable from
 * the CLI and 400ed instead.
 *
 * Driven through the real `DeploymentFoldersResource` rather than a mocked
 * one, for the reason `role.test.ts` gives: mocking the resource would assert
 * that the CLI calls a function, which was never in doubt. What is in doubt is
 * the BODY, and only the resource puts it on the wire.
 */
const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    deploymentFolders: new DeploymentFoldersResource({ request } as never)
  })
}));

import { registerDeploymentCommands } from "./deployment";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerDeploymentCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

const DEPLOYMENT_ID = "11111111-1111-1111-1111-111111111111";
const FOLDER_ID = "22222222-2222-2222-2222-222222222222";

describe("nexus deployment folder assign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    request.mockResolvedValue({ deploymentId: DEPLOYMENT_ID, folderId: null, assigned: false });
  });

  it("sends folderId: null for --folder-id null", async () => {
    await run([
      "deployment",
      "folder",
      "assign",
      "--deployment-id",
      DEPLOYMENT_ID,
      "--folder-id",
      "null"
    ]);

    expect(request).toHaveBeenCalledWith("POST", "/deployment-folders/assign", {
      body: { deploymentId: DEPLOYMENT_ID, folderId: null }
    });
  });

  it("passes a real folder id through untouched", async () => {
    await run([
      "deployment",
      "folder",
      "assign",
      "--deployment-id",
      DEPLOYMENT_ID,
      "--folder-id",
      FOLDER_ID
    ]);

    expect(request).toHaveBeenCalledWith("POST", "/deployment-folders/assign", {
      body: { deploymentId: DEPLOYMENT_ID, folderId: FOLDER_ID }
    });
  });
});
