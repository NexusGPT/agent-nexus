import { RolesResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * THE REACH PROOF for `nexus role`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS RATHER THAN LEANING ON THE EXISTING GATE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `sdk-methods-reach-the-cli.test.ts` scans the CLI for a bare method NAME, and
 * its own header admits two resources cover for each other. Roles is heavy on
 * `list` / `get` / `create` / `update` / `delete`, so every one of those passes
 * that scan having proven nothing at all — some OTHER command's `list` satisfies
 * it. A name appearing in a file is not a command reaching a route.
 *
 * So the assertions below drive the REAL `RolesResource` over a fake HTTP client
 * and compare the METHOD, the PATH and the BODY against what the contract
 * declares. The resource is deliberately not mocked: mocking it would test that
 * the CLI calls a function, which is the thing that is never in doubt.
 *
 * Mutation-proved rather than assumed — see the commit message for which path was
 * broken and which assertions reddened.
 */

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    roles: new RolesResource({ request } as never)
  })
}));

import { registerRoleCommands } from "./role";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerRoleCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

/**
 * The same, in JSON mode, PARSED — the document a scripted caller receives.
 *
 * `run` proves the request; this proves the answer. The two are separate output
 * paths and NEX-3627/NEX-3628 both lived entirely in the second one: the wire
 * calls were right, the human rendering was right, and the JSON document dropped
 * the governance discriminant and substituted English for `null`.
 */
async function runJson(argv: string[]): Promise<Record<string, unknown>> {
  const chunks: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };
  try {
    await run(argv);
  } finally {
    console.log = log;
  }
  return JSON.parse(chunks.join("\n")) as Record<string, unknown>;
}

/**
 * The same, in table mode, capturing stdout.
 *
 * Every JSON-mode assertion is its own output path — a value dropped only from
 * the human-readable rendering is invisible to all of them, and the coverage
 * discriminants are rendered ONLY there.
 */
async function runTable(argv: string[]): Promise<string> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerRoleCommands(program);
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

/**
 * The `--help` a user actually reads for a path of subcommand names.
 *
 * Help text is code, and the Notes blocks in this file are load-bearing product
 * decisions — the standard is that an agent handed nothing but this text uses the
 * command correctly first time. `addHelpText("after")` is emitted by
 * `outputHelp`, NOT by `helpInformation()`, so a test built on the latter passes
 * against a command whose Notes were deleted.
 */
function renderHelp(path: readonly string[]): string {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerRoleCommands(program);

  let command: Command | undefined = program;
  for (const name of path) {
    command = command?.commands.find((c) => c.name() === name);
  }
  if (command === undefined) throw new Error(`No such command: nexus ${path.join(" ")}`);

  const chunks: string[] = [];
  command.configureOutput({ writeOut: (str) => chunks.push(str) });
  command.outputHelp();
  return chunks.join("");
}

/** Run `fn` with stderr captured — that is where every warning goes. */
async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    await fn();
  } finally {
    process.stderr.write = write;
  }
  return chunks.join("");
}

const ROLE_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ROLE_ID = "22222222-2222-2222-2222-222222222222";
const AGENT_ID = "33333333-3333-3333-3333-333333333333";
const GRANT_ID = "44444444-4444-4444-4444-444444444444";

/** The `{ roles, readiness }` list shape, which name resolution reads. */
function rolesList(roles: { id: string; name: string }[]) {
  return {
    roles: roles.map((r) => ({
      id: r.id,
      organizationId: "org_1",
      name: r.name,
      jobDescription: null,
      ownerUserId: "user_a",
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z"
    }))
  };
}

beforeEach(() => {
  request.mockReset();
  process.exitCode = 0;
});

// ═══════════════════════════════════════════════════════════════════════════
// Every read, on its exact path
// ═══════════════════════════════════════════════════════════════════════════

