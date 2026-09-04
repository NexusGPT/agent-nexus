import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import { installArgumentRefusalReporting } from "../errors";
import { installJsonTerminalContract } from "../json-terminal-contract";
import { setJsonMode } from "../output";
import type { VibeDeploymentDto } from "../vibe-wire-types";

/**
 * WHAT `apps rollback` PUTS ON THE WIRE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE RESOLVER'S OWN UNIT TESTS CANNOT COVER THIS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `apps-rollback-target.test.ts` proves the resolver picks the right ROW. It
 * says nothing about whether that row's id ever reaches the server, because it
 * never makes a request — and the request body is not a type anyone checks:
 * `tenantRequest`'s `body` is structurally typed, so a command that resolved
 * perfectly and then sent no body at all would typecheck, lint clean, and pass
 * every resolver test.
 *
 * That is not hypothetical in this package. `tenant-http.organization-header.test.ts`
 * records the same shape one layer down: 500+ green specs covered that
 * transport while its stubbed `fetch` discarded the REQUEST and every assertion
 * read the RESPONSE, so a missing header shipped. This file reads the request.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE ASSERTION THAT MATTERS MOST IS AN ABSENCE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Omitting `targetDeploymentId` is not a no-op — it is what SELECTS the
 * server's auto-pick of the most recent superseded version. So a `--to-version 9`
 * that fails to resolve and then POSTs anyway does not fail safe: it rolls the
 * app onto a DIFFERENT version from the one the operator named, silently, and
 * reports success. The case below that asserts NO POST was made is guarding
 * against a production rollback nobody asked for, and it is the one whose
 * failure would be invisible in every other instrument.
 */

const APP_ID = "11111111-2222-4333-8444-555555555555";
const ROLLBACK_PATH = `/api/vibe/apps/${APP_ID}/rollback`;
const LIST_PATH = `/api/vibe/apps/${APP_ID}/deployments`;

function deployment(
  over: Partial<VibeDeploymentDto> & { versionNumber: number }
): VibeDeploymentDto {
  return {
    id: `dep-${String(over.versionNumber)}`,
    vibeAppId: APP_ID,
    color: "blue",
    status: "SUPERSEDED",
    imageRef: "ecr.example/app:abc1234",
    triggerSha: `${String(over.versionNumber)}aaaaaa`,
    detectedPort: 8080,
    forceRebuild: false,
    errorReason: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    ...over
  };
}

const DEPLOYMENTS: VibeDeploymentDto[] = [
  deployment({ versionNumber: 3, status: "HEALTHY" }),
  deployment({ versionNumber: 2 }),
  deployment({ versionNumber: 1 })
];

const ROLLBACK_RESULT = {
  restoredDeployment: deployment({ versionNumber: 2, status: "DEPLOYING" }),
  supersededDeployment: deployment({ versionNumber: 3, status: "SUPERSEDED" })
};

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

/** Every request the command made, in call order. */
function requests(): SentRequest[] {
  return tenantRequest.mock.calls.map((call) => call[1] as SentRequest);
}

function posts(): SentRequest[] {
  return requests().filter((req) => req.path === ROLLBACK_PATH);
}

/** Answer the list read and the rollback POST, and nothing else. */
function serveHappyPath(): void {
  tenantRequest.mockReset();
  tenantRequest.mockImplementation((_opts: unknown, req: SentRequest) => {
    if (req.path === LIST_PATH) return Promise.resolve({ deployments: DEPLOYMENTS });
    if (req.path === ROLLBACK_PATH) return Promise.resolve(ROLLBACK_RESULT);
    throw new Error(`unexpected request: ${String(req.method)} ${String(req.path)}`);
  });
}

async function drive(argv: readonly string[]): Promise<number | undefined> {
  const realLog = console.log;
  const realError = console.error;
  console.log = (): void => {};
  console.error = (): void => {};

  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    const program = new Command();
    program.name("nexus").option("--json", "Output as JSON").option("--api-key <key>", "key");
    registerAppsCommands(program);
    installArgumentRefusalReporting(program, { onSuccessfulExit: "throw" });
    installJsonTerminalContract(program);
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    console.log = realLog;
    console.error = realError;
    setJsonMode(false);
  }
  const exitCode = process.exitCode;
  process.exitCode = previous;
  return exitCode;
}

const KEY = ["--api-key", "nxs_stub"] as const;

describe("apps rollback --to-version puts the resolved deployment id on the wire", () => {
  it("sends targetDeploymentId for the version it resolved", async () => {
    serveHappyPath();

    const exitCode = await drive(["apps", "rollback", APP_ID, "--to-version", "2", ...KEY]);

    // CONTROL: two requests, in order. Without this the assertions below could
    // all be describing a command that never ran.
    expect(requests().map((req) => req.path)).toEqual([LIST_PATH, ROLLBACK_PATH]);
    expect(posts()).toHaveLength(1);
    // The whole feature, in one assertion: the id of the row carrying v2.
    expect(posts()[0]?.body).toEqual({ targetDeploymentId: "dep-2" });
    expect(exitCode).toBeUndefined();
  });

  it("accepts the `v2` spelling the listing prints", async () => {
    serveHappyPath();

    await drive(["apps", "rollback", APP_ID, "--to-version", "v2", ...KEY]);

    expect(posts()[0]?.body).toEqual({ targetDeploymentId: "dep-2" });
  });

  it("sends NO body for a bare rollback, which is what selects the server's auto-pick", async () => {
    serveHappyPath();

    await drive(["apps", "rollback", APP_ID, ...KEY]);

    // No list read either: a bare rollback needs no resolution.
    expect(requests().map((req) => req.path)).toEqual([ROLLBACK_PATH]);
    expect(posts()[0]?.body).toBeUndefined();
  });

  it("makes NO rollback request when the named version cannot be resolved", async () => {
    // 🚨 THE ONE THAT GUARDS A PRODUCTION ACTION. Falling through to the POST
    // here would omit `targetDeploymentId`, which does not mean "no target" —
    // it means "pick the most recent superseded version". The operator asked
    // for v9 and would silently get v2.
    serveHappyPath();

    const exitCode = await drive(["apps", "rollback", APP_ID, "--to-version", "9", ...KEY]);

    expect(requests().map((req) => req.path)).toEqual([LIST_PATH]);
    expect(posts()).toHaveLength(0);
    expect(exitCode).not.toBe(0);
    expect(exitCode).toBeDefined();
  });

  it("makes NO request at all when the version is not a number", async () => {
    // Refused before any network: a malformed flag needs no list read.
    serveHappyPath();

    const exitCode = await drive(["apps", "rollback", APP_ID, "--to-version", "latest", ...KEY]);

    expect(requests()).toHaveLength(0);
    expect(exitCode).not.toBe(0);
    expect(exitCode).toBeDefined();
  });

  it("refuses --to together with --to-version, and sends nothing", async () => {
    // They are different operations — one restores without building, the other
    // builds and spends a new version number. Any precedence would perform an
    // operation that was not asked for.
    serveHappyPath();

    const exitCode = await drive([
      "apps",
      "rollback",
      APP_ID,
      "--to-version",
      "2",
      "--to",
      "1a2b3c4",
      ...KEY
    ]);

    expect(requests()).toHaveLength(0);
    expect(exitCode).not.toBe(0);
    expect(exitCode).toBeDefined();
  });

  it("does not send a target when the version names the version already serving", async () => {
    serveHappyPath();

    const exitCode = await drive(["apps", "rollback", APP_ID, "--to-version", "3", ...KEY]);

    expect(posts()).toHaveLength(0);
    expect(exitCode).toBeDefined();
  });
});
