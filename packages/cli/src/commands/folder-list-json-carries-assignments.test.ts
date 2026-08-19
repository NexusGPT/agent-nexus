import {
  DeploymentFoldersResource,
  DocumentTemplateFoldersResource,
  FoldersResource
} from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * A FOLDER-LIST `--json` DOCUMENT MUST CARRY `assignments[]`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE FIELD WAS DROPPED ONE LINE ABOVE THE OUTPUT-FORMAT BRANCH.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `GET /folders` answers `{folders, assignments}`. The action did
 *
 *     const folders = result.folders ?? result;
 *     printTable(folders, COLUMNS);
 *
 * and `printTable` is the only line that knows whether `--json` was passed. The
 * narrowing happened first, so BOTH channels lost `assignments` — and
 * `assignments` is the only agent-to-folder map either surface publishes, since
 * a folder row carries no membership at all. The one flag meant for machines was
 * the one that could not answer "which folder is this agent in".
 *
 * ── WHAT THIS FILE ASSERTS, AND WHY IT IS NOT THE OBVIOUS THING ─────────────
 *
 * 🚨 ASSERTING "THE TABLE SHOWS THE RIGHT FOLDERS" WOULD HAVE PASSED ON THE
 * BROKEN CODE. The old command rendered its table correctly; nothing about the
 * human channel was ever wrong. A test written against the FEATURE — folders are
 * listed — is green before and after the fix and protects nothing.
 *
 * So every case below is about the DOCUMENT: parse the whole of stdout, and read
 * a key the old code could not have produced. Each one fails against the
 * pre-fix implementation, which is the only property that makes it a
 * regression test rather than a description.
 *
 * ── AND THE HUMAN CHANNEL IS ASSERTED TOO, FOR THE OPPOSITE REASON ──────────
 *
 * ⚠️ `printEnvelope` calls its render callback only when `--json` is OFF. A
 * mistake there — calling it on both branches, or on neither — leaves the JSON
 * cases green and breaks the terminal, or writes a second document to stderr.
 * The last case drives the command WITHOUT `--json` and reads the table back.
 */
const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    folders: new FoldersResource({ request } as never),
    deploymentFolders: new DeploymentFoldersResource({ request } as never),
    documentTemplateFolders: new DocumentTemplateFoldersResource({ request } as never)
  }),
  timeoutSecondsToMs: (s?: number) => (s !== undefined ? s * 1000 : undefined)
}));

import { registerDeploymentCommands } from "./deployment";
import { registerFolderCommands } from "./folder";
import { registerTemplateCommands } from "./template";

const SUPPORT = "11111111-1111-4111-8111-111111111111";
const EMPTY = "22222222-2222-4222-8222-222222222222";
const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const RESPONSE = {
  folders: [
    {
      id: SUPPORT,
      name: "Customer Support",
      iconUrl: null,
      parentId: null,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: null
    },
    {
      id: EMPTY,
      name: "Archive",
      iconUrl: null,
      parentId: SUPPORT,
      createdAt: "2026-08-02T10:00:00.000Z",
      updatedAt: null
    }
  ],
  assignments: [
    { agentId: AGENT_A, folderId: SUPPORT },
    { agentId: AGENT_B, folderId: SUPPORT }
  ]
};

type Registrar = (program: Command) => void;

/** The rendered table row carrying `name`, or "" when the table has no such row. */
function row(out: string, name: string): string {
  return out.split("\n").find((line) => line.includes(name)) ?? "";
}

function build(register: Registrar): Command {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  register(program);
  return program;
}

async function capture(register: Registrar, argv: string[], json: boolean): Promise<string> {
  const program = build(register);
  setJsonMode(json);

  const chunks: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });

  try {
    await program.parseAsync(["node", "nexus", ...(json ? ["--json"] : []), ...argv]);
  } finally {
    spy.mockRestore();
    setJsonMode(false);
  }

  return chunks.join("\n");
}

