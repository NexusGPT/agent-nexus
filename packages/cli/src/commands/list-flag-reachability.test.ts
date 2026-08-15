/**
 * Two list commands whose route accepts a filter the CLI could not reach.
 *
 * Same mechanism both times, and it is the one no scanner sees: a MISSING
 * `.option()` call. A flag that is declared and mis-parsed leaves a trace; a
 * flag that was never declared leaves none — `--help` shows what exists, the
 * contract block underneath it shows what the ROUTE takes, and nothing compares
 * the two.
 *
 * WHAT THESE ASSERT. The request, not the response. The defect is that a
 * parameter never left the machine, so a test that stubs a filtered response and
 * checks the rows passes against the bug — the rows would come back filtered in
 * the test and unfiltered in production. Every case below reads the query the
 * CLI actually put on the wire.
 *
 * ── TWO DIFFERENT DOUBLES, AND THE ASYMMETRY IS DELIBERATE ──────────────────
 *
 * `collection list` runs the REAL `SkillsResource` over a fake transport, so
 * these cases read the query string the SDK actually builds.
 *
 * `customer list` now does the same. `CustomersResource` was exported from
 * `packages/sdk/src/resources/index.ts` and missing from the package root, so it
 * was unreachable from a consumer and these cases had to assert against a plain
 * double — what the ACTION passed, rather than what reached the wire. NEX-3923
 * closed that: the root derives from the barrel with `export *`, the class is
 * nameable, and the double is gone.
 *
 * ⚠️ ONE LINK IS STILL NOT COVERED HERE, AND A GREEN RUN MUST NOT IMPLY IT IS.
 * `CustomersResource.list` casts its params straight into `query`, so a field
 * MISSING from the hand-written `ListCustomersParams` — which is what was
 * actually broken for `tag` — is a TYPE error at the action that passes it, not
 * a runtime difference here. `pnpm typecheck` is the only gate on that link. The
 * cases below prove the value reaches the wire; they cannot prove the parameter
 * is declarable.
 */

import { CustomersResource, SkillsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

const { request, requestPage } = vi.hoisted(() => ({
  request: vi.fn(),
  requestPage: vi.fn()
}));

// Both resources are the REAL classes over a fake transport. `list` on
// customers goes through `requestPage`, not `request`, so the fake carries both.
vi.mock("../client", () => ({
  createClient: () => ({
    skills: new SkillsResource({ request } as never),
    customers: new CustomersResource({ requestPage } as never)
  })
}));

import { registerCollectionCommands } from "./collection";
import { registerCustomerCommands } from "./customer";

type Registrar = (program: Command) => void;

async function run(register: Registrar, argv: string[], json = true): Promise<string> {
  const program = new Command();
  program.name("nexus").exitOverride();
  register(program);
  setJsonMode(json);

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

/** The query object the SDK handed the transport on its first call. */
function sentQuery(): Record<string, unknown> {
  const [, , options] = request.mock.calls[0] as [
    string,
    string,
    { query: Record<string, unknown> }
  ];
  return options.query;
}

/** The query object the customers resource handed the transport. */
function sentCustomerQuery(): Record<string, unknown> {
  const [, , options] = requestPage.mock.calls[0] as [
    string,
    string,
    { query: Record<string, unknown> }
  ];
  return options.query;
}

describe("collection list — --offset reaches the route's pagination", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ items: [], total: 0 });
  });

  it("sends offset when the flag is given", async () => {
    await run(registerCollectionCommands, [
      "collection",
      "list",
      "--limit",
      "20",
      "--offset",
      "20"
    ]);

    expect(sentQuery()).toMatchObject({ limit: 20, offset: 20 });
  });

  it("sends NO offset when the flag is absent, leaving the server default alone", async () => {
    await run(registerCollectionCommands, ["collection", "list"]);

    expect(sentQuery().offset).toBeUndefined();
  });

  it("parses the value as a number, not a string", async () => {
    await run(registerCollectionCommands, ["collection", "list", "--offset", "40"]);

    expect(sentQuery().offset).toBe(40);
  });
});

