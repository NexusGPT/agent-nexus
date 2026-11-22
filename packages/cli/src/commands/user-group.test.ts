import { UserGroupsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

// Real SDK resource over a fake HTTP client: the point of these tests is which
// METHOD, PATH and BODY the CLI ends up requesting, so the resource must not be
// mocked.
const { request, question } = vi.hoisted(() => ({ request: vi.fn(), question: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    userGroups: new UserGroupsResource({ request } as never)
  })
}));

// The delete verb prompts through a DYNAMIC import, so the mock has to stand in
// for the real module rather than for a helper the command owns.
vi.mock("node:readline/promises", () => ({
  createInterface: () => ({ question, close: () => undefined })
}));

import { registerUserGroupCommands } from "./user-group";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerUserGroupCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

/**
 * Same, in the default table mode, capturing stdout.
 *
 * Every JSON-mode test is its own output path — a value dropped only from the
 * human-readable rendering is invisible to all of them.
 */
async function runTable(argv: string[]): Promise<string> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerUserGroupCommands(program);
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

const GROUP_ID = "11111111-1111-1111-1111-111111111111";

const GROUP = {
  id: GROUP_ID,
  name: "Support",
  description: null,
  createdAt: "2026-08-06T00:00:00.000Z",
  memberUserIds: ["user_abc", "user_def"],
  memberCount: 2
};

describe("user-group list", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ userGroups: [GROUP] });
  });

  it("lists off the collection path", async () => {
    await run(["user-group", "list"]);

    expect(request).toHaveBeenCalledWith("GET", "/user-groups");
  });

  it("renders name and member count in table mode, not only in JSON", async () => {
    const out = await runTable(["user-group", "list"]);

    expect(out).toContain("Support");
    expect(out).toContain(GROUP_ID);
    // The count is what makes a group's membership readable without a second
    // call; a table that dropped it would look complete.
    expect(out).toContain("2");
  });
});

describe("user-group writes", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ userGroup: GROUP });
  });

  it("creates with the name alone when no ids are given", async () => {
    await run(["user-group", "create", "--name", "Support"]);

    // `userIds` omitted means "leave the membership alone", which is NOT the
    // same request as an empty array.
    expect(request).toHaveBeenCalledWith("POST", "/user-groups", {
      body: { name: "Support" }
    });
  });

  it("splits and trims a comma-separated membership on create", async () => {
    await run([
      "user-group",
      "create",
      "--name",
      "Support",
      "--user-ids",
      " user_abc , user_def ,"
    ]);

    expect(request).toHaveBeenCalledWith("POST", "/user-groups", {
      body: { name: "Support", userIds: ["user_abc", "user_def"] }
    });
  });

  it("sends an EMPTY array for an empty --user-ids, which empties the group", async () => {
    await run(["user-group", "update", GROUP_ID, "--name", "Support", "--user-ids", ""]);

    // Branching on falsiness here would turn `--user-ids ""` back into "field
    // omitted", and the group would silently keep its members.
    expect(request).toHaveBeenCalledWith("PUT", `/user-groups/${GROUP_ID}`, {
      body: { name: "Support", userIds: [] }
    });
  });

  it("updates through PUT on the group path", async () => {
    await run(["user-group", "update", GROUP_ID, "--name", "Support EMEA"]);

    expect(request).toHaveBeenCalledWith("PUT", `/user-groups/${GROUP_ID}`, {
      body: { name: "Support EMEA" }
    });
  });

  it("adds a member through POST with the user id in the BODY", async () => {
    await run(["user-group", "add-member", GROUP_ID, "--user-id", "user_abc"]);

    // A Clerk user id is not a uuid, so it never travels in the path alongside
    // one that is.
    expect(request).toHaveBeenCalledWith("POST", `/user-groups/${GROUP_ID}/members/add`, {
      body: { userId: "user_abc" }
    });
  });

  it("removes a member through POST, not DELETE", async () => {
    await run(["user-group", "remove-member", GROUP_ID, "--user-id", "user_abc"]);

    expect(request).toHaveBeenCalledWith("POST", `/user-groups/${GROUP_ID}/members/remove`, {
      body: { userId: "user_abc" }
    });
  });
});

describe("user-group delete", () => {
  const originalStdinIsTTY = process.stdin.isTTY;
  const originalStderrIsTTY = process.stderr.isTTY;

  beforeEach(() => {
    request.mockReset();
    question.mockReset();
    request.mockResolvedValue({ deleted: true, revokedPermissionCount: 4 });
    // BOTH DIRECTIONS, because a confirmation is a conversation and `canAsk()`
    // is both halves of it. stdin is the stream the answer arrives on; a visible
    // prompt stream is where the question goes, and with neither output a
    // terminal the command refuses rather than asking an invisible question.
    //
    // 🚨 EITHER HALF LEFT OUT MAKES THE DECLINE ARM BELOW VACUOUS, AND IT STAYS
    // GREEN EITHER WAY. "Calls nothing when the operator declines" is equally
    // satisfied by a refusal that never asked at all, so the setup is what makes
    // that arm mean anything — which is why it is stated here rather than left
    // to whoever reads the arm.
    process.stdin.isTTY = true;
    process.stderr.isTTY = true;
  });

  afterEach(() => {
    process.stdin.isTTY = originalStdinIsTTY;
    process.stderr.isTTY = originalStderrIsTTY;
  });

  it("deletes on --yes without prompting", async () => {
    await run(["user-group", "delete", GROUP_ID, "--yes"]);

    expect(question).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith("DELETE", `/user-groups/${GROUP_ID}`);
  });

  it("deletes when the operator confirms", async () => {
    question.mockResolvedValue("y");

    await run(["user-group", "delete", GROUP_ID]);

    expect(request).toHaveBeenCalledWith("DELETE", `/user-groups/${GROUP_ID}`);
  });

  it("calls NOTHING when the operator declines", async () => {
    question.mockResolvedValue("n");

    await run(["user-group", "delete", GROUP_ID]);

    // A delete cascades into every grant that named the group. A confirmation
    // that fires the request anyway is worse than no confirmation.
    expect(request).not.toHaveBeenCalled();
  });

  it("reports the revoked grant count in table mode, not only in JSON", async () => {
    const out = await runTable(["user-group", "delete", GROUP_ID, "--yes"]);

    // The count is how a caller tells a delete that cleaned up its orphaned
    // grants from one that left them behind.
    expect(out).toContain("4");
  });
});
