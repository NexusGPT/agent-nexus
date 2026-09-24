import { afterEach, describe, expect, it, vi } from "vitest";

import type { VibeBuildJobDto, VibeDeploymentDto } from "../../../vibe-deployment-wire-types";
import type { GetDeploymentResponse, GetDeployStateResponse } from "../../../vibe-wire-types";
import { renderDeployState } from "../deploy-state/render-deploy-state";
import { printDisplaced } from "../watch/print-displaced";
import { printDeploymentDetail } from "./print-deployment-detail";
import { printDeploymentList } from "./print-deployment-list";

/**
 * How a superseded/displaced deployment reads in the CLI: which colour its
 * status takes, and whether the output names the deployment that replaced it.
 *
 * Every assertion reads PRINTED TEXT, anchored to the line it is about. The
 * `errorReason` fixture deliberately names a different version (v99) than
 * `displacedBy` (v8). A renderer that pulls the reason out of the prose
 * instead of the structured field prints v99 on the anchored line and fails.
 * An unanchored `toContain("v8")` over the whole output could not tell the
 * two apart, because the Error row prints the prose anyway.
 */

const NEWER = {
  id: "00000000-0000-4000-8000-000000000008",
  versionNumber: 8,
  triggerSha: "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d"
};

function deployment(over: Partial<VibeDeploymentDto> = {}): VibeDeploymentDto {
  return {
    id: "00000000-0000-4000-8000-000000000007",
    vibeAppId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    color: "BLUE",
    versionNumber: 7,
    status: "DISPLACED",
    triggerSha: "25ba588eb586a4f0fe4cceaa3a48f0129b0de2e8",
    imageRef: "",
    detectedPort: null,
    forceRebuild: false,
    errorReason: "Superseded by v99 (commit deadbee) before this build finished.",
    displacedBy: NEWER,
    createdAt: "2026-09-23T10:00:00.000Z",
    ...over
  };
}

function capture(run: () => void): string[] {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    run();
  } finally {
    console.log = original;
  }
  return lines.join("\n").split("\n");
}

/** The one printed line that begins with `label`, or a failure naming what was printed. */
function lineStartingWith(lines: readonly string[], label: string): string {
  const hit = lines.find((line) => line.trimStart().startsWith(label));
  if (hit === undefined) throw new Error(`no line starts with "${label}" in:\n${lines.join("\n")}`);
  return hit;
}

function detail(over: Partial<VibeDeploymentDto>): string[] {
  const data: GetDeploymentResponse = { deployment: deployment(over), buildJob: null };
  return capture(() => printDeploymentDetail(data));
}

describe("deployments get — a DISPLACED row names what replaced it", () => {
  it("prints a Replaced by line carrying the newer version and short sha", () => {
    expect(lineStartingWith(detail({}), "Replaced by")).toContain("v8 · 1a2b3c4");
  });

  it("reads the version from displacedBy, never from the errorReason prose", () => {
    expect(lineStartingWith(detail({}), "Replaced by")).not.toContain("v99");
  });

  it("says 'a newer deployment' when a backend a release behind sends no displacedBy", () => {
    const { displacedBy: _omitted, ...withoutKey } = deployment();
    const lines = capture(() => printDeploymentDetail({ deployment: withoutKey, buildJob: null }));
    expect(lineStartingWith(lines, "Replaced by")).toContain("a newer deployment");
  });

  it("prints no Replaced by line on a status that was not displaced", () => {
    const lines = detail({ status: "HEALTHY", displacedBy: null, errorReason: null });
    expect(lines.some((line) => line.trimStart().startsWith("Replaced by"))).toBe(false);
  });
});

describe("deployments list — the status cell of a DISPLACED row", () => {
  it("names the newer deployment beside the status", () => {
    const lines = capture(() => printDeploymentList({ deployments: [deployment()] }));
    expect(lineStartingWith(lines, deployment().id)).toContain("DISPLACED → v8 · 1a2b3c4");
  });

  it("adds nothing to a row that was not displaced", () => {
    const healthy = deployment({ status: "HEALTHY", displacedBy: null });
    const lines = capture(() => printDeploymentList({ deployments: [healthy] }));
    expect(lineStartingWith(lines, healthy.id)).not.toContain("→");
  });
});