describe("folder-list --json carries the whole response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    request.mockResolvedValue(RESPONSE);
  });

  it("emits one parseable document", async () => {
    const out = await capture(registerFolderCommands, ["folder", "list"], true);

    expect(() => JSON.parse(out)).not.toThrow();
  });

  it("carries assignments[] — the field the narrowing deleted", async () => {
    const doc = JSON.parse(
      await capture(registerFolderCommands, ["folder", "list"], true)
    ) as typeof RESPONSE;

    // The whole ticket. Against the old code stdout was a bare array, so this
    // read is `undefined` — and `JSON.parse` succeeded, which is why the defect
    // survived every parse-level check in this package.
    expect(doc.assignments).toEqual(RESPONSE.assignments);
  });

  it("answers which folder an agent is in", async () => {
    const doc = JSON.parse(
      await capture(registerFolderCommands, ["folder", "list"], true)
    ) as typeof RESPONSE;

    // Stated as the question a caller actually asks, because that is the thing
    // no other command in this CLI can answer.
    const folderOf = (agentId: string): string | undefined =>
      doc.assignments.find((a) => a.agentId === agentId)?.folderId;

    expect(folderOf(AGENT_A)).toBe(SUPPORT);
    expect(folderOf(AGENT_B)).toBe(SUPPORT);
  });

  it("keeps the folders under a NAMED key rather than at the top level", async () => {
    const out = await capture(registerFolderCommands, ["folder", "list"], true);
    const doc: unknown = JSON.parse(out);

    // The envelope change, asserted rather than implied: `jq '.[]'` used to work
    // and now does not, and `--help` says so. A consumer that reads the array
    // back off the top level must fail loudly here, not silently later.
    expect(Array.isArray(doc)).toBe(false);
    expect((doc as typeof RESPONSE).folders.map((f) => f.id)).toEqual([SUPPORT, EMPTY]);
  });

  it("carries assignments for deployment folders too", async () => {
    const doc = JSON.parse(
      await capture(registerDeploymentCommands, ["deployment", "folder", "list"], true)
    ) as typeof RESPONSE;

    expect(doc.assignments).toEqual(RESPONSE.assignments);
  });

  it("carries assignments for template folders too", async () => {
    const doc = JSON.parse(
      await capture(registerTemplateCommands, ["template", "folder", "list"], true)
    ) as typeof RESPONSE;

    expect(doc.assignments).toEqual(RESPONSE.assignments);
  });
});

describe("the human table still renders, and now counts membership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    request.mockResolvedValue(RESPONSE);
  });

  it("prints a table with an AGENTS count per folder", async () => {
    const out = await capture(registerFolderCommands, ["folder", "list"], false);

    // `printEnvelope` must call its callback on this branch and only this one.
    expect(out).toContain("AGENTS");
    expect(row(out, "Customer Support")).toMatch(/\b2\b/);

    // A folder nobody is filed in reads 0, never blank — an empty cell is read
    // as "not reported" and this number is always reported.
    expect(row(out, "Archive")).toMatch(/\b0\b/);
  });

  it("writes no JSON document on the human branch", async () => {
    const out = await capture(registerFolderCommands, ["folder", "list"], false);

    expect(() => JSON.parse(out)).toThrow();
  });

  it("prints the folders when the server answers without assignments at all", async () => {
    // 🚨 THE SDK TYPE SAYS `assignments` IS REQUIRED; AN INSTALLED CLI TALKS TO
    // WHATEVER VERSION IS DEPLOYED. Counting over an absent array throws a
    // TypeError, so the terminal would print a stack trace for a folder list the
    // server answered perfectly well. Absent membership is zero membership.
    request.mockResolvedValue({ folders: RESPONSE.folders });

    const out = await capture(registerFolderCommands, ["folder", "list"], false);

    expect(out).toContain("Customer Support");
    expect(row(out, "Customer Support")).toMatch(/\b0\b/);
  });

  it("still emits whatever the server DID send under --json", async () => {
    // The degradation is in the COUNT, never in the document: `printEnvelope`
    // has already written the untouched response by the time this runs.
    request.mockResolvedValue({ folders: RESPONSE.folders });

    const doc = JSON.parse(
      await capture(registerFolderCommands, ["folder", "list"], true)
    ) as Partial<typeof RESPONSE>;

    expect(doc.assignments).toBeUndefined();
    expect(doc.folders?.map((f) => f.id)).toEqual([SUPPORT, EMPTY]);
  });
});
