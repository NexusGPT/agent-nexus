import { PermissionsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

// Real SDK resource over a fake HTTP client: the point of these tests is which
// METHOD, PATH and BODY the CLI ends up requesting, so the resource must not be
// mocked.
const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    permissions: new PermissionsResource({ request } as never)
  })
}));

import { registerPermissionsCommands } from "./permissions";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerPermissionsCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

/**
 * Same, in the default table mode, capturing stdout.
 *
 * Every JSON-mode test above is its own output path — a value dropped only from
 * the human-readable rendering is invisible to all of them.
 */
async function runTable(argv: string[]): Promise<string> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerPermissionsCommands(program);
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

const RESOURCE_ID = "11111111-1111-1111-1111-111111111111";
const GROUP_ID = "22222222-2222-2222-2222-222222222222";

describe("permissions access", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ permissions: [] });
  });

  it("reads the access list off the resource-scoped path", async () => {
    await run(["permissions", "access", "agent", RESOURCE_ID]);

    expect(request).toHaveBeenCalledWith("GET", `/permissions/agent/${RESOURCE_ID}/access`);
  });

  it("refuses a resource type the API does not serve, without calling it", async () => {
    // A `string` from commander has to be narrowed before it reaches the SDK.
    // Sending it anyway would 400 on a path segment, which reads as a bad id.
    await run(["permissions", "access", "spaceship", RESOURCE_ID]);

    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("renders the grant rows in table mode, not only in JSON", async () => {
    request.mockResolvedValue({
      permissions: [
        {
          id: "p1",
          resourceType: "agent",
          resourceId: RESOURCE_ID,
          subjectType: "group",
          subjectId: GROUP_ID,
          relation: "viewer",
          grantedByUserId: "user_abc",
          createdAt: "2026-08-06T00:00:00.000Z",
          user: null,
          group: { id: GROUP_ID, name: "Support", memberCount: 3 }
        }
      ]
    });

    const out = await runTable(["permissions", "access", "agent", RESOURCE_ID]);

    // subjectType + subjectId are how a caller identifies a row; the grantee
    // profile is null for three of the five subject types.
    expect(out).toContain("group");
    expect(out).toContain(GROUP_ID);
    expect(out).toContain("viewer");
  });
});

describe("permissions grant and revoke", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ id: "p1", createdAt: "2026-08-06T00:00:00.000Z" });
  });

  it("posts the whole tuple to the grant endpoint", async () => {
    await run([
      "permissions",
      "grant",
      "--resource-type",
      "agent",
      "--resource-id",
      RESOURCE_ID,
      "--subject-type",
      "group",
      "--subject-id",
      GROUP_ID,
      "--relation",
      "viewer"
    ]);

    expect(request).toHaveBeenCalledWith("POST", "/permissions/grant", {
      body: {
        resourceType: "agent",
        resourceId: RESOURCE_ID,
        subjectType: "group",
        subjectId: GROUP_ID,
        relation: "viewer"
      }
    });
  });

  it("omits cascadeSubjectIds entirely when the flag is not given", async () => {
    request.mockResolvedValue({ revokedCount: 1 });

    await run([
      "permissions",
      "revoke",
      "--resource-type",
      "agent",
      "--resource-id",
      RESOURCE_ID,
      "--subject-type",
      "user",
      "--subject-id",
      "user_abc"
    ]);

    // Sending `cascadeSubjectIds: []` is a DIFFERENT request from sending none —
    // it asserts an empty downstream set rather than declining to name one. The
    // body is written out in full rather than read back off the call, which
    // would compare the value against itself and pass whatever it found.
    expect(request).toHaveBeenCalledWith("POST", "/permissions/revoke", {
      body: {
        resourceType: "agent",
        resourceId: RESOURCE_ID,
        subjectType: "user",
        subjectId: "user_abc"
      }
    });

    const [, , options] = request.mock.calls[0] ?? [];
    expect((options as { body: Record<string, unknown> }).body).not.toHaveProperty(
      "cascadeSubjectIds"
    );
  });

  it("splits and trims a comma-separated cascade list", async () => {
    request.mockResolvedValue({ revokedCount: 3 });

    await run([
      "permissions",
      "revoke",
      "--resource-type",
      "agent",
      "--resource-id",
      RESOURCE_ID,
      "--subject-type",
      "user",
      "--subject-id",
      "user_abc",
      "--cascade-subject-ids",
      " user_d , user_e ,"
    ]);

    expect(request).toHaveBeenCalledWith("POST", "/permissions/revoke", {
      body: {
        resourceType: "agent",
        resourceId: RESOURCE_ID,
        subjectType: "user",
        subjectId: "user_abc",
        cascadeSubjectIds: ["user_d", "user_e"]
      }
    });
  });

  it("keeps the wildcard sentinel on a revoke rather than treating it as an id", async () => {
    request.mockResolvedValue({ revokedCount: 7 });

    await run([
      "permissions",
      "revoke",
      "--resource-type",
      "agent",
      "--resource-id",
      "*",
      "--subject-type",
      "group",
      "--subject-id",
      GROUP_ID
    ]);

    const [, , options] = request.mock.calls[0] ?? [];
    expect((options as { body: { resourceId: string } }).body.resourceId).toBe("*");
  });
});

describe("permissions org settings", () => {
  const SETTINGS = {
    defaultResourceVisibility: "open",
    resourceVisibilityByType: { agent: "closed" },
    effectiveVisibilityByType: {
      agent: "closed",
      workflow: "open",
      vibe_app: "closed",
      access_card: "closed"
    }
  };

  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(SETTINGS);
  });

  it("reads the org settings off the singular path", async () => {
    await run(["permissions", "org-settings"]);

    expect(request).toHaveBeenCalledWith("GET", "/permissions/org-settings");
  });

  it("shows the EFFECTIVE map in table mode, not only the stored overrides", async () => {
    const out = await runTable(["permissions", "org-settings"]);

    // vibe_app carries a system pin and appears in the effective map only. A
    // rendering that showed the stored overrides alone would report it as unset
    // while it is pinned CLOSED — the exact defect the endpoint was repaired for.
    expect(out).toContain("vibe_app=closed");
    expect(out).toContain("agent=closed");
  });

  it("patches one resource type's visibility", async () => {
    await run([
      "permissions",
      "set-visibility",
      "--resource-type",
      "agent",
      "--visibility",
      "closed"
    ]);

    expect(request).toHaveBeenCalledWith("PATCH", "/permissions/org-settings/resource-type", {
      body: { resourceType: "agent", visibility: "closed" }
    });
  });

  it("turns --visibility none into a literal null, which CLEARS the override", async () => {
    await run([
      "permissions",
      "set-visibility",
      "--resource-type",
      "agent",
      "--visibility",
      "none"
    ]);

    // Omitting the field is refused by the server, so "clear it" cannot be said
    // by leaving the flag off — null has to reach the wire.
    expect(request).toHaveBeenCalledWith("PATCH", "/permissions/org-settings/resource-type", {
      body: { resourceType: "agent", visibility: null }
    });
  });

  it("refuses an unknown --visibility token without calling the API", async () => {
    await run(["permissions", "set-visibility", "--resource-type", "agent", "--visibility", "non"]);

    // "none" is a token this CLI invents. Forwarded verbatim it would 400 with a
    // message listing enum values that do not include it.
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