describe("collection list — the total prints in TABLE mode only", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({
      items: [{ id: "col-1", name: "faq", displayName: "FAQ", documentCount: 3 }],
      total: 57
    });
  });

  it("prints the total under the table, so an operator knows when to stop paging", async () => {
    const out = await run(registerCollectionCommands, ["collection", "list"], false);

    expect(out).toContain("57 total");
  });

  it("marks that more is available when the page does not reach the total", async () => {
    const out = await run(registerCollectionCommands, ["collection", "list"], false);

    expect(out).toContain("more available");
  });

  it("drops the mark on the LAST page, which is the signal to stop", async () => {
    request.mockResolvedValue({
      items: [{ id: "col-1", name: "faq", displayName: "FAQ", documentCount: 3 }],
      total: 1
    });

    const out = await run(registerCollectionCommands, ["collection", "list"], false);

    expect(out).toContain("1 total");
    expect(out).not.toContain("more available");
  });

  /**
   * The documented `--json` shape is a BARE ARRAY. Adding the total to it would
   * break every script already reading it, so this asserts the ABSENCE — the
   * half of the decision that a table-mode test cannot see.
   */
  it("keeps --json a bare array, with no total anywhere in it", async () => {
    const out = await run(registerCollectionCommands, ["collection", "list"], true);

    expect(JSON.parse(out)).toEqual([
      { id: "col-1", name: "faq", displayName: "FAQ", documentCount: 3 }
    ]);
    expect(out).not.toContain("57");
  });
});

describe("customer list — --tag reaches the route's tag filter", () => {
  beforeEach(() => {
    requestPage.mockReset();
    requestPage.mockResolvedValue({ data: [], meta: { total: 0, page: 1, hasMore: false } });
  });

  it("sends the tag when the flag is given", async () => {
    await run(registerCustomerCommands, ["customer", "list", "--tag", "vip"]);

    expect(sentCustomerQuery()).toMatchObject({ tag: "vip" });
  });

  it("sends NO tag when the flag is absent", async () => {
    await run(registerCustomerCommands, ["customer", "list"]);

    expect(sentCustomerQuery().tag).toBeUndefined();
  });

  it("passes the tag through verbatim — the match is exact and case-sensitive", async () => {
    await run(registerCustomerCommands, ["customer", "list", "--tag", "VIP-eu"]);

    // No lowercasing, no trimming, no splitting on a comma. The route asks
    // whether the stored array CONTAINS this string, so any normalisation here
    // would silently change which customers come back.
    expect(sentCustomerQuery().tag).toBe("VIP-eu");
  });

  it("still sends the flags it already reached, so --tag is additive", async () => {
    await run(registerCustomerCommands, [
      "customer",
      "list",
      "--tag",
      "vip",
      "--channel",
      "WHATSAPP",
      "--limit",
      "50"
    ]);

    expect(sentCustomerQuery()).toMatchObject({
      tag: "vip",
      channel: "WHATSAPP",
      limit: 50
    });
  });

  /**
   * The three the public v1 handler destructures away and never passes on
   * (NEX-3914). A flag for any of them would be accepted here and discarded
   * there, with nothing reporting it — strictly worse than the gap `--tag`
   * closed. This is the guard against a future lane "finishing the job".
   */
  it("declares NO flag for filters, sorts or groupBy — the route discards all three", async () => {
    const program = new Command();
    program.name("nexus").exitOverride();
    registerCustomerCommands(program);

    const list = program.commands
      .find((c) => c.name() === "customer")
      ?.commands.find((c) => c.name() === "list");
    const flags = (list?.options ?? []).map((o) => o.long);

    expect(flags).toContain("--tag");
    expect(flags).not.toContain("--filters");
    expect(flags).not.toContain("--sorts");
    expect(flags).not.toContain("--group-by");
  });
});
