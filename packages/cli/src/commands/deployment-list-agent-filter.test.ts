import { DeploymentsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../exit-codes";
import { setJsonMode } from "../output";

/**
 * `nexus deployment list --agent-id` reaches the wire as `agentId` (NEX-5806).
 *
 * Driven through the REAL `DeploymentsResource` over a recorded transport, so
 * what is asserted is the query the server receives — the hop where the value
 * used to vanish was the server's schema, and a CLI that never sent it would
 * look identical from a mocked `list()`.
 */
const { requestPage } = vi.hoisted(() => ({ requestPage: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    deployments: new DeploymentsResource({ requestPage } as never)
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

const AGENT_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  requestPage.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20 } });
});

describe("nexus deployment list --agent-id", () => {
  it("sends the agent id as the agentId query parameter", async () => {
    await run(["deployment", "list", "--agent-id", AGENT_ID]);

    expect(requestPage).toHaveBeenCalledTimes(1);
    const [method, path, options] = requestPage.mock.calls[0] ?? [];
    expect({ method, path }).toEqual({ method: "GET", path: "/deployments" });
    expect(options?.query).toMatchObject({ agentId: AGENT_ID });
  });

  it("refuses an EMPTY --agent-id locally instead of listing every agent", async () => {
    // The API reads `agentId=` as "no filter". `--agent-id "$UNSET"` must not
    // turn into the whole organization's list.
    await run(["deployment", "list", "--agent-id", ""]);

    expect(requestPage).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
    process.exitCode = 0;
  });

  it("sends no agentId without the flag (the control)", async () => {
    await run(["deployment", "list"]);

    const [, , options] = requestPage.mock.calls[0] ?? [];
    expect(options?.query?.agentId).toBeUndefined();
  });
});
