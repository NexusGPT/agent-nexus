import { NexusApiError } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { installArgumentRefusalReporting } from "../errors";
import { installJsonTerminalContract } from "../json-terminal-contract";
import { setJsonMode } from "../output";
import type { VibeAppDomainDnsInstructionsDto, VibeAppDomainDto } from "../vibe-domain-wire-types";

/**
 * WHAT `apps domains` PUTS ON THE WIRE, AND WHAT IT TELLS A PERSON TO TYPE INTO
 * THEIR DNS PROVIDER.
 *
 * The second half is the one with a cost outside this repository: `add` prints
 * records a customer copies by hand. A value the CLI got wrong — or, worse, made
 * up — points a real domain somewhere, and nothing here would ever see it. So
 * every arm reads the PRINTED text or the REQUEST, never a mock's return value.
 *
 * One property per `it`: a failing assertion aborts the rest of its block, so a
 * block holding two claims scores only whichever fails first.
 */

const APP_ID = "11111111-2222-4333-8444-555555555555";
const DOMAINS_PATH = `/api/vibe/apps/${APP_ID}/domains`;
const PRIMARY_PATH = `/api/vibe/apps/${APP_ID}/primary-domain`;

const EDGE = "domains.apps.example.test";

function domain(over: Partial<VibeAppDomainDto> & { host: string }): VibeAppDomainDto {
  return {
    id: "66666666-7777-4888-8999-aaaaaaaaaaaa",
    appId: APP_ID,
    kind: "SUBDOMAIN",
    status: "PENDING_DNS",
    statusReason: null,
    verifiedAt: null,
    activatedAt: null,
    lastCheckedAt: null,
    createdAt: "2026-09-21T10:00:00.000Z",
    isPrimary: false,
    dns: { status: "ready", records: [{ type: "CNAME", name: over.host, value: EDGE }] },
    ...over
  };
}

const SUB = domain({ host: "shop.acme.test" });

const APEX_READY = domain({
  host: "acme.test",
  kind: "APEX",
  dns: {
    status: "ready",
    records: [
      { type: "A", name: "acme.test", value: "203.0.113.10" },
      { type: "A", name: "acme.test", value: "203.0.113.11" }
    ]
  }
});

const UNAVAILABLE_REASON = "The edge's static addresses are not configured yet";
const UNAVAILABLE: VibeAppDomainDnsInstructionsDto = {
  status: "unavailable",
  reason: UNAVAILABLE_REASON
};
const APEX_UNAVAILABLE = domain({ host: "acme.test", kind: "APEX", dns: UNAVAILABLE });

const ACTIVE = domain({
  id: "77777777-8888-4999-8aaa-bbbbbbbbbbbb",
  host: "www.acme.test",
  status: "ACTIVE"
});

const tenantRequest = vi.hoisted(() => vi.fn());

vi.mock("../util/tenant-http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/tenant-http")>();
  return { ...actual, tenantRequest };
});

const { registerAppsCommands } = await import("./apps");

interface SentRequest {
  method?: string;
  path?: string;
  body?: unknown;
}

function requests(): SentRequest[] {
  return tenantRequest.mock.calls.map((call) => call[1] as SentRequest);
}

/** Answer each path with the given value; any other request is a test failure. */
function serve(routes: Record<string, unknown>): void {
  tenantRequest.mockReset();
  tenantRequest.mockImplementation((_opts: unknown, req: SentRequest) => {
    const key = `${String(req.method)} ${String(req.path)}`;
    if (!(key in routes)) throw new Error(`unexpected request: ${key}`);
    const answer = routes[key];
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });
}

interface Run {
  exitCode: number | undefined;
  stdout: string;
  stderr: string;
}

