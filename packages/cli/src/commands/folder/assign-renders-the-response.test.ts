import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `folder assign` RENDERS THE SERVER'S ANSWER, NEVER THE REQUEST IT SENT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE OBVIOUS ARM PROVES NOTHING HERE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The server ECHOES: `assignAgent` answers `{agentId, folderId, assigned}` with
 * `agentId` and `folderId` taken straight off the request body and `assigned`
 * derived from it. So a stub answering the same values it was sent renders
 * byte-identically whether the command reads the response or the request — the
 * two sourcings are indistinguishable on every input a live server produces,
 * which is exactly why the command could read the request for so long and look
 * right.
 *
 * 🔴 EVERY ARM BELOW THEREFORE STUBS A RESPONSE THAT DISAGREES WITH THE REQUEST.
 * That is a discriminating control on SOURCING, not a test of an unreachable
 * code path: the branch taken is the one production takes, and only the values
 * differ. A response agreeing with its request cannot tell the two apart, so an
 * arm built on one is void by construction.
 *
 * ⚠️ ONE PROPERTY PER `it`. A failing assertion throws and abandons the rest of
 * its own block, so two arms in one block means a mutant scores whichever is
 * written first — and which one that is depends on the mutant, not on the
 * writing order.
 */

const assignAgent = vi.fn();

vi.mock("../../client", () => ({
  createClient: () => ({ folders: { assignAgent } })
}));

import { setJsonMode } from "../../output";
import { registerFolderCommands } from "../folder";

/** ESC, built rather than written: a literal control character in a regex trips `no-control-regex`. */
const ESC = String.fromCharCode(27);

/** Drop `ESC[…m` sequences, so the arms answer what an operator READS. */
function stripAnsi(text: string): string {
  return text
    .split(ESC)
    .map((part, index) => (index === 0 ? part : part.slice(part.indexOf("m") + 1)))
    .join("");
}

/** The agentId typed on the command line. */
const FLAG_AGENT = "22222222-2222-4222-8222-222222222222";
/** The agentId the SERVER answers with — deliberately not the one above. */
const RESPONSE_AGENT = "99999999-9999-4999-8999-999999999999";
/** The folderId typed on the command line. */
const REQUEST_FOLDER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** The folderId the SERVER answers with — deliberately not the one above. */
const RESPONSE_FOLDER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ASSIGNED_LINE = "✓ Agent assigned to folder.";
const REMOVED_LINE = "✓ Agent removed from folder.";

/** Drive the real folder tree on the human channel and hand back every line it wrote. */
async function runAssign(argv: string[]): Promise<string[]> {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerFolderCommands(program);
  setJsonMode(false);

  const out: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a)).join(" "));
  });
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const previousExitCode = process.exitCode;
  try {
    await program.parseAsync(["node", "nexus", "folder", "assign", ...argv]);
  } finally {
    log.mockRestore();
    write.mockRestore();
    process.exitCode = previousExitCode;
  }

  return stripAnsi(out.join("\n")).split("\n");
}