describe("apps watch — the displaced verdict", () => {
  it("names the newer deployment that went live first", () => {
    const lines = capture(() =>
      printDisplaced({
        kind: "displaced",
        deployment: {
          id: "d7",
          status: "DISPLACED",
          versionNumber: 7,
          errorReason: null,
          displacedBy: NEWER
        }
      })
    );
    expect(lineStartingWith(lines, "!")).toContain("replaced by v8 · 1a2b3c4");
  });
});

const SUPERSEDED_BUILD: VibeBuildJobDto = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  vibeDeploymentId: "00000000-0000-4000-8000-000000000007",
  status: "SUPERSEDED",
  builder: null,
  logsRef: "",
  durationMs: 40_000,
  errorReason: "Superseded by v8 (commit 1a2b3c4); nothing about this build failed.",
  waiting: null,
  createdAt: "2026-09-23T10:00:00.000Z"
};

function deployState(over: Partial<GetDeployStateResponse> = {}): GetDeployStateResponse {
  return {
    outcome: "RECEIVED_NOT_DEPLOYED",
    resolved: { sha: deployment().triggerSha, refName: "refs/heads/main", from: "deployBranch" },
    ref: null,
    deployment: deployment(),
    buildJob: SUPERSEDED_BUILD,
    live: null,
    served: null,
    ...over
  };
}

describe("apps deploy-state — the commit a newer push displaced", () => {
  it("says what replaced it, from displacedBy", () => {
    const lines = renderDeployState(deployState(), Date.parse("2026-09-23T10:05:00.000Z"));
    expect(lineStartingWith(lines, "replaced by")).toContain("v8 · 1a2b3c4");
  });
});

/**
 * The colour is decided when `output.ts` loads: `NO_COLOR` includes
 * `!process.stdout.isTTY`, and vitest's stdout is not a TTY. So every paint is
 * the identity function here, and a tone assertion against the statically
 * imported module would pass whatever tone was chosen. Each case forces a TTY
 * and loads a FRESH copy of the module graph. The identity-paint control is
 * the first case, which proves the escape codes are really being produced.
 */
describe("colorizeStatus — the tone of each terminal status", () => {
  const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

  afterEach(() => {
    if (ttyDescriptor) Object.defineProperty(process.stdout, "isTTY", ttyDescriptor);
    else delete (process.stdout as { isTTY?: boolean }).isTTY;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function colorizeInTty(status: string): Promise<string> {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    vi.stubEnv("NO_COLOR", "");
    vi.resetModules();
    const { colorizeStatus } = await import("./colorize-status");
    return colorizeStatus(status);
  }

  const DIM = "\x1b[2m";
  const RED = "\x1b[31m";

  it("CONTROL: a failure is painted red, so this harness does produce colour", async () => {
    expect(await colorizeInTty("FAILED")).toBe(`${RED}FAILED\x1b[0m`);
  });

  it.each(["SUPERSEDED", "DISPLACED", "CANCELLED"])(
    "paints %s dim — it ended, and nothing failed",
    async (status) => {
      expect(await colorizeInTty(status)).toBe(`${DIM}${status}\x1b[0m`);
    }
  );

  it("passes a status this binary has never heard of through unpainted", async () => {
    expect(await colorizeInTty("FROBNICATED")).toBe("FROBNICATED");
  });

  it("passes a prototype key through unpainted, never looking it up as a tone", async () => {
    expect(await colorizeInTty("toString")).toBe("toString");
  });

  async function deployStateLinesInTty(state: GetDeployStateResponse): Promise<string[]> {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    vi.stubEnv("NO_COLOR", "");
    vi.resetModules();
    const { renderDeployState: render } = await import("../deploy-state/render-deploy-state");
    return render(state, Date.parse("2026-09-23T10:05:00.000Z"));
  }

  const buildLine = (lines: readonly string[]): string =>
    lines.find((line) => line.includes("build SUPERSEDED") || line.includes("build FAILED")) ?? "";

  it("paints a superseded build's reason dim — the sentence says nothing failed", async () => {
    const line = buildLine(await deployStateLinesInTty(deployState()));
    expect(line.startsWith(DIM)).toBe(true);
  });

  it("CONTROL: still paints a failed build's reason red", async () => {
    const failed = { ...SUPERSEDED_BUILD, status: "FAILED", errorReason: "npm ERR! 404" };
    const line = buildLine(await deployStateLinesInTty(deployState({ buildJob: failed })));
    expect(line.startsWith(RED)).toBe(true);
  });
});
