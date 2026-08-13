import { ConversationsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * `nexus conversation assign` must be able to UNASSIGN, and must refuse a blank
 * user id rather than posting it.
 *
 * ── The unassign path did not exist ───────────────────────────────────────────
 *
 * `--user-ids` was a `requiredOption` with a variadic `<ids...>` spec, which in
 * commander means "at least one value". So all three spellings failed:
 *
 *   --user-ids            → error: option '--user-ids <ids...>' argument missing
 *   (omitted)             → error: required option '--user-ids <ids...>' not specified
 *   --user-ids ""         → parsed as the one-element list [""]
 *
 * The command's OWN help documented the first as the unassign path
 * (`--user-ids  # empty to unassign all`), and that example could not run. The
 * endpoint accepts an empty list perfectly well — `PUT
 * /conversations/:id/assigned-users` with `userIds: []` clears the list — so
 * this was a CLI-side hole over a working route, and no other command reaches it.
 *
 * ── And the workaround was worse than the gap ─────────────────────────────────
 *
 * `--user-ids ""` looked like the way through and put `[""]` on the wire. The
 * server tries to connect a user whose id is the empty string, which is not a
 * missing user but a malformed one, and the failure surfaced as a raw
 * persistence error rather than a validation message. A blank id is never a
 * thing the caller meant; it is a shell that expanded to nothing.
 *
 * Driven through the real `ConversationsResource` rather than a mocked one:
 * mocking it would assert that the CLI calls a function, which was never in
 * doubt. What is in doubt is the BODY.
 */
const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({ conversations: new ConversationsResource({ request } as never) }),
  timeoutSecondsToMs: (s?: number) => (s !== undefined ? s * 1000 : undefined)
}));

import { registerConversationCommands } from "./conversation";

const CONVERSATION = "11111111-1111-1111-1111-111111111111";
const USER_A = "22222222-2222-2222-2222-222222222222";
const USER_B = "33333333-3333-3333-3333-333333333333";

interface Run {
  exitCode: number | undefined;
  stderr: string;
}

async function run(argv: string[]): Promise<Run> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerConversationCommands(program);
  setJsonMode(true);

  const stderr: string[] = [];
  const errSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    });
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  process.exitCode = undefined;

  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    errSpy.mockRestore();
    logSpy.mockRestore();
    setJsonMode(false);
  }

  const code = process.exitCode;
  process.exitCode = undefined;
  return { exitCode: typeof code === "number" ? code : undefined, stderr: stderr.join("") };
}

describe("nexus conversation assign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    request.mockResolvedValue({ id: CONVERSATION, assignedUserIds: [] });
  });

  it("assigns the named users", async () => {
    await run(["conversation", "assign", CONVERSATION, "--user-ids", USER_A, USER_B]);

    expect(request).toHaveBeenCalledWith(
      "PUT",
      `/conversations/${CONVERSATION}/assigned-users`,
      expect.objectContaining({ body: { userIds: [USER_A, USER_B] } })
    );
  });

  it("unassigns everyone with --clear, and sends an empty list", async () => {
    await run(["conversation", "assign", CONVERSATION, "--clear"]);

    expect(request).toHaveBeenCalledWith(
      "PUT",
      `/conversations/${CONVERSATION}/assigned-users`,
      expect.objectContaining({ body: { userIds: [] } })
    );
  });

  it("refuses a bare assign rather than silently clearing the list", async () => {
    // Replace-all semantics make "no flags" the most destructive possible
    // reading. It has to be an explicit choice, not a default.
    const { exitCode } = await run(["conversation", "assign", CONVERSATION]);

    expect(request).not.toHaveBeenCalled();
    expect(exitCode).toBe(1);
  });

  it("refuses --user-ids and --clear together instead of picking one", async () => {
    const { exitCode } = await run([
      "conversation",
      "assign",
      CONVERSATION,
      "--user-ids",
      USER_A,
      "--clear"
    ]);

    expect(request).not.toHaveBeenCalled();
    expect(exitCode).toBe(1);
  });

  it("refuses a blank user id instead of putting it on the wire", async () => {
    // `--user-ids "$UID"` with an unset variable. The shell hands over an empty
    // string and the CLI used to forward it as a real id.
    const { exitCode } = await run(["conversation", "assign", CONVERSATION, "--user-ids", ""]);

    expect(request).not.toHaveBeenCalled();
    expect(exitCode).toBe(1);
  });

  it("refuses a blank id hiding among real ones", async () => {
    const { exitCode } = await run([
      "conversation",
      "assign",
      CONVERSATION,
      "--user-ids",
      USER_A,
      "   "
    ]);

    expect(request).not.toHaveBeenCalled();
    expect(exitCode).toBe(1);
  });
});