/** The same tree on the JSON channel, handing back the one document it emits. */
async function runAssignJson(argv: string[]): Promise<unknown> {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerFolderCommands(program);
  setJsonMode(true);

  let document: unknown;
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    document = JSON.parse(args.map((a) => String(a)).join(" "));
  });

  try {
    await program.parseAsync(["node", "nexus", "folder", "assign", ...argv]);
  } finally {
    log.mockRestore();
    setJsonMode(false);
  }

  return document;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("folder assign — the rendered fields come off the response", () => {
  it("prints the RESPONSE's folderId", async () => {
    assignAgent.mockResolvedValue({
      agentId: FLAG_AGENT,
      folderId: RESPONSE_FOLDER,
      assigned: true
    });

    const lines = await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", REQUEST_FOLDER]);

    // MUTANT: read `assignBody.folderId` instead -> the request's value prints.
    expect(lines, `stdout was:\n${lines.join("\n")}`).toContain(`  folderId: ${RESPONSE_FOLDER}`);
  });

  it("and never the folderId it was asked to send", async () => {
    assignAgent.mockResolvedValue({
      agentId: FLAG_AGENT,
      folderId: RESPONSE_FOLDER,
      assigned: true
    });

    const lines = await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", REQUEST_FOLDER]);

    // The positive arm above is satisfied by a line carrying BOTH, so this is
    // the half that says the request's value is gone rather than merely joined.
    expect(lines.join("\n")).not.toContain(REQUEST_FOLDER);
  });

  it("prints the RESPONSE's agentId, not --agent-id", async () => {
    assignAgent.mockResolvedValue({
      agentId: RESPONSE_AGENT,
      folderId: RESPONSE_FOLDER,
      assigned: true
    });

    const lines = await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", REQUEST_FOLDER]);

    // MUTANT: read `opts.agentId` -> the flag's value prints, which is also
    // wrong whenever `--body` carried an agentId the flag did not.
    expect(lines, `stdout was:\n${lines.join("\n")}`).toContain(`  agentId: ${RESPONSE_AGENT}`);
  });

  it("and never the agentId it was asked to send", async () => {
    assignAgent.mockResolvedValue({
      agentId: RESPONSE_AGENT,
      folderId: RESPONSE_FOLDER,
      assigned: true
    });

    const lines = await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", REQUEST_FOLDER]);

    expect(lines.join("\n")).not.toContain(FLAG_AGENT);
  });

  it("says 'Agent assigned to folder.' on an assign", async () => {
    assignAgent.mockResolvedValue({
      agentId: RESPONSE_AGENT,
      folderId: RESPONSE_FOLDER,
      assigned: true
    });

    const lines = await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", REQUEST_FOLDER]);

    expect(lines, `stdout was:\n${lines.join("\n")}`).toContain(ASSIGNED_LINE);
  });
});

describe("folder assign — the BRANCH comes off `assigned`", () => {
  it("renders the removal branch when the response says assigned: false", async () => {
    // BOTH other candidates for this branch are truthy here, which is what makes
    // the arm discriminate: the request's folderId, and the RESPONSE's folderId.
    // Only `assigned` says removal. A response carrying a folderId beside
    // `assigned: false` is not one the server produces — it is a control on
    // which field the branch READS, and the branch it drives is the one
    // production takes.
    assignAgent.mockResolvedValue({
      agentId: RESPONSE_AGENT,
      folderId: RESPONSE_FOLDER,
      assigned: false
    });

    const lines = await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", REQUEST_FOLDER]);

    // MUTANT: branch on `assignBody.folderId` -> this prints the assign line.
    expect(lines, `stdout was:\n${lines.join("\n")}`).toContain(REMOVED_LINE);
  });

  it("renders the removal branch on --folder-id null", async () => {
    assignAgent.mockResolvedValue({
      agentId: RESPONSE_AGENT,
      folderId: null,
      assigned: false
    });

    const lines = await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", "null"]);

    expect(lines, `stdout was:\n${lines.join("\n")}`).toContain(REMOVED_LINE);
  });

  it("names the absent folder in words on an unassign", async () => {
    assignAgent.mockResolvedValue({
      agentId: RESPONSE_AGENT,
      folderId: null,
      assigned: false
    });

    const lines = await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", "null"]);

    // `absent()` is the only sanctioned way to put display copy on the human
    // channel while the document keeps `null`. Dropping it prints a bare
    // `folderId:` here, because `renderCell(null)` is the empty string.
    expect(lines, `stdout was:\n${lines.join("\n")}`).toContain("  folderId: (none)");
  });

  it("still prints the response's agentId on an unassign", async () => {
    assignAgent.mockResolvedValue({
      agentId: RESPONSE_AGENT,
      folderId: null,
      assigned: false
    });

    const lines = await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", "null"]);

    expect(lines, `stdout was:\n${lines.join("\n")}`).toContain(`  agentId: ${RESPONSE_AGENT}`);
  });
});