// eslint-disable-next-line no-control-regex -- stripping the ANSI colour escapes is the point
const ANSI = /\x1b\[[0-9;]*m/g;

async function drive(argv: readonly string[]): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const realLog = console.log;
  const realError = console.error;
  console.log = (...parts: unknown[]): void => void out.push(parts.map(String).join(" "));
  console.error = (...parts: unknown[]): void => void err.push(parts.map(String).join(" "));

  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    const program = new Command();
    program.name("nexus").option("--json", "Output as JSON").option("--api-key <key>", "key");
    registerAppsCommands(program);
    installArgumentRefusalReporting(program, { onSuccessfulExit: "throw" });
    installJsonTerminalContract(program);
    if (argv.includes("--json")) setJsonMode(true);
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    console.log = realLog;
    console.error = realError;
    setJsonMode(false);
  }
  const exitCode = process.exitCode;
  process.exitCode = previous;
  return {
    exitCode,
    stdout: out.join("\n").replace(ANSI, ""),
    stderr: err.join("\n").replace(ANSI, "")
  };
}

/** The printed table row for one record: type, name and value on one line, in that order. */
function recordRow(type: string, name: string, value: string): RegExp {
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${esc(type)}\\s+${esc(name)}\\s+${esc(value)}\\s*$`, "m");
}

const KEY = ["--api-key", "nxs_stub"] as const;

beforeEach(() => {
  tenantRequest.mockReset();
});

describe("apps domains add", () => {
  it("POSTs the host exactly as typed to the app's domains route", async () => {
    serve({ [`POST ${DOMAINS_PATH}`]: { domain: SUB } });

    await drive(["apps", "domains", "add", APP_ID, "shop.acme.test", ...KEY]);

    expect(requests()).toEqual([
      { method: "POST", path: DOMAINS_PATH, body: { host: "shop.acme.test" } }
    ]);
  });

  it("prints the subdomain's CNAME as a type / name / value row", async () => {
    serve({ [`POST ${DOMAINS_PATH}`]: { domain: SUB } });

    const run = await drive(["apps", "domains", "add", APP_ID, "shop.acme.test", ...KEY]);

    expect(run.stdout).toMatch(recordRow("CNAME", "shop.acme.test", EDGE));
  });

  it("prints every A record an apex is given, each on its own row", async () => {
    serve({ [`POST ${DOMAINS_PATH}`]: { domain: APEX_READY } });

    const run = await drive(["apps", "domains", "add", APP_ID, "acme.test", ...KEY]);

    const rows = ["203.0.113.10", "203.0.113.11"].filter((ip) =>
      recordRow("A", "acme.test", ip).test(run.stdout)
    );
    expect(rows).toEqual(["203.0.113.10", "203.0.113.11"]);
  });

  it("names the verify command as the next step when records were given", async () => {
    serve({ [`POST ${DOMAINS_PATH}`]: { domain: SUB } });

    const run = await drive(["apps", "domains", "add", APP_ID, "shop.acme.test", ...KEY]);

    expect(run.stdout).toContain(`nexus apps domains verify ${APP_ID} shop.acme.test`);
  });

  it("prints the server's reason when an apex has no records yet", async () => {
    serve({ [`POST ${DOMAINS_PATH}`]: { domain: APEX_UNAVAILABLE } });

    const run = await drive(["apps", "domains", "add", APP_ID, "acme.test", ...KEY]);

    expect(run.stdout).toContain(UNAVAILABLE_REASON);
  });

  it("prints NO address and NO record row when an apex has no records yet", async () => {
    // 🚨 The one that guards a customer's apex. Anything address-shaped here was
    // invented by the CLI and would be copied into a real DNS zone.
    serve({ [`POST ${DOMAINS_PATH}`]: { domain: APEX_UNAVAILABLE } });

    const run = await drive(["apps", "domains", "add", APP_ID, "acme.test", ...KEY]);

    const leaks = {
      ipv4: /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(run.stdout),
      recordRow: /^\s*(?:A|AAAA|CNAME)\s+\S+\s+\S+\s*$/m.test(run.stdout),
      tableHeader: /^\s*Type\s+Name\s+Value\s*$/m.test(run.stdout)
    };
    expect(leaks).toEqual({ ipv4: false, recordRow: false, tableHeader: false });
  });

  it("--json prints the response envelope unchanged, as ONE document", async () => {
    serve({ [`POST ${DOMAINS_PATH}`]: { domain: SUB } });

    const run = await drive(["apps", "domains", "add", APP_ID, "shop.acme.test", "--json", ...KEY]);

    expect(JSON.parse(run.stdout)).toEqual({ domain: SUB });
  });

  it("--json keeps the unavailable arm's shape, reason and no records", async () => {
    serve({ [`POST ${DOMAINS_PATH}`]: { domain: APEX_UNAVAILABLE } });

    const run = await drive(["apps", "domains", "add", APP_ID, "acme.test", "--json", ...KEY]);

    expect((JSON.parse(run.stdout) as { domain: VibeAppDomainDto }).domain.dns).toEqual(
      UNAVAILABLE
    );
  });
});

describe("apps domains add — a host held elsewhere (409)", () => {
  const conflict = (): NexusApiError =>
    new NexusApiError(
      "VIBE_APP_DOMAIN_ALREADY_ATTACHED",
      "shop.acme.test is already attached to an app",
      409,
      // A holder the server must never send. If it ever does, the CLI still must
      // not print it: this code's hint REPLACES the details dump.
      { holderOrganizationId: "org_SOMEONE_ELSE", holderAppId: "app_SOMEONE_ELSE" }
    );

  it("exits non-zero", async () => {
    serve({ [`POST ${DOMAINS_PATH}`]: conflict() });

    const run = await drive(["apps", "domains", "add", APP_ID, "shop.acme.test", ...KEY]);

    expect(run.exitCode ?? 0).not.toBe(0);
  });

  it("says the host is already attached, naming the host", async () => {
    serve({ [`POST ${DOMAINS_PATH}`]: conflict() });

    const run = await drive(["apps", "domains", "add", APP_ID, "shop.acme.test", ...KEY]);

    expect(run.stderr).toContain("Conflict: shop.acme.test is already attached to an app");
  });

  it("points at detaching it from one of your own apps", async () => {
    serve({ [`POST ${DOMAINS_PATH}`]: conflict() });

    const run = await drive(["apps", "domains", "add", APP_ID, "shop.acme.test", ...KEY]);

    expect(run.stderr).toContain("nexus apps domains remove");
  });

  it("never prints who holds it, even when the error carries it", async () => {
    serve({ [`POST ${DOMAINS_PATH}`]: conflict() });

    const run = await drive(["apps", "domains", "add", APP_ID, "shop.acme.test", ...KEY]);

    // CONTROL: the command ran and failed, so an empty stderr cannot pass this.
    expect(run.stderr).toContain("already attached");
    expect(`${run.stdout}\n${run.stderr}`).not.toMatch(/SOMEONE_ELSE/);
  });
});

describe("apps domains list", () => {
  it("prints host, status, primary and reason on one row", async () => {
    const failed = domain({
      host: "old.acme.test",
      status: "FAILED",
      statusReason: "CNAME points at elsewhere.test"
    });
    serve({ [`GET ${DOMAINS_PATH}`]: { domains: [{ ...ACTIVE, isPrimary: true }, failed] } });

    const run = await drive(["apps", "domains", "list", APP_ID, ...KEY]);

    const rows = run.stdout.split("\n").filter((l) => /acme\.test/.test(l));
    expect(rows.map((l) => l.trim().split(/\s{2,}/))).toEqual([
      ["www.acme.test", "SUBDOMAIN", "ACTIVE", "yes", "—"],
      ["old.acme.test", "SUBDOMAIN", "FAILED", "—", "CNAME points at elsewhere.test"]
    ]);
  });

  it("--json prints the response envelope unchanged", async () => {
    const body = { domains: [ACTIVE, SUB] };
    serve({ [`GET ${DOMAINS_PATH}`]: body });

    const run = await drive(["apps", "domains", "list", APP_ID, "--json", ...KEY]);

    expect(JSON.parse(run.stdout)).toEqual(body);
  });
});

describe("apps domains verify", () => {
  it("POSTs to the host's verify route, the host path-encoded", async () => {
    serve({ [`POST ${DOMAINS_PATH}/shop.acme.test/verify`]: { domain: SUB } });

    await drive(["apps", "domains", "verify", APP_ID, "shop.acme.test", ...KEY]);

    expect(requests().map((r) => `${String(r.method)} ${String(r.path)}`)).toEqual([
      `POST ${DOMAINS_PATH}/shop.acme.test/verify`
    ]);
  });

  it("repeats the records while DNS still does not point at the edge", async () => {
    serve({ [`POST ${DOMAINS_PATH}/shop.acme.test/verify`]: { domain: SUB } });

    const run = await drive(["apps", "domains", "verify", APP_ID, "shop.acme.test", ...KEY]);

    expect(run.stdout).toMatch(recordRow("CNAME", "shop.acme.test", EDGE));
  });
});

describe("apps domains remove", () => {
  it("--yes DELETEs the host on the app's domains route", async () => {
    serve({ [`DELETE ${DOMAINS_PATH}/shop.acme.test`]: { deletedHost: "shop.acme.test" } });

    await drive(["apps", "domains", "remove", APP_ID, "shop.acme.test", "--yes", ...KEY]);

    expect(requests().map((r) => `${String(r.method)} ${String(r.path)}`)).toEqual([
      `DELETE ${DOMAINS_PATH}/shop.acme.test`
    ]);
  });

  it("is also reachable as `rm`", async () => {
    serve({ [`DELETE ${DOMAINS_PATH}/shop.acme.test`]: { deletedHost: "shop.acme.test" } });

    await drive(["apps", "domains", "rm", APP_ID, "shop.acme.test", "--yes", ...KEY]);

    expect(requests()).toHaveLength(1);
  });
});

describe("apps domains primary", () => {
  it("sends the host exactly as typed, for the server to resolve", async () => {
    // One request, and no list read before it: which domain a spelling names is
    // the server's decision, made with the schema that stored the hosts. A
    // client-side normaliser would turn `user@www.acme.test` into a real host.
    serve({ [`PUT ${PRIMARY_PATH}`]: { primaryDomainId: ACTIVE.id } });

    await drive(["apps", "domains", "primary", APP_ID, "User@WWW.Acme.Test.", ...KEY]);

    expect(requests()).toEqual([
      { method: "PUT", path: PRIMARY_PATH, body: { host: "User@WWW.Acme.Test." } }
    ]);
  });

  it("trims only the whitespace around the host", async () => {
    serve({ [`PUT ${PRIMARY_PATH}`]: { primaryDomainId: ACTIVE.id } });

    await drive(["apps", "domains", "primary", APP_ID, "  Café.Example.  ", ...KEY]);

    expect(requests()[0]?.body).toEqual({ host: "Café.Example." });
  });

  it("surfaces the server's 404 for a host that is not this app's", async () => {
    serve({
      [`PUT ${PRIMARY_PATH}`]: new NexusApiError(
        "VIBE_APP_DOMAIN_NOT_FOUND",
        "No custom domain nope.acme.test on this app",
        404
      )
    });

    const run = await drive(["apps", "domains", "primary", APP_ID, "nope.acme.test", ...KEY]);

    expect(run.exitCode).toBe(4);
  });

  it("--clear sends a null domain id and nothing else", async () => {
    serve({ [`PUT ${PRIMARY_PATH}`]: { primaryDomainId: null } });

    await drive(["apps", "domains", "primary", APP_ID, "--clear", ...KEY]);

    expect(requests()).toEqual([{ method: "PUT", path: PRIMARY_PATH, body: { domainId: null } }]);
  });

  it("refuses a host together with --clear, and sends nothing", async () => {
    serve({});

    const run = await drive([
      "apps",
      "domains",
      "primary",
      APP_ID,
      "www.acme.test",
      "--clear",
      ...KEY
    ]);

    expect({ sent: requests().length, exit: run.exitCode }).toEqual({ sent: 0, exit: 5 });
  });
});
