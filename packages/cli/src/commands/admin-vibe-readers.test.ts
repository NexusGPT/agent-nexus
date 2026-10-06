/**
 * `nexus admin vibe-build-job` / `vibe-deployment` against a backend NEWER than
 * this binary.
 *
 * A published CLI keeps its version for weeks while the backend learns new
 * build-job statuses, builders and deployment slots. These commands only PRINT
 * the row the transition returned, so the honest output for a value this binary
 * does not know is the server's own word — never `undefined`, never a blank, and
 * never a failed command over a row the backend already wrote.
 *
 * The unlisted values are spelled as listed names joined with `_UNLISTED`, so no
 * value the contract plausibly lists later collides with one and quietly turns
 * an arm into a test of a KNOWN value.
 */

import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminVibeBuildJobResponse, AdminVibeDeploymentResponse } from "../admin-wire-types";
import { registerAdminCommands } from "./admin";

const BASE_URL = "https://api.test.invalid";
const TOKEN = "test-jwt";

const UNLISTED_BUILD_STATUS = "PENDING_QUEUED_ADMITTED_STARTING_RUNNING_UNLISTED";
const UNLISTED_BUILDER = "NIXPACKS_DOCKERFILE_GENERATED_UNLISTED";
const UNLISTED_DEPLOYMENT_STATUS = "BUILDING_DEPLOYING_HEALTHY_UNLISTED";
const UNLISTED_COLOR = "BLUE_GREEN_UNLISTED";

const BUILD_JOB: AdminVibeBuildJobResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  vibeDeploymentId: "33333333-3333-4333-8333-333333333333",
  organizationId: "org_newer_backend",
  status: UNLISTED_BUILD_STATUS,
  builder: UNLISTED_BUILDER,
  logsRef: "s3://vibe-logs/build.log",
  durationMs: null,
  errorReason: null,
  createdAt: "2026-10-03T10:00:00.000Z",
  updatedAt: "2026-10-03T10:00:00.000Z"
};

const DEPLOYMENT: AdminVibeDeploymentResponse = {
  id: "33333333-3333-4333-8333-333333333333",
  vibeAppId: "44444444-4444-4444-8444-444444444444",
  organizationId: "org_newer_backend",
  color: UNLISTED_COLOR,
  versionNumber: 7,
  status: UNLISTED_DEPLOYMENT_STATUS,
  triggerSha: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
  imageRef: "registry/app:1a2b3c4",
  errorReason: null,
  createdByUserId: null,
  createdAt: "2026-10-03T10:00:00.000Z",
  updatedAt: "2026-10-03T10:00:00.000Z"
};

function stubFetch(data: AdminVibeBuildJobResponse | AdminVibeDeploymentResponse): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ success: true, data }))
    })
  );
}

// eslint-disable-next-line no-control-regex
const plain = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

/** Run one admin command against the stubbed endpoint; the printed record, one line per entry. */
async function run(
  args: string[]
): Promise<{ lines: string[]; exitCode: typeof process.exitCode }> {
  const program = new Command();
  program
    .name("nexus")
    .option("--json", "Output as JSON")
    .option("--base-url <url>", "API base URL")
    .option("--profile <name>", "Profile")
    .exitOverride();
  registerAdminCommands(program);

  const chunks: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    chunks.push(parts.map((part) => String(part)).join(" "));
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const prevExit = process.exitCode;
  process.exitCode = undefined;
  try {
    await program.parseAsync([
      "node",
      "nexus",
      "--base-url",
      BASE_URL,
      "admin",
      "--admin-token",
      TOKEN,
      ...args
    ]);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
  const exitCode = process.exitCode;
  process.exitCode = prevExit;
  return { lines: plain(chunks.join("\n")).split("\n"), exitCode };
}

/** The value printed on the record line labelled `label`, or a marker that there is none. */
function valueOf(lines: string[], label: string): string {
  const line = lines.find((l) => l.trimStart().startsWith(label));
  return line === undefined ? `<no "${label}" line>` : line.trimStart().slice(label.length).trim();
}

const claim = () =>
  run([
    "vibe-build-job",
    "claim",
    BUILD_JOB.id,
    "--org",
    BUILD_JOB.organizationId,
    "--logs-ref",
    BUILD_JOB.logsRef
  ]);

const markHealthy = () =>
  run(["vibe-deployment", "mark-healthy", DEPLOYMENT.id, "--org", DEPLOYMENT.organizationId]);

describe("nexus admin vibe-build-job — a row carrying values this binary does not list", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prints an unlisted status as the server's own word", async () => {
    stubFetch(BUILD_JOB);

    expect(valueOf((await claim()).lines, "Status")).toBe(UNLISTED_BUILD_STATUS);
  });

  it("prints an unlisted builder as the server's own word", async () => {
    stubFetch(BUILD_JOB);

    expect(valueOf((await claim()).lines, "Builder")).toBe(UNLISTED_BUILDER);
  });

  it("does not fail the command over a row the backend already wrote", async () => {
    stubFetch(BUILD_JOB);

    expect((await claim()).exitCode).toBeUndefined();
  });
});

describe("nexus admin vibe-deployment — a row carrying values this binary does not list", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prints an unlisted status as the server's own word", async () => {
    stubFetch(DEPLOYMENT);

    expect(valueOf((await markHealthy()).lines, "Status")).toBe(UNLISTED_DEPLOYMENT_STATUS);
  });

  it("prints an unlisted colour as the server's own word", async () => {
    stubFetch(DEPLOYMENT);

    expect(valueOf((await markHealthy()).lines, "Color")).toBe(UNLISTED_COLOR);
  });

  it("does not fail the command over a row the backend already wrote", async () => {
    stubFetch(DEPLOYMENT);

    expect((await markHealthy()).exitCode).toBeUndefined();
  });
});
