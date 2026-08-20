import { WorkflowsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * `nexus workflow node delete` must surface what the deletion removed.
 *
 * Deleting a `loop` or a `doWhile` is not one deletion. The container takes
 * every node scoped inside it and every edge touching any of them — its own
 * inbound and outbound edges included, which connect nodes OUTSIDE it and leave
 * them unconnected. Measured live: 9 nodes and 6 edges became 3 and 0 on one
 * call, and the command printed a fixed `Node deleted.` over a `204` with an
 * empty body (NEX-4047).
 *
 * Driven through the real `WorkflowsResource` with the stub at the transport,
 * following `asset-delete-object-removed.test.ts`: mocking the resource would
 * assert that the CLI calls a function, which was never in doubt. What is in
 * doubt is what the CLI does with what comes BACK.
 */
const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({ workflows: new WorkflowsResource({ request } as never) })
}));

import { registerWorkflowBuilderCommands } from "./workflow-builder";

const WF = "11111111-1111-4111-8111-111111111111";
const LOOP = "loop-1";

/** The reporter's cascade: the loop, its start node and four body nodes. */
const CASCADE = {
  deletedNodeIds: [LOOP, "loop-start", "inner-fmt", "inner-branch", "out-1", "out-2"],
  deletedEdgeIds: ["e-in", "e-out", "e-start-fmt", "e-fmt-branch", "e-branch-1", "e-branch-2"],
  severedNodeIds: ["root", "downstream"]
};

let stdout: string[];
let stderr: string[];

/**
 * `printSuccess` writes through `console.log` and `printWarning` through
 * `process.stderr.write`, and the split is behaviour under test — a warning on
 * stdout would contaminate the `--json` document.
 */
async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  const workflow = program.command("workflow");
  registerWorkflowBuilderCommands(workflow, program);
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

describe("nexus workflow node delete reports the cascade", () => {
  beforeEach(() => {
    request.mockResolvedValue(CASCADE);
  });

  it("puts all three id lists in the --json document", async () => {
    await run(["workflow", "node", "delete", WF, LOOP, "--yes"]);

    const doc: unknown = JSON.parse(stdout.join("\n"));
    expect(doc).toMatchObject(CASCADE);
  });

  it("counts the casualties in the verdict, which travels into the document too", async () => {
    await run(["workflow", "node", "delete", WF, LOOP, "--yes"]);

    expect(JSON.parse(stdout.join("\n"))).toMatchObject({
      success: true,
      message: "Deleted 6 node(s) and 6 edge(s)."
    });
  });

  it("warns on STDERR about the surviving nodes, and names them", async () => {
    await run(["workflow", "node", "delete", WF, LOOP, "--yes"]);

    const warning = stderr.join("");
    expect(warning).toContain("2 surviving node(s)");
    expect(warning).toContain("root");
    expect(warning).toContain("downstream");
  });

  /**
   * The root `--help` promises `--json` prints ONE document on stdout and
   * nothing else, so a warning written there would break every consumer parsing
   * it — trading one lie for another.
   */
  it("keeps the warning off STDOUT so the --json document stays parseable", async () => {
    await run(["workflow", "node", "delete", WF, LOOP, "--yes"]);

    expect(() => JSON.parse(stdout.join("\n"))).not.toThrow();
    expect(stdout.join("\n")).not.toContain("surviving");
  });

  /** The deletion succeeded. A non-zero exit would claim a failure that did not happen. */
  it("does not fail the command", async () => {
    await run(["workflow", "node", "delete", WF, LOOP, "--yes"]);

    expect(process.exitCode).toBeUndefined();
  });

  it("sends the delete to the node route", async () => {
    await run(["workflow", "node", "delete", WF, LOOP, "--yes"]);

    expect(request).toHaveBeenCalledWith("DELETE", `/workflows/${WF}/nodes/${LOOP}`);
  });

  it("warns about nothing when the deletion severed nothing", async () => {
    request.mockResolvedValue({
      deletedNodeIds: ["leaf"],
      deletedEdgeIds: [],
      severedNodeIds: []
    });

    await run(["workflow", "node", "delete", WF, "leaf", "--yes"]);

    expect(stderr.join("")).toBe("");
    expect(JSON.parse(stdout.join("\n"))).toMatchObject({
      message: "Deleted 1 node(s) and 0 edge(s)."
    });
  });
});

/**
 * THE VERSION SKEW, which is the one direction a published CLI cannot control.
 *
 * A server that has not shipped the enumeration answers `204`, and the
 * transport synthesizes `{}` for an empty body — so the three arrays are typed
 * present and arrive absent. Reading `.length` off `undefined` would throw
 * AFTER the delete already happened, which reads as a failed command and
 * invites a retry of a destructive call.
 */
describe("nexus workflow node delete against a server that reports nothing", () => {
  beforeEach(() => {
    request.mockResolvedValue({});
  });

  it("does not crash, and does not fail the command", async () => {
    await run(["workflow", "node", "delete", WF, LOOP, "--yes"]);

    expect(process.exitCode).toBeUndefined();
    expect(() => JSON.parse(stdout.join("\n"))).not.toThrow();
  });

  it("says the server did not report, rather than reporting nothing removed", async () => {
    await run(["workflow", "node", "delete", WF, LOOP, "--yes"]);

    // "Deleted 0 node(s)" over a cascade that removed six is the exact lie this
    // command was fixed for, so the fallback must not manufacture a count.
    expect(stdout.join("\n")).not.toContain("0 node(s)");
    expect(stderr.join("")).toContain("did not report");
  });
});