describe("the ten read verbs reach the paths the v1 contract declares", () => {
  it("lists roles off the collection path", async () => {
    request.mockResolvedValue(rolesList([]));

    await run(["role", "list"]);

    expect(request).toHaveBeenCalledWith("GET", "/roles");
  });

  it("gets one role by id, with no name lookup at all", async () => {
    request.mockResolvedValue({
      role: rolesList([{ id: ROLE_ID, name: "Support" }]).roles[0]
    });

    await run(["role", "get", ROLE_ID]);

    // A uuid must NOT cost a list call. One request, and it is the get.
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}`);
  });

  it("reads the systems off the Role-scoped resources path", async () => {
    request.mockResolvedValue({ resources: [] });

    await run(["role", "systems", ROLE_ID]);

    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}/resources`);
  });

  it("reads members off the members path", async () => {
    request.mockResolvedValue({ roleId: ROLE_ID, ownerUserId: "user_a", admins: [], members: [] });

    await run(["role", "members", ROLE_ID]);

    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}/members`);
  });

  it("reads permission sets off `permission-sets`, never `groups`", async () => {
    request.mockResolvedValue({ permissionSets: [] });

    await run(["role", "permission-sets", ROLE_ID]);

    // The internal HTTP route is `/groups`; v1 renamed it because `RoleGroup` and
    // `RoleGroupGrant` are different tables one character apart. A CLI that hit
    // `/groups` would 404 on v1 and read as a missing Role.
    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}/permission-sets`);
  });

  it("reads collection grants off their own path", async () => {
    request.mockResolvedValue({ grants: [] });

    await run(["role", "collection-grants", ROLE_ID]);

    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}/collection-grants`);
  });

  it("reads workspace grants off their own path", async () => {
    request.mockResolvedValue({ grants: [] });

    await run(["role", "workspace-grants", ROLE_ID]);

    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}/workspace-grants`);
  });

  it("sends no status query when --status is absent", async () => {
    request.mockResolvedValue({ requests: [] });

    await run(["role", "access-requests", ROLE_ID]);

    // `{ status: undefined }` is what the SDK sends, and the HTTP client drops
    // undefined values. Asserting the whole options object rather than reading it
    // back off the call, which would compare a value against itself.
    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}/access-requests`, {
      query: { status: undefined }
    });
  });

  it("upper-cases a lower-case --status rather than 400ing on the query string", async () => {
    request.mockResolvedValue({ requests: [] });

    await run(["role", "access-requests", ROLE_ID, "--status", "pending"]);

    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}/access-requests`, {
      query: { status: "PENDING" }
    });
  });

  it("refuses an unknown --status without calling the API", async () => {
    await run(["role", "access-requests", ROLE_ID, "--status", "waiting"]);

    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("reads coverage off the coverage path", async () => {
    request.mockResolvedValue(
      coverageFixture({ kind: "not-modelled", reason: "NO_WORKLOAD_MODEL" })
    );

    await run(["role", "coverage", ROLE_ID]);

    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}/coverage`);
  });

  it("reads the job-type library off the TOP-LEVEL literal, not under /roles", async () => {
    request.mockResolvedValue({ jobTypes: [], unreadable: [] });

    await run(["role", "job-types"]);

    // `roles/job-types` would sit at the same segment position as `:roleId` and
    // race it. The contract makes it a sibling for exactly that reason.
    expect(request).toHaveBeenCalledWith("GET", "/role-job-types");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Role-name resolution — the ergonomics, and the refusal that guards it
// ═══════════════════════════════════════════════════════════════════════════

describe("a <role> argument takes a name as well as a uuid", () => {
  it("resolves an exact name case-insensitively and then hits the real path", async () => {
    request
      .mockResolvedValueOnce(rolesList([{ id: ROLE_ID, name: "Support agent" }]))
      .mockResolvedValueOnce({ resources: [] });

    await run(["role", "systems", "support AGENT"]);

    expect(request).toHaveBeenNthCalledWith(1, "GET", "/roles");
    expect(request).toHaveBeenNthCalledWith(2, "GET", `/roles/${ROLE_ID}/resources`);
  });

  it("prefers an exact match over a substring one, rather than calling it ambiguous", async () => {
    request
      .mockResolvedValueOnce(
        rolesList([
          { id: ROLE_ID, name: "Support" },
          { id: OTHER_ROLE_ID, name: "Support agent" }
        ])
      )
      .mockResolvedValueOnce({ resources: [] });

    await run(["role", "systems", "Support"]);

    expect(request).toHaveBeenNthCalledWith(2, "GET", `/roles/${ROLE_ID}/resources`);
  });

  it("REFUSES an ambiguous name instead of picking, and never reaches the route", async () => {
    request.mockResolvedValueOnce(
      rolesList([
        { id: ROLE_ID, name: "Support tier one" },
        { id: OTHER_ROLE_ID, name: "Support tier two" }
      ])
    );

    await run(["role", "systems", "support"]);

    // Only the list call. `attach` MOVES a system off whichever Role held it, so
    // a silently wrong Role here takes a production system off another team.
    expect(request).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  it("refuses a name that matches nothing", async () => {
    request.mockResolvedValueOnce(rolesList([{ id: ROLE_ID, name: "Support" }]));

    await run(["role", "systems", "Billing"]);

    expect(request).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Writes — the bodies, and the two responses a 2xx does not describe
// ═══════════════════════════════════════════════════════════════════════════

describe("role create and delete report the governance discriminant, not the HTTP status", () => {
  it("posts name, owner and job description to the collection path", async () => {
    request.mockResolvedValue({
      status: "created",
      role: rolesList([{ id: ROLE_ID, name: "Refunds" }]).roles[0]
    });

    await run([
      "role",
      "create",
      "--name",
      "Refunds",
      "--owner",
      "user_abc",
      "--job-description",
      "Handles refunds"
    ]);

    expect(request).toHaveBeenCalledWith("POST", "/roles", {
      body: { name: "Refunds", ownerUserId: "user_abc", jobDescription: "Handles refunds" }
    });
  });

  it("omits jobDescription entirely when the flag is absent", async () => {
    request.mockResolvedValue({
      status: "created",
      role: rolesList([{ id: ROLE_ID, name: "Refunds" }]).roles[0]
    });

    await run(["role", "create", "--name", "Refunds", "--owner", "user_abc"]);

    expect(request).toHaveBeenCalledWith("POST", "/roles", {
      body: { name: "Refunds", ownerUserId: "user_abc" }
    });
    const [, , options] = request.mock.calls[0] ?? [];
    expect((options as { body: Record<string, unknown> }).body).not.toHaveProperty(
      "jobDescription"
    );
  });

  it("says NOTHING HAPPENED for a pending create, not 'created'", async () => {
    request.mockResolvedValue({
      status: "pending",
      request: { id: GRANT_ID, name: "Refunds", status: "PENDING" }
    });

    const out = await runTable(["role", "create", "--name", "Refunds", "--owner", "user_abc"]);

    // A 2xx with status "pending" means the Role does not exist. Printing
    // "created" here is the exact defect the union exists to prevent.
    expect(out).not.toContain("Role created");
    expect(out).toContain("Request filed for approval");
  });

  it("says the Role is still there for a pending delete", async () => {
    request.mockResolvedValue({ status: "pending", request: { id: GRANT_ID, status: "PENDING" } });

    const out = await runTable(["role", "delete", ROLE_ID]);

    expect(out).not.toContain("Role deleted");
    expect(out).toContain("Request filed for approval");
  });

  it("deletes off the Role path", async () => {
    request.mockResolvedValue({ status: "deleted" });

    await run(["role", "delete", ROLE_ID]);

    expect(request).toHaveBeenCalledWith("DELETE", `/roles/${ROLE_ID}`);
  });
});

/**
 * NEX-3630. `nexus role list --json` and `GET /public/v1/roles` both key their
 * payload `data` and put a DIFFERENT type behind it: the CLI joins readiness onto
 * each row and answers an array, the API answers an object of two parallel arrays
 * to be correlated on `roleId`. A parser written against one raised a type error
 * on the other.
 *
 * Both shapes are shipped and both are defensible, so the resolution is that the
 * divergence is DOCUMENTED — in this command's `--help` and in the endpoint's own
 * description — rather than either wire contract being broken. This pins the CLI
 * half so the documented sentence cannot go stale silently.
 */
describe("role list --json is a JOIN, and its help says so", () => {
  const LISTED = {
    roles: [
      {
        id: ROLE_ID,
        organizationId: "org_1",
        name: "Support",
        jobDescription: null,
        ownerUserId: "user_a",
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z"
      },
      {
        id: OTHER_ROLE_ID,
        organizationId: "org_1",
        name: "Refunds",
        jobDescription: null,
        ownerUserId: null,
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z"
      }
    ],
    // The API's second array, deliberately covering only the first Role.
    readiness: [{ roleId: ROLE_ID, permissionSets: "READY", owner: "READY" }]
  };

  it("answers data as an ARRAY of rows, each carrying its own readiness", async () => {
    request.mockResolvedValue(LISTED);

    const out = await runJson(["role", "list"]);
    const rows = out.data as { id: string; readiness: unknown }[];

    expect(Array.isArray(out.data)).toBe(true);
    expect(rows.map((r) => r.id)).toEqual([ROLE_ID, OTHER_ROLE_ID]);
    expect(rows[0]?.readiness).toMatchObject({ permissionSets: "READY", owner: "READY" });
    // A Role the server computed no readiness for is null, never a missing key —
    // the join must not make a row look like it has an answer.
    expect(rows[1]?.readiness).toBeNull();
    // And NOT the API's shape, which is the whole point of documenting it.
    expect(out.data).not.toHaveProperty("roles");
  });

  it("names the API's divergent shape in --help, in the words a caller can act on", () => {
    // `helpInformation()` renders the usage block only — an `addHelpText("after")`
    // block reaches the reader through `outputHelp`, so asserting the first would
    // pass on a command carrying no Notes at all.
    const help = renderHelp(["role", "list"]);

    expect(help).toContain("GET /public/v1/roles");
    expect(help).toContain("parallel arrays");
    expect(help).toContain("nexus api GET /roles");
  });
});

/**
 * NEX-3629. `--body` exists so a caller can pass text that breaks shell quoting,
 * and `name` is the field most likely to carry an apostrophe or an accent. A
 * `requiredOption` is enforced by commander BEFORE the action runs, so it cannot
 * see the body at all: a complete body was refused with
 * "required option '--name <name>' not specified".
 */
describe("role create takes name and owner from --body", () => {
  const created = () => ({
    status: "created",
    role: rolesList([{ id: ROLE_ID, name: "Réclamations" }]).roles[0]
  });

  it("accepts a complete --body with no flags at all", async () => {
    request.mockResolvedValue(created());

    await run([
      "role",
      "create",
      "--body",
      JSON.stringify({
        name: "Réclamations d'été",
        ownerUserId: "user_abc",
        jobDescription: "Gère les remboursements"
      })
    ]);

    expect(request).toHaveBeenCalledWith("POST", "/roles", {
      body: {
        name: "Réclamations d'été",
        ownerUserId: "user_abc",
        jobDescription: "Gère les remboursements"
      }
    });
  });

  it("lets a flag win over the same field in the body", async () => {
    request.mockResolvedValue(created());

    await run([
      "role",
      "create",
      "--body",
      JSON.stringify({ name: "From body", ownerUserId: "user_body" }),
      "--name",
      "From flag"
    ]);

    // `mergeBodyWithFlags`'s precedence: an explicitly typed flag beats the file.
    // `ownerUserId` was not re-stated, so the body's value survives — which is
    // only true because neither option carries a commander default.
    expect(request).toHaveBeenCalledWith("POST", "/roles", {
      body: { name: "From flag", ownerUserId: "user_body" }
    });
  });

  it("still refuses when NEITHER source supplies them, naming both flags", async () => {
    const err = await captureError(["role", "create"]);

    // The requirement is unchanged — only the moment it is checked. And the
    // refusal names `--owner`, which is what a user types; the body key is
    // `ownerUserId`, which commander would have rejected.
    expect(err).toContain("--name");
    expect(err).toContain("--owner");
    expect(err).not.toContain("--owner-user-id");
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a body that carries only one of the two, naming just the missing one", async () => {
    const err = await captureError([
      "role",
      "create",
      "--body",
      JSON.stringify({ name: "Refunds" })
    ]);

    expect(err).toContain("--owner");
    expect(err).not.toContain("--name");
    expect(request).not.toHaveBeenCalled();
  });
});

/**
 * NEX-3627. The union's own doc says *"READ `status`. NEVER THE HTTP CODE"*, and
 * under `--json` there was no `status` to read: create answered
 * `{success, id, name}` and delete `{success, note}`. Every case below asserts
 * the field a script branches on, on the document a script parses.
 */
describe("the governance discriminant survives --json", () => {
  it("carries status created beside the new Role's id", async () => {
    request.mockResolvedValue({
      status: "created",
      role: rolesList([{ id: ROLE_ID, name: "Refunds" }]).roles[0]
    });

    const out = await runJson(["role", "create", "--name", "Refunds", "--owner", "user_abc"]);

    expect(out).toMatchObject({ success: true, status: "created", id: ROLE_ID, name: "Refunds" });
  });

  it("carries status pending and the requestId when the create was only FILED", async () => {
    request.mockResolvedValue({
      status: "pending",
      request: { id: GRANT_ID, name: "Refunds", status: "PENDING" }
    });

    const out = await runJson(["role", "create", "--name", "Refunds", "--owner", "user_abc"]);

    // The whole defect in one assertion: this document and the one above were
    // byte-identical apart from `id`/`name`, so a script could not tell a Role
    // that exists from a request waiting on an admin.
    expect(out).toMatchObject({ success: true, status: "pending", requestId: GRANT_ID });
    expect(out).not.toHaveProperty("id");
  });

  it("carries status deleted", async () => {
    request.mockResolvedValue({ status: "deleted" });

    const out = await runJson(["role", "delete", ROLE_ID]);

    expect(out).toMatchObject({ success: true, status: "deleted" });
  });

  it("carries status pending for a delete that did NOT happen", async () => {
    request.mockResolvedValue({ status: "pending", request: { id: GRANT_ID, status: "PENDING" } });

    const out = await runJson(["role", "delete", ROLE_ID]);

    // A pending delete leaves the Role serving traffic while `success` is true.
    expect(out).toMatchObject({ success: true, status: "pending", requestId: GRANT_ID });
  });

  it("prints the discriminant in the human rendering too", async () => {
    request.mockResolvedValue({
      status: "created",
      role: rolesList([{ id: ROLE_ID, name: "Refunds" }]).roles[0]
    });

    const out = await runTable(["role", "create", "--name", "Refunds", "--owner", "user_abc"]);

    expect(out).toContain("status: created");
  });
});

/**
 * NEX-3628. Four Roles writes answered `null` with a human sentence under
 * `--json`, so detecting absence was a string match against display copy — the
 * working detection literally read
 * `if moved_from and "belonged to no Role" not in str(moved_from)`. The same
 * fields are proper nulls on the matching GET, because reads go through
 * `printRecord`, whose `format` never touches the JSON document.
 *
 * Each case asserts BOTH halves: `null` on the wire, and the sentence still in
 * the terminal, which reads well and was never the problem.
 */
describe("--json emits null where the human rendering reads a sentence", () => {
  it("attach: movedFrom is null, not '(it belonged to no Role)'", async () => {
    request.mockResolvedValue({ attached: true, movedFromRoleId: null });

    const out = await runJson(["role", "attach", ROLE_ID, "--type", "agent", "--id", AGENT_ID]);

    expect(out.movedFrom).toBeNull();
    expect(typeof out.movedFrom).not.toBe("string");
  });

  it("attach: a REAL move still carries the uuid — nulling is not blanket", async () => {
    request.mockResolvedValue({ attached: true, movedFromRoleId: OTHER_ROLE_ID });

    const out = await runJson(["role", "attach", ROLE_ID, "--type", "agent", "--id", AGENT_ID]);

    // The seizure signal. A fix that mapped every value to null would pass the
    // assertion above and destroy the field this one guards.
    expect(out.movedFrom).toBe(OTHER_ROLE_ID);
  });

  it("detach: removedFromRole is null when there was nothing to leave", async () => {
    request.mockResolvedValue({ removed: false, removedFromRoleId: null });

    const out = await runJson(["role", "detach", "agent", AGENT_ID]);

    expect(out).toMatchObject({ removed: false, removedFromRole: null });
  });

  it("update --owner none: owner is null, matching what role get reads back", async () => {
    request.mockResolvedValue({
      role: { ...rolesList([{ id: ROLE_ID, name: "Refunds" }]).roles[0], ownerUserId: null }
    });

    const out = await runJson(["role", "update", ROLE_ID, "--owner", "none"]);

    expect(out.owner).toBeNull();
  });

  it("set-working-year --sickness none: sicknessDays is null, and 0 stays 0", async () => {
    request.mockResolvedValue({
      roleId: ROLE_ID,
      calendarWeeks: 52,
      paidLeaveWeeks: 5,
      publicHolidayDays: 0,
      sicknessDays: null
    });

    const out = await runJson([
      "role",
      "set-working-year",
      ROLE_ID,
      "--calendar-weeks",
      "52",
      "--paid-leave",
      "5",
      "--public-holidays",
      "0",
      "--sickness",
      "none"
    ]);

    // THE distinction this whole family exists for: null is "use the
    // organization's value", 0 is a measured zero, and they produce different
    // coverage denominators. "(org default)" collapses the pair into prose.
    expect(out.sicknessDays).toBeNull();
    expect(out.publicHolidayDays).toBe(0);
  });

  it("set-automation-settings --currency none: currency is null", async () => {
    request.mockResolvedValue({
      organizationId: "org_1",
      hoursPerDay: 8,
      daysPerWeek: 5,
      workingWeeksPerYear: 46,
      currency: null
    });

    const out = await runJson([
      "role",
      "set-automation-settings",
      "--hours-per-day",
      "8",
      "--days-per-week",
      "5",
      "--working-weeks",
      "46",
      "--currency",
      "none"
    ]);

    expect(out.currency).toBeNull();
  });

  it("review-creation-request: createdRoleId is null on a REJECTED verdict", async () => {
    request.mockResolvedValue({
      request: { id: GRANT_ID, status: "REJECTED", createdRoleId: null }
    });

    const out = await runJson([
      "role",
      "review-creation-request",
      GRANT_ID,
      "--status",
      "REJECTED"
    ]);

    expect(out.createdRoleId).toBeNull();
  });

  it("keeps every sentence in the human rendering, which is where they read well", async () => {
    request.mockResolvedValue({ attached: true, movedFromRoleId: null });
    expect(
      await runTable(["role", "attach", ROLE_ID, "--type", "agent", "--id", AGENT_ID])
    ).toContain("(it belonged to no Role)");

    request.mockResolvedValue({
      role: { ...rolesList([{ id: ROLE_ID, name: "Refunds" }]).roles[0], ownerUserId: null }
    });
    expect(await runTable(["role", "update", ROLE_ID, "--owner", "none"])).toContain("(none)");

    request.mockResolvedValue({ roleId: ROLE_ID, sicknessDays: null });
    expect(
      await runTable([
        "role",
        "set-working-year",
        ROLE_ID,
        "--calendar-weeks",
        "52",
        "--paid-leave",
        "5",
        "--public-holidays",
        "10",
        "--sickness",
        "none"
      ])
    ).toContain("(org default)");
  });
});

describe("role update", () => {
  beforeEach(() => {
    request.mockResolvedValue({ role: rolesList([{ id: ROLE_ID, name: "Refunds" }]).roles[0] });
  });

  it("patches only the fields that were given", async () => {
    await run(["role", "update", ROLE_ID, "--name", "Refunds and disputes"]);

    expect(request).toHaveBeenCalledWith("PATCH", `/roles/${ROLE_ID}`, {
      body: { name: "Refunds and disputes" }
    });
  });

  it("turns --owner none into a literal null, which CLEARS ownership", async () => {
    await run(["role", "update", ROLE_ID, "--owner", "none"]);

    // Omitting the key leaves the owner alone and `null` clears it, so "clear
    // it" cannot be said by leaving the flag off — null has to reach the wire.
    expect(request).toHaveBeenCalledWith("PATCH", `/roles/${ROLE_ID}`, {
      body: { ownerUserId: null }
    });
  });

  it("passes a real owner id straight through", async () => {
    await run(["role", "update", ROLE_ID, "--owner", "user_xyz"]);

    expect(request).toHaveBeenCalledWith("PATCH", `/roles/${ROLE_ID}`, {
      body: { ownerUserId: "user_xyz" }
    });
  });
});

describe("attach is a MOVE, and the CLI says so", () => {
  it("posts the pair to the Role's resources path", async () => {
    request.mockResolvedValue({ attached: true, movedFromRoleId: null });

    await run(["role", "attach", ROLE_ID, "--type", "agent", "--id", AGENT_ID]);

    expect(request).toHaveBeenCalledWith("POST", `/roles/${ROLE_ID}/resources`, {
      body: { resourceType: "agent", resourceId: AGENT_ID }
    });
  });

  it("warns, on stderr, that another Role lost the system", async () => {
    request.mockResolvedValue({ attached: true, movedFromRoleId: OTHER_ROLE_ID });

    const stderr: string[] = [];
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      stderr.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      await run(["role", "attach", ROLE_ID, "--type", "agent", "--id", AGENT_ID]);
    } finally {
      process.stderr.write = write;
    }

    // `movedFromRoleId` is the ONLY signal that another team's access just went.
    // A CLI that printed a bare success would hide a seizure behind a tick.
    const out = stderr.join("");
    expect(out).toContain("MOVE");
    expect(out).toContain(OTHER_ROLE_ID);
  });

  it("refuses a resource type from the PERMISSIONS vocabulary, without calling the API", async () => {
    // `knowledge` is a valid PermissionResourceType and is not a RoleResourceType.
    // Forwarded, it would 400 on the request body and read as a bad id.
    await run(["role", "attach", ROLE_ID, "--type", "knowledge", "--id", AGENT_ID]);

    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("detach names no Role", () => {
  it("deletes off the top-level role-resources literal", async () => {
    request.mockResolvedValue({ removed: true, removedFromRoleId: ROLE_ID });

    await run(["role", "detach", "agent", AGENT_ID]);

    expect(request).toHaveBeenCalledWith("DELETE", `/role-resources/agent/${AGENT_ID}`);
  });

  it("reports removed=false as a success rather than an error", async () => {
    request.mockResolvedValue({ removed: false, removedFromRoleId: null });

    await run(["role", "detach", "agent", AGENT_ID]);

    expect(process.exitCode).toBe(0);
  });
});

describe("membership and grant writes", () => {
  it("removes a standing by (role, user)", async () => {
    request.mockResolvedValue({ removed: true });

    await run(["role", "remove-member", ROLE_ID, "user_abc"]);

    expect(request).toHaveBeenCalledWith("DELETE", `/roles/${ROLE_ID}/members/user_abc`);
  });

  it("grants a collection with the id in the BODY, not the path", async () => {
    request.mockResolvedValue({ grant: { id: GRANT_ID, collectionId: AGENT_ID } });

    await run(["role", "grant-collection", ROLE_ID, AGENT_ID]);

    expect(request).toHaveBeenCalledWith("POST", `/roles/${ROLE_ID}/collection-grants`, {
      body: { collectionId: AGENT_ID }
    });
  });

  it("revokes a collection grant by GRANT id in the path", async () => {
    request.mockResolvedValue({ removed: true });

    await run(["role", "revoke-collection", ROLE_ID, GRANT_ID]);

    expect(request).toHaveBeenCalledWith(
      "DELETE",
      `/roles/${ROLE_ID}/collection-grants/${GRANT_ID}`
    );
  });

  it("grants a workspace with the id in the BODY", async () => {
    request.mockResolvedValue({ grant: { id: GRANT_ID, workspaceId: AGENT_ID } });

    await run(["role", "grant-workspace", ROLE_ID, AGENT_ID]);

    expect(request).toHaveBeenCalledWith("POST", `/roles/${ROLE_ID}/workspace-grants`, {
      body: { workspaceId: AGENT_ID }
    });
  });

  it("revokes a workspace grant by GRANT id in the path", async () => {
    request.mockResolvedValue({ removed: true });

    await run(["role", "revoke-workspace", ROLE_ID, GRANT_ID]);

    expect(request).toHaveBeenCalledWith(
      "DELETE",
      `/roles/${ROLE_ID}/workspace-grants/${GRANT_ID}`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The table renderings that carry a discriminant
// ═══════════════════════════════════════════════════════════════════════════

/** A minimal but complete `RoleCoverageView`, with the ratio arm swapped in. */
function coverageFixture(coverage: Record<string, unknown>) {
  return {
    roleId: ROLE_ID,
    coverage,
    workloadPersonHours: null,
    impactPersonHours: 0,
    contributions: [],
    measuredInputKeys: [],
    integrity: { status: "OK", warnings: [] },
    workingTime: null,
    workload: null,
    money: { kind: "not-modelled", reason: "NO_CURRENCY" },
    savingsProjection: { kind: "unavailable", reason: "NO_CURRENCY" },
    unmodelledSystems: []
  };
}

describe("coverage never renders an unmeasured Role as a number", () => {
  it("prints 'not modelled' with its reason, never 0%", async () => {
    request.mockResolvedValue(
      coverageFixture({ kind: "not-modelled", reason: "NO_WORKLOAD_MODEL" })
    );

    const out = await runTable(["role", "coverage", ROLE_ID]);

    expect(out).toContain("not modelled");
    expect(out).toContain("NO_WORKLOAD_MODEL");
    expect(out).not.toContain("0.00%");
  });

  it("prints a percentage from the modelled arm, scaled from a FRACTION", async () => {
    request.mockResolvedValue(coverageFixture({ kind: "modelled", ratio: 0.1828 }));

    const out = await runTable(["role", "coverage", ROLE_ID]);

    // `ratio` is 0.1828, not 18.28. Printing it unscaled would report 0.18%.
    expect(out).toContain("18.28%");
  });
});

describe("an empty permission-set list is not reported as the Role's answer", () => {
  it("warns that the sets may not have been seeded yet", async () => {
    request.mockResolvedValue({ permissionSets: [] });

    const stderr: string[] = [];
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      stderr.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      await run(["role", "permission-sets", ROLE_ID]);
    } finally {
      process.stderr.write = write;
    }

    expect(stderr.join("")).toContain("PENDING");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The 25 descriptors that landed after the first pass
// ═══════════════════════════════════════════════════════════════════════════

describe("permission-set writes", () => {
  it("posts name, surfaces, relation and capabilities", async () => {
    request.mockResolvedValue({
      permissionSet: { id: GRANT_ID, name: "Reviewers" },
      resourceReach: "listed_surfaces"
    });

    await run([
      "role",
      "create-permission-set",
      ROLE_ID,
      "--name",
      "Reviewers",
      "--surfaces",
      "inbox,agents",
      "--relation",
      "viewer",
      "--capabilities",
      "role.view,team.view"
    ]);

    expect(request).toHaveBeenCalledWith("POST", `/roles/${ROLE_ID}/permission-sets`, {
      body: {
        name: "Reviewers",
        surfaces: ["inbox", "agents"],
        resourceRelation: "viewer",
        capabilities: ["role.view", "team.view"]
      }
    });
  });

  it("turns --relation none into a literal null, a capability-only set", async () => {
    request.mockResolvedValue({
      permissionSet: { id: GRANT_ID, name: "Auditors" },
      resourceReach: "capability_only"
    });

    await run([
      "role",
      "create-permission-set",
      ROLE_ID,
      "--name",
      "Auditors",
      "--surfaces",
      "*",
      "--relation",
      "none"
    ]);

    const [, , options] = request.mock.calls[0] ?? [];
    expect((options as { body: Record<string, unknown> }).body.resourceRelation).toBeNull();
  });

  it("warns when the server reports the set reaches NOTHING", async () => {
    request.mockResolvedValue({
      permissionSet: { id: GRANT_ID, name: "Broken" },
      resourceReach: "no_surface"
    });

    const stderr = await captureStderr(() =>
      run([
        "role",
        "create-permission-set",
        ROLE_ID,
        "--name",
        "Broken",
        "--surfaces",
        "inbox",
        "--relation",
        "viewer"
      ])
    );

    expect(stderr).toContain("reaches NOTHING");
  });

  it("does NOT warn for a capability-only set, which reaches nothing by design", async () => {
    request.mockResolvedValue({
      permissionSet: { id: GRANT_ID, name: "Auditors" },
      resourceReach: "capability_only"
    });

    const stderr = await captureStderr(() =>
      run([
        "role",
        "create-permission-set",
        ROLE_ID,
        "--name",
        "Auditors",
        "--surfaces",
        "*",
        "--relation",
        "none"
      ])
    );

    expect(stderr).not.toContain("reaches NOTHING");
  });

  it("patches a permission set on the nested path", async () => {
    request.mockResolvedValue({
      permissionSet: { id: GRANT_ID, name: "Reviewers" },
      resourceReach: "every_surface"
    });

    await run(["role", "update-permission-set", ROLE_ID, GRANT_ID, "--surfaces", "*"]);

    expect(request).toHaveBeenCalledWith("PATCH", `/roles/${ROLE_ID}/permission-sets/${GRANT_ID}`, {
      body: { surfaces: ["*"] }
    });
  });

  it("deletes a permission set on the nested path", async () => {
    request.mockResolvedValue({ removed: true });

    await run(["role", "delete-permission-set", ROLE_ID, GRANT_ID]);

    expect(request).toHaveBeenCalledWith("DELETE", `/roles/${ROLE_ID}/permission-sets/${GRANT_ID}`);
  });
});

/**
 * Permission-set MEMBERSHIP, which is a different write from the set itself.
 *
 * The SDK reachability gate proves a call site for each route exists; it reads
 * text and cannot prove the CLI sends the right one. These pin the verb, the
 * nested path and the body — the three a typo moves without failing anything
 * else — and the idempotent answers, which are the part a caller gets wrong.
 */
describe("permission-set membership", () => {
  const USER_ID = "user_abc";

  it("posts the user on the set's nested members path", async () => {
    request.mockResolvedValue({ added: true });

    await run(["role", "add-permission-set-member", ROLE_ID, GRANT_ID, USER_ID]);

    expect(request).toHaveBeenCalledWith(
      "POST",
      `/roles/${ROLE_ID}/permission-sets/${GRANT_ID}/members`,
      { body: { userId: USER_ID } }
    );
  });

  it("deletes the user on the set's nested members path", async () => {
    request.mockResolvedValue({ removed: true });

    await run(["role", "remove-permission-set-member", ROLE_ID, GRANT_ID, USER_ID]);

    expect(request).toHaveBeenCalledWith(
      "DELETE",
      `/roles/${ROLE_ID}/permission-sets/${GRANT_ID}/members/${USER_ID}`
    );
  });

  /**
   * `added: false` is a SUCCESS — the caller asked for a state that already
   * holds. Reported as a failure it would make a re-run of a script look broken,
   * and the boolean is the only place "did anything move" lives, since the
   * status is 201 either way.
   */
  it("reports an already-seated user as a success carrying added false", async () => {
    request.mockResolvedValue({ added: false });

    const out = await runJson(["role", "add-permission-set-member", ROLE_ID, GRANT_ID, USER_ID]);

    expect(out).toMatchObject({ added: false });
    expect(process.exitCode).toBe(0);
  });

  it("reports a user who was never in the set as a success carrying removed false", async () => {
    request.mockResolvedValue({ removed: false });

    const out = await runJson(["role", "remove-permission-set-member", ROLE_ID, GRANT_ID, USER_ID]);

    expect(out).toMatchObject({ removed: false });
    expect(process.exitCode).toBe(0);
  });

  /**
   * The precondition is the whole trap: a user outside the Role answers 404 with
   * the same body a bad set id gets, so a caller who does not know to seat the
   * standing first cannot tell the two apart. `help-completeness` asserts a
   * `Notes:` block EXISTS; only this asserts it still says the load-bearing part.
   */
  it("the add's help states that the user must already hold the Role", () => {
    const help = renderHelp(["role", "add-permission-set-member"]);

    expect(help).toContain("MUST ALREADY BE IN THE ROLE");
    expect(help).toContain("add-member");
  });

  /** Reaching for `delete-permission-set` to drop one person is the costly error. */
  it("the remove's help sends a caller away from deleting the whole set", () => {
    const help = renderHelp(["role", "remove-permission-set-member"]);

    expect(help).toContain("delete-permission-set");
    expect(help).toContain("NOT a");
  });
});

describe("access request create and review", () => {
  it("posts the system pair and sends note null when the flag is absent", async () => {
    request.mockResolvedValue({ request: { id: GRANT_ID, status: "PENDING" } });

    await run(["role", "request-access", ROLE_ID, "--type", "agent", "--id", AGENT_ID]);

    // `note` is required-and-nullable on the wire, so it must be sent as null
    // rather than omitted.
    expect(request).toHaveBeenCalledWith("POST", `/roles/${ROLE_ID}/access-requests`, {
      body: { resourceType: "agent", resourceId: AGENT_ID, note: null }
    });
  });

  it("refuses a verdict of PENDING, which is a start state and never a target", async () => {
    await run(["role", "review-access", ROLE_ID, GRANT_ID, "--status", "PENDING"]);

    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("case-folds a lower-case verdict and patches the nested path", async () => {
    request.mockResolvedValue({ request: { id: GRANT_ID, status: "APPROVED" } });

    await run(["role", "review-access", ROLE_ID, GRANT_ID, "--status", "approved"]);

    expect(request).toHaveBeenCalledWith("PATCH", `/roles/${ROLE_ID}/access-requests/${GRANT_ID}`, {
      body: { status: "APPROVED" }
    });
  });
});

describe("governance queues", () => {
  it("reads the org-admin-only settings off its own literal", async () => {
    request.mockResolvedValue({ settings: [] });

    await run(["role", "governance"]);

    expect(request).toHaveBeenCalledWith("GET", "/role-management-settings");
  });

  it("lists creation requests with a status filter", async () => {
    request.mockResolvedValue({ requests: [] });

    await run(["role", "creation-requests", "--status", "pending"]);

    expect(request).toHaveBeenCalledWith("GET", "/role-creation-requests", {
      query: { status: "PENDING" }
    });
  });

  it("gets one creation request", async () => {
    request.mockResolvedValue({ request: { id: GRANT_ID, status: "PENDING" } });

    await run(["role", "creation-request", GRANT_ID]);

    expect(request).toHaveBeenCalledWith("GET", `/role-creation-requests/${GRANT_ID}`);
  });

  it("reviews a creation request — the write that actually creates the Role", async () => {
    request.mockResolvedValue({
      request: { id: GRANT_ID, status: "APPROVED", createdRoleId: ROLE_ID }
    });

    await run(["role", "review-creation-request", GRANT_ID, "--status", "APPROVED"]);

    expect(request).toHaveBeenCalledWith("PATCH", `/role-creation-requests/${GRANT_ID}`, {
      body: { status: "APPROVED" }
    });
  });

  it("lists and reviews deletion requests", async () => {
    request.mockResolvedValue({ requests: [] });
    await run(["role", "deletion-requests"]);
    expect(request).toHaveBeenCalledWith("GET", "/role-deletion-requests", {
      query: { status: undefined }
    });

    request.mockReset();
    request.mockResolvedValue({ request: { id: GRANT_ID, status: "REJECTED", roleId: ROLE_ID } });
    await run(["role", "review-deletion-request", GRANT_ID, "--status", "REJECTED"]);
    expect(request).toHaveBeenCalledWith("PATCH", `/role-deletion-requests/${GRANT_ID}`, {
      body: { status: "REJECTED" }
    });
  });

  it("warns that a Role's systems are orphaned when a deletion is APPROVED", async () => {
    request.mockResolvedValue({ request: { id: GRANT_ID, status: "APPROVED", roleId: ROLE_ID } });

    const stderr = await captureStderr(() =>
      run(["role", "review-deletion-request", GRANT_ID, "--status", "APPROVED"])
    );

    expect(stderr).toContain("ORPHAN");
  });

  it("gets one deletion request", async () => {
    request.mockResolvedValue({ request: { id: GRANT_ID, status: "PENDING", roleId: ROLE_ID } });

    await run(["role", "deletion-request", GRANT_ID]);

    expect(request).toHaveBeenCalledWith("GET", `/role-deletion-requests/${GRANT_ID}`);
  });
});

describe("the job model — null is not zero", () => {
  const JOB_TYPE = {
    name: "Support agent",
    basis: "SALARY",
    group: "PEOPLE",
    category: "Support",
    quantityUnit: "people",
    note: null,
    fte: null,
    parts: [{ key: "gross", label: "Gross", unit: "EUR/yr", source: { kind: "fixed", value: 1 } }],
    costExpression: null,
    hoursExpression: null,
    revenueExpression: null
  };

  it("posts the whole body verbatim, nulls included", async () => {
    request.mockResolvedValue({ jobType: { id: GRANT_ID, name: "x" }, repricedScopeLines: 0 });

    await run(["role", "create-job-type", "--body", JSON.stringify(JOB_TYPE)]);

    // Every null must survive to the wire. A body helper that stripped them would
    // turn "full contract" into a 400, or worse into a defaulted number.
    expect(request).toHaveBeenCalledWith("POST", "/role-job-types", { body: JOB_TYPE });
  });

  it("PUTs an update on the id path", async () => {
    request.mockResolvedValue({ jobType: { id: GRANT_ID, name: "x" }, repricedScopeLines: 4 });

    await run(["role", "update-job-type", GRANT_ID, "--body", JSON.stringify(JOB_TYPE)]);

    expect(request).toHaveBeenCalledWith("PUT", `/role-job-types/${GRANT_ID}`, { body: JOB_TYPE });
  });

  it("warns about the org-wide blast radius when scope lines were repriced", async () => {
    request.mockResolvedValue({ jobType: { id: GRANT_ID, name: "x" }, repricedScopeLines: 4 });

    const stderr = await captureStderr(() =>
      run(["role", "update-job-type", GRANT_ID, "--body", JSON.stringify(JOB_TYPE)])
    );

    expect(stderr).toContain("REPRICED");
  });

  it("deletes a job type", async () => {
    request.mockResolvedValue({ id: GRANT_ID });

    await run(["role", "delete-job-type", GRANT_ID]);

    expect(request).toHaveBeenCalledWith("DELETE", `/role-job-types/${GRANT_ID}`);
  });
});

describe("automation settings", () => {
  it("reads them off their own literal", async () => {
    request.mockResolvedValue({ organizationId: "org_1", hoursPerDay: 8, currency: "EUR" });

    await run(["role", "automation-settings"]);

    expect(request).toHaveBeenCalledWith("GET", "/role-automation-settings");
  });

  it("PUTs all four fields, with --currency none as a literal null", async () => {
    request.mockResolvedValue({ organizationId: "org_1", currency: null });

    await run([
      "role",
      "set-automation-settings",
      "--hours-per-day",
      "8",
      "--days-per-week",
      "5",
      "--working-weeks",
      "46",
      "--currency",
      "none"
    ]);

    expect(request).toHaveBeenCalledWith("PUT", "/role-automation-settings", {
      body: { hoursPerDay: 8, daysPerWeek: 5, workingWeeksPerYear: 46, currency: null }
    });
  });

  it("refuses a partial PUT locally, naming every missing flag at once", async () => {
    await run(["role", "set-automation-settings", "--hours-per-day", "8"]);

    // The route replaces the whole object, so a missing field is a 400. Naming
    // them all beats one round trip per omission.
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("refuses a zero working day rather than sending it", async () => {
    await run([
      "role",
      "set-automation-settings",
      "--hours-per-day",
      "0",
      "--days-per-week",
      "5",
      "--working-weeks",
      "46",
      "--currency",
      "EUR"
    ]);

    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("scope lines and variables replace the whole list", () => {
  it("reads scope lines and warns about unresolved variables", async () => {
    request.mockResolvedValue({ lines: [], unresolvedVariables: ["headcount"] });

    const stderr = await captureStderr(() => run(["role", "scope-lines", ROLE_ID]));

    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}/scope-lines`);
    expect(stderr).toContain("headcount");
  });

  it("PUTs the whole scope-line list", async () => {
    request.mockResolvedValue({ lines: [], unresolvedVariables: [] });
    const body = { lines: [{ jobTypeId: AGENT_ID, quantity: 0, scope: "tier one" }] };

    await run(["role", "set-scope-lines", ROLE_ID, "--body", JSON.stringify(body)]);

    // quantity 0 must survive: it records a decision and is not a delete.
    expect(request).toHaveBeenCalledWith("PUT", `/roles/${ROLE_ID}/scope-lines`, { body });
  });

  it("reads variables and renders an unset value as unset, never as 0", async () => {
    request.mockResolvedValue({
      variables: [
        {
          key: "rate",
          label: "Rate",
          description: null,
          unit: null,
          value: null,
          id: "v1",
          position: 0,
          updatedAt: "x"
        }
      ]
    });

    const out = await runTable(["role", "variables", ROLE_ID]);

    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}/variables`);
    expect(out).toContain("(unset)");
    expect(out).not.toMatch(/\brate\s+Rate\s+0\b/);
  });

  it("PUTs the whole variable list with nulls intact", async () => {
    request.mockResolvedValue({ variables: [] });
    const body = {
      variables: [{ key: "rate", label: "Rate", description: null, unit: null, value: null }]
    };

    await run(["role", "set-variables", ROLE_ID, "--body", JSON.stringify(body)]);

    expect(request).toHaveBeenCalledWith("PUT", `/roles/${ROLE_ID}/variables`, { body });
  });
});

describe("working year — none is not zero", () => {
  it("reads the override", async () => {
    request.mockResolvedValue({ roleId: ROLE_ID, calendarWeeks: null });

    await run(["role", "working-year", ROLE_ID]);

    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}/working-year`);
  });

  it("sends none as null and 0 as zero, in the same request", async () => {
    request.mockResolvedValue({ roleId: ROLE_ID });

    await run([
      "role",
      "set-working-year",
      ROLE_ID,
      "--calendar-weeks",
      "52",
      "--paid-leave",
      "5",
      "--public-holidays",
      "0",
      "--sickness",
      "none"
    ]);

    // THE distinction in this family: 0 asserts a measured zero, null says "use
    // the organization's value". They produce different coverage denominators and
    // nothing downstream reports which was meant.
    expect(request).toHaveBeenCalledWith("PUT", `/roles/${ROLE_ID}/working-year`, {
      body: {
        calendarWeeks: 52,
        paidLeaveWeeks: 5,
        publicHolidayDays: 0,
        sicknessDays: null
      }
    });
  });

  it("refuses a partial working-year PUT", async () => {
    await run(["role", "set-working-year", ROLE_ID, "--calendar-weeks", "52"]);

    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("system policy", () => {
  it("reads the policy", async () => {
    request.mockResolvedValue({ roleId: ROLE_ID, allowProposals: true });

    await run(["role", "system-policy", ROLE_ID]);

    expect(request).toHaveBeenCalledWith("GET", `/roles/${ROLE_ID}/system-policy`);
  });

  it("PUTs all five booleans", async () => {
    request.mockResolvedValue({ roleId: ROLE_ID });

    await run([
      "role",
      "set-system-policy",
      ROLE_ID,
      "--allow-proposals",
      "true",
      "--require-review",
      "true",
      "--start-paused",
      "true",
      "--auto-push",
      "false",
      "--notify-takeover",
      "true"
    ]);

    expect(request).toHaveBeenCalledWith("PUT", `/roles/${ROLE_ID}/system-policy`, {
      body: {
        allowProposals: true,
        requireReview: true,
        startPaused: true,
        autoPush: false,
        notifyTakeover: true
      }
    });
  });

  it("refuses a boolean typo rather than reading it as false", async () => {
    await run([
      "role",
      "set-system-policy",
      ROLE_ID,
      "--allow-proposals",
      "yes",
      "--require-review",
      "true",
      "--start-paused",
      "true",
      "--auto-push",
      "false",
      "--notify-takeover",
      "true"
    ]);

    // A typo silently disabling a review gate is the worst outcome available here.
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bugbot findings on #3042 — the exact strings a user reads
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Capture the CLI error message a user actually reads, from BOTH channels.
 *
 * `handleError` renders to stdout as JSON under `--json` and to stderr in table
 * mode, so watching one channel misses the message entirely — this helper watched
 * only stderr on its first draft and every assertion failed against `''` while the
 * messages were already correct. Asserting on the exact flag STRING is the point:
 * the derivation this replaces produced plausible flags that did not exist, and
 * nothing shape-level noticed.
 */
async function captureError(argv: string[]): Promise<string> {
  const chunks: string[] = [];
  const write = process.stderr.write.bind(process.stderr);
  const log = console.log;
  process.stderr.write = ((chunk: string) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };
  try {
    await run(argv);
  } finally {
    process.stderr.write = write;
    console.log = log;
  }
  process.exitCode = 0;
  return chunks.join("");
}

describe("a partial PUT names the flags a user can actually type", () => {
  it("names --working-weeks, never the kebab-cased body key", async () => {
    const err = await captureError([
      "role",
      "set-automation-settings",
      "--hours-per-day",
      "8",
      "--days-per-week",
      "5",
      "--currency",
      "EUR"
    ]);

    // The body key is `workingWeeksPerYear`; the option is `--working-weeks`.
    // Kebab-casing the key invented `--working-weeks-per-year`, which commander
    // rejects — so the caller edited the wrong thing and retried.
    expect(err).toContain("--working-weeks");
    expect(err).not.toContain("--working-weeks-per-year");
    expect(request).not.toHaveBeenCalled();
  });

  it("names all three short working-year flags exactly", async () => {
    const err = await captureError(["role", "set-working-year", ROLE_ID, "--calendar-weeks", "52"]);

    expect(err).toContain("--paid-leave");
    expect(err).toContain("--public-holidays");
    expect(err).toContain("--sickness");
    // The four spellings the old derivation produced. None is a real option.
    expect(err).not.toContain("--paid-leave-weeks");
    expect(err).not.toContain("--public-holiday-days");
    expect(err).not.toContain("--sickness-days");
    expect(request).not.toHaveBeenCalled();
  });

  it("names every missing system-policy flag in one message", async () => {
    const err = await captureError([
      "role",
      "set-system-policy",
      ROLE_ID,
      "--allow-proposals",
      "true"
    ]);

    for (const flag of ["--require-review", "--start-paused", "--auto-push", "--notify-takeover"]) {
      expect(err).toContain(flag);
    }
    expect(request).not.toHaveBeenCalled();
  });

  /**
   * The guard against the defect returning in a new place: every flag the
   * refusal can print must be a real declared option.
   *
   * Reads the source rather than the runtime, because the whole failure was a
   * name that existed in one and not the other.
   */
  it("references no flag that is not a declared option", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("./role.ts", import.meta.url), "utf-8");
    const declared = new Set([
      ...[...src.matchAll(/\.option\("--([a-z-]+)/g)].map((m) => m[1]),
      ...[...src.matchAll(/\.requiredOption\("--([a-z-]+)/g)].map((m) => m[1])
    ]);
    const referenced = [...src.matchAll(/\{ field: "\w+", flag: "([a-z-]+)" \}/g)].map((m) => m[1]);

    // Control: the scan must actually have found both sets.
    expect(declared.size).toBeGreaterThan(10);
    expect(referenced.length).toBeGreaterThan(10);
    expect(referenced.filter((f) => !declared.has(f))).toEqual([]);
  });
});

/**
 * `--help` IS THE CONTRACT, AND IT IS CODE (NEX-3626).
 *
 * The standard this namespace is measured against: paste a command's `--help`
 * into an agent prompt with no other source available, and the agent must use the
 * command correctly first time INCLUDING the cases where it would otherwise
 * silently do the wrong thing. Every sentence below is one of those cases, and
 * each was a defect before it was a sentence — so a deletion has to redden a test
 * rather than pass review as tidying.
 */
describe("the help text carries the trap, not a summary of it", () => {
  it("create names the field to branch on, and that the exit code is not it", () => {
    const help = renderHelp(["role", "create"]);

    expect(help).toContain('BRANCH ON "status"');
    expect(help).toContain('"status": "created"');
    expect(help).toContain('"status": "pending"');
    expect(help).toContain("requestId");
  });

  it("delete says pending means the Role is still there, in the machine's words too", () => {
    const help = renderHelp(["role", "delete"]);

    expect(help).toContain('BRANCH ON "status"');
    expect(help).toContain('"status": "deleted"');
    expect(help).toContain('"status": "pending"');
  });

  it("create says a complete --body is enough, and names the body's own keys", () => {
    const help = renderHelp(["role", "create"]);

    // `ownerUserId` is the body key and `--owner` is the flag. A caller told only
    // "name and owner may come from the body" sends `owner` and gets a 400.
    expect(help).toContain("A COMPLETE --body IS ENOUGH");
    expect(help).toContain("ownerUserId");
  });

  it("create-job-type enumerates both source kinds and denies the ones that read plausible", () => {
    const help = renderHelp(["role", "create-job-type"]);

    expect(help).toContain('"kind": "variable"');
    expect(help).toContain('"kind": "fixed"');
    // The three words a caller guesses. Naming them is what stops the guessing
    // loop the ticket describes.
    expect(help).toContain('no "constant"');
    expect(help).toContain("variableRef");
  });
});

describe("the READINESS column is never truncated", () => {
  it("renders the longest state pair in full", async () => {
    // `permissionSets=PENDING, owner=ABSENT` is 36 chars — longer than the 34
    // this column used to be pinned to, and PENDING/ABSENT is exactly the
    // combination readiness exists to distinguish.
    request.mockResolvedValue({
      roles: [
        {
          id: ROLE_ID,
          organizationId: "org_1",
          name: "Support",
          jobDescription: null,
          ownerUserId: null,
          createdAt: "2026-08-11T00:00:00.000Z",
          updatedAt: "2026-08-11T00:00:00.000Z"
        }
      ],
      readiness: [{ roleId: ROLE_ID, permissionSets: "PENDING", owner: "ABSENT" }]
    });

    const out = await runTable(["role", "list"]);

    expect(out).toContain("permissionSets=PENDING, owner=ABSENT");
    // The clipped forms the 34-wide column produced.
    expect(out).not.toContain("owner=ABSE\n");
    expect(out).not.toMatch(/owner=ABSEN(?!T)/);
  });

  it("renders READY in full too, not READ", async () => {
    request.mockResolvedValue({
      roles: [
        {
          id: ROLE_ID,
          organizationId: "org_1",
          name: "Support",
          jobDescription: null,
          ownerUserId: "user_a",
          createdAt: "2026-08-11T00:00:00.000Z",
          updatedAt: "2026-08-11T00:00:00.000Z"
        }
      ],
      readiness: [{ roleId: ROLE_ID, permissionSets: "PENDING", owner: "READY" }]
    });

    const out = await runTable(["role", "list"]);

    expect(out).toContain("permissionSets=PENDING, owner=READY");
    expect(out).not.toMatch(/owner=READ(?!Y)/);
  });
});

describe("an unset row is reported, never crashed on", () => {
  // These three GETs answer `null` when nothing has been authored — the state a
  // new organization and a new Role are IN. `printRecord` reads fields off its
  // argument, so `null` threw before this was handled, on the ordinary path.
  const NULLABLE_READS: ReadonlyArray<readonly [string, string[], string]> = [
    ["automation settings", ["role", "automation-settings"], "automation settings"],
    ["working year", ["role", "working-year", ROLE_ID], "working year"],
    ["system policy", ["role", "system-policy", ROLE_ID], "system policy"]
  ];

  for (const [name, argv, phrase] of NULLABLE_READS) {
    it(`reports ${name} as not configured, exiting 0`, async () => {
      request.mockReset();
      request.mockResolvedValue(null);

      const out = await runTable(argv);

      expect(out).toContain("not configured");
      expect(out.toLowerCase()).toContain(phrase);
      // Not an error: "nothing is stated" is the answer to the question.
      expect(process.exitCode).toBe(0);
    });
  }

  it("emits a literal null under --json so a script can branch on it", async () => {
    request.mockReset();
    request.mockResolvedValue(null);

    const chunks: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => {
      chunks.push(args.map(String).join(" "));
    };
    try {
      await run(["role", "system-policy", ROLE_ID]);
    } finally {
      console.log = log;
    }

    expect(chunks.join("\n").trim()).toBe("null");
    expect(process.exitCode).toBe(0);
  });

  it("still renders the row when one IS stated", async () => {
    request.mockReset();
    request.mockResolvedValue({
      id: "p1",
      roleId: ROLE_ID,
      allowProposals: true,
      requireReview: false,
      startPaused: true,
      autoPush: false,
      notifyTakeover: true,
      updatedAt: "2026-08-11T00:00:00.000Z"
    });

    const out = await runTable(["role", "system-policy", ROLE_ID]);

    expect(out).not.toContain("not configured");
    expect(out).toContain("Allow proposals");
  });
});
