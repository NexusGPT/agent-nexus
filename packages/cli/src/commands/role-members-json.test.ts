import { RolesResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * `nexus role members --json` must print ONE JSON document.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 TWO PRINTERS IN ONE ACTION IS TWO DOCUMENTS UNDER `--json`.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every printer in `output.ts` short-circuits under `--json` to its own
 * `console.log(JSON.stringify(...))`. That is right for a command that calls
 * one; `role members` called `printRecord` and then `printList`, so stdout
 * carried `{...}` immediately followed by `{"data":[...]}`. `JSON.parse` rejects
 * the concatenation, and `jq` reads it as a stream — so a script either crashed
 * or silently consumed only the first half, which is the summary counts and not
 * the members.
 *
 * The root epilogue's promise is explicit: "--json prints ONE JSON document on
 * STDOUT and nothing else." `json-output.test.ts` and `json-purity.test.ts`
 * already assert it for other commands; this file is the one for `role members`,
 * whose human rendering genuinely needs two blocks and whose JSON therefore has
 * to be assembled rather than printed twice.
 *
 * PARSING IS THE ASSERTION. Asserting on substrings would pass on a document
 * that is well-formed and truncated; only `JSON.parse` over the whole of stdout
 * rejects the two-document shape.
 */
const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({ roles: new RolesResource({ request } as never) }),
  timeoutSecondsToMs: (s?: number) => (s !== undefined ? s * 1000 : undefined)
}));

import { registerRoleCommands } from "./role";

const ROLE = "11111111-1111-1111-1111-111111111111";

const MEMBERSHIP = {
  roleId: ROLE,
  ownerUserId: "owner-1",
  admins: [
    {
      userId: "admin-1",
      tier: "ADMIN",
      addedByUserId: "owner-1",
      createdAt: "2026-08-01T10:00:00.000Z"
    }
  ],
  members: [
    {
      userId: "member-1",
      tier: "MEMBER",
      addedByUserId: "admin-1",
      createdAt: "2026-08-02T10:00:00.000Z"
    },
    {
      userId: "member-2",
      tier: "MEMBER",
      addedByUserId: "admin-1",
      createdAt: "2026-08-03T10:00:00.000Z"
    }
  ]
};

async function runJson(argv: string[]): Promise<string> {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerRoleCommands(program);
  setJsonMode(true);

  const chunks: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });

  try {
    await program.parseAsync(["node", "nexus", "--json", ...argv]);
  } finally {
    spy.mockRestore();
    setJsonMode(false);
  }
  return chunks.join("\n");
}

describe("nexus role members --json", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    request.mockResolvedValue(MEMBERSHIP);
  });

  it("emits a single parseable document", async () => {
    const out = await runJson(["role", "members", ROLE]);

    // The whole assertion. Two concatenated objects throw here.
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it("keeps every member in that one document", async () => {
    const out = await runJson(["role", "members", ROLE]);
    const doc = JSON.parse(out) as typeof MEMBERSHIP;

    // The first document alone carried the owner and two counts. A caller
    // parsing only what `JSON.parse` accepts would have got the counts and
    // never the people — the failure that reads as "the API returned no
    // members".
    expect(doc.ownerUserId).toBe("owner-1");
    expect(doc.admins.map((a) => a.userId)).toEqual(["admin-1"]);
    expect(doc.members.map((m) => m.userId)).toEqual(["member-1", "member-2"]);
  });

  it("does not flatten admins and members into one indistinguishable list", async () => {
    // The human rendering concatenates them into a single table with a TIER
    // column. The JSON must not: `admins` and `members` are separate fields on
    // the response and a consumer keys off that, not off a string column.
    const doc = JSON.parse(await runJson(["role", "members", ROLE])) as typeof MEMBERSHIP;

    expect(Array.isArray(doc.admins)).toBe(true);
    expect(Array.isArray(doc.members)).toBe(true);
    expect(doc.admins).not.toEqual(doc.members);
  });
});