describe("folder assign — `assigned` reaches the output the help points scripts at", () => {
  it("prints assigned: true on an assign", async () => {
    assignAgent.mockResolvedValue({
      agentId: RESPONSE_AGENT,
      folderId: RESPONSE_FOLDER,
      assigned: true
    });

    const lines = await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", REQUEST_FOLDER]);

    // MUTANT: drop the key from the payload -> the Notes tell a script to read
    // `.assigned` and `--json` answers `undefined`, which is the defect this
    // whole change exists to remove, in its other direction.
    expect(lines, `stdout was:\n${lines.join("\n")}`).toContain("  assigned: true");
  });

  it("prints assigned: false on an unassign", async () => {
    assignAgent.mockResolvedValue({
      agentId: RESPONSE_AGENT,
      folderId: null,
      assigned: false
    });

    const lines = await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", "null"]);

    // The removal branch is the one that would plausibly be left bare, and it is
    // the branch on which a script most needs the discriminator.
    expect(lines, `stdout was:\n${lines.join("\n")}`).toContain("  assigned: false");
  });

  it("carries assigned into the --json document", async () => {
    assignAgent.mockResolvedValue({
      agentId: RESPONSE_AGENT,
      folderId: RESPONSE_FOLDER,
      assigned: true
    });

    // The human arms above read `printSuccess`'s indented block, which the JSON
    // channel never renders — so neither of them can say anything about this.
    expect(
      await runAssignJson(["--agent-id", FLAG_AGENT, "--folder-id", REQUEST_FOLDER])
    ).toMatchObject({ success: true, assigned: true });
  });

  /**
   * THE KEY, NOT THE VALUE — and they are different assertions here.
   *
   * `undefined` and `null` are both falsy, and `toMatchObject({folderId: null})`
   * is satisfied by a key that is not there at all. The help promises the key is
   * present on every answer, so presence is the thing to assert, and
   * `Object.keys` over the parsed document is the only reading that separates
   * "the document carries null" from "the document carries nothing".
   */
  it("an unassign's --json document HAS a folderId key", async () => {
    assignAgent.mockResolvedValue({ agentId: RESPONSE_AGENT, folderId: null, assigned: false });

    const document = await runAssignJson(["--agent-id", FLAG_AGENT, "--folder-id", "null"]);

    // MUTANT: drop folderId from the payload -> the key is gone, the help's
    // "both keys are always there" is false, and `toMatchObject` would not
    // have noticed.
    expect(Object.keys(document as object)).toContain("folderId");
  });

  it("and that key's value is null", async () => {
    assignAgent.mockResolvedValue({ agentId: RESPONSE_AGENT, folderId: null, assigned: false });

    const document = (await runAssignJson(["--agent-id", FLAG_AGENT, "--folder-id", "null"])) as {
      folderId: unknown;
    };

    // `absent()` carries its display copy on a SYMBOL, which `jsonPayload` maps
    // to null — so a mutant swapping it for a bare string leaks "(none)" here.
    expect(document.folderId).toBeNull();
  });
});

describe("folder assign — the body the SDK is handed", () => {
  it("sends the request's folderId, whatever the response then says", async () => {
    assignAgent.mockResolvedValue({
      agentId: RESPONSE_AGENT,
      folderId: RESPONSE_FOLDER,
      assigned: true
    });

    await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", REQUEST_FOLDER]);

    // The fix moves what is RENDERED, never what is SENT. Without this arm a
    // mutant that sends the response's own folderId back — or sends nothing —
    // leaves every arm above green.
    expect(assignAgent).toHaveBeenCalledWith({
      agentId: FLAG_AGENT,
      folderId: REQUEST_FOLDER
    });
  });

  it("sends folderId null for the literal 'null' token", async () => {
    assignAgent.mockResolvedValue({
      agentId: RESPONSE_AGENT,
      folderId: null,
      assigned: false
    });

    await runAssign(["--agent-id", FLAG_AGENT, "--folder-id", "null"]);

    expect(assignAgent).toHaveBeenCalledWith({ agentId: FLAG_AGENT, folderId: null });
  });
});
