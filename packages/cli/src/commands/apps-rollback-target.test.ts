import { describe, expect, it } from "vitest";

import type { VibeDeploymentDto } from "../vibe-wire-types";
import {
  parseTargetVersion,
  resolveRollbackTargetByVersion,
  restorableVersions
} from "./apps-rollback-target";

/**
 * `--to-version <n>` maps an operator's version number onto ONE deployment id.
 *
 * 🚨 EVERY ASSERTION HERE HAS TO SEPARATE A REFUSAL FROM A DIFFERENT REFUSAL,
 * not merely "did it refuse". Five of the six refusal kinds are reachable for a
 * version that EXISTS, so a suite that only checks `ok === false` passes against
 * a resolver that returns the wrong reason for every one of them — and the wrong
 * reason is the whole cost here, because the reason is what tells an operator
 * mid-incident whether to pick another version or to redeploy a commit.
 *
 * The one thing no assertion below may do is accept a resolution: a wrong
 * `target` is a production rollback onto a version nobody named.
 */

const APP = "11111111-2222-4333-8444-555555555555";

/**
 * A deployment as `ListDeployments` sends one. Every field is required by the
 * DTO, so the builder carries a complete row and each case overrides only what
 * it is actually about — a fixture that varies more than the thing under test
 * makes a red ambiguous.
 */
function deployment(
  over: Partial<VibeDeploymentDto> & { versionNumber: number }
): VibeDeploymentDto {
  return {
    id: `dep-${String(over.versionNumber)}`,
    vibeAppId: APP,
    color: "blue",
    status: "SUPERSEDED",
    // Non-empty by default: an empty `imageRef` is its OWN refusal, so a
    // fixture that left it blank would make every case fail for that reason.
    imageRef: "ecr.example/app:abc1234",
    triggerSha: `${String(over.versionNumber)}aaaaaa`,
    detectedPort: 8080,
    forceRebuild: false,
    errorReason: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    ...over
  };
}

/** v3 serving, v2 and v1 restorable behind it — the ordinary shape. */
const HISTORY: VibeDeploymentDto[] = [
  deployment({ versionNumber: 3, status: "HEALTHY" }),
  deployment({ versionNumber: 2 }),
  deployment({ versionNumber: 1 })
];

function refusalOf(result: ReturnType<typeof resolveRollbackTargetByVersion>) {
  expect(result.ok, "expected a refusal, got a resolved target").toBe(false);
  if (result.ok) throw new Error("unreachable — asserted above");
  return result;
}

describe("resolveRollbackTargetByVersion — it resolves to one row or refuses", () => {
  it("resolves a superseded version to that exact deployment", () => {
    const result = resolveRollbackTargetByVersion(APP, HISTORY, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // The ID is the whole point: it is what goes on the wire as
    // `targetDeploymentId`, and naming the wrong one rolls back the wrong app version.
    expect(result.target.id).toBe("dep-2");
    expect(result.target.versionNumber).toBe(2);
  });

  it("refuses an app with no deployments as no-deployments, not as no-such-version", () => {
    const refusal = refusalOf(resolveRollbackTargetByVersion(APP, [], 1));
    expect(refusal.kind).toBe("no-deployments");
    // "no version v1" would send someone hunting for a v1 that could not exist.
    expect(refusal.message).toContain("no deployments");
    expect(refusal.hint).toContain("nexus apps deploy");
  });

  it("refuses a version nothing carries, and names the versions that ARE restorable", () => {
    const refusal = refusalOf(resolveRollbackTargetByVersion(APP, HISTORY, 9));
    expect(refusal.kind).toBe("no-such-version");
    expect(refusal.message).toContain("v9");
    // The list is the useful half — without it the operator runs a second command.
    expect(refusal.hint).toContain("v2");
    expect(refusal.hint).toContain("v1");
    // v3 is HEALTHY, so it is not a restorable target and must not be offered.
    expect(refusal.hint).not.toContain("v3");
  });

  it("refuses the version already serving with its OWN reason, not 'not restorable'", () => {
    // 🚨 THE ORDERING TEST. The serving row is HEALTHY, so it is also
    // not-SUPERSEDED: a resolver that checks restorability first answers
    // "v3 is HEALTHY and only a superseded version can be restored" — true,
    // and it hides that the operator already has what they asked for.
    const refusal = refusalOf(resolveRollbackTargetByVersion(APP, HISTORY, 3));
    expect(refusal.kind).toBe("already-serving");
    expect(refusal.message).toContain("already serving");
  });

  it("refuses a version that never served, and says redeploy rather than restore", () => {
    const failed = [...HISTORY, deployment({ versionNumber: 4, status: "FAILED", imageRef: "" })];
    const refusal = refusalOf(resolveRollbackTargetByVersion(APP, failed, 4));
    // FAILED is imageless too, for an unrelated reason. Reporting "no image"
    // here would name a symptom and hide the cause.
    expect(refusal.kind).toBe("not-restorable");
    expect(refusal.message).toContain("FAILED");
    // A version with no retained image can only be reached by building it again,
    // and the hint names the exact commit rather than describing the idea.
    expect(refusal.hint).toContain("4aaaaaa");
  });

  it("refuses DISPLACED, which carries an image but never served", () => {
    // The schema comment is explicit that a DISPLACED row's image was never
    // verified, so it must never be a restore candidate. It is the one status
    // that looks restorable from its fields alone.
    const displaced = [...HISTORY, deployment({ versionNumber: 5, status: "DISPLACED" })];
    const refusal = refusalOf(resolveRollbackTargetByVersion(APP, displaced, 5));
    expect(refusal.kind).toBe("not-restorable");
  });

  it("refuses a superseded version whose image is gone", () => {
    const imageless = [
      deployment({ versionNumber: 3, status: "HEALTHY" }),
      deployment({ versionNumber: 2, imageRef: "" })
    ];
    const refusal = refusalOf(resolveRollbackTargetByVersion(APP, imageless, 2));
    expect(refusal.kind).toBe("target-has-no-image");
    expect(refusal.hint).toContain("2aaaaaa");
  });

  it("refuses two rows claiming one version instead of picking either", () => {
    // Unreachable against today's server — `@@unique([vibeAppId, versionNumber])`
    // makes it impossible — so this asserts the resolver's own contract against
    // a list that arrives over a wire. Guessing here is a wrong production
    // rollback; refusing costs a re-run.
    const twins = [
      deployment({ versionNumber: 3, status: "HEALTHY" }),
      deployment({ versionNumber: 2, id: "dep-2a" }),
      deployment({ versionNumber: 2, id: "dep-2b" })
    ];
    const refusal = refusalOf(resolveRollbackTargetByVersion(APP, twins, 2));
    expect(refusal.kind).toBe("ambiguous-version");
    expect(refusal.message).toContain("dep-2a");
    expect(refusal.message).toContain("dep-2b");
  });

  it("says so plainly when NOTHING is restorable, rather than printing an empty list", () => {
    const only = [deployment({ versionNumber: 1, status: "HEALTHY" })];
    const refusal = refusalOf(resolveRollbackTargetByVersion(APP, only, 7));
    expect(refusal.kind).toBe("no-such-version");
    expect(refusal.hint).toContain("No version of this app can be rolled back to");
    // An empty enumeration reads as a rendering bug and answers nothing.
    expect(refusal.hint).not.toMatch(/Restorable versions: *\./);
  });

  it("gives every refusal kind a hint, because a refusal with no way forward is half an answer", () => {
    const cases = [
      resolveRollbackTargetByVersion(APP, [], 1),
      resolveRollbackTargetByVersion(APP, HISTORY, 9),
      resolveRollbackTargetByVersion(APP, HISTORY, 3),
      resolveRollbackTargetByVersion(
        APP,
        [...HISTORY, deployment({ versionNumber: 4, status: "FAILED" })],
        4
      )
    ];
    for (const result of cases) {
      const refusal = refusalOf(result);
      expect(refusal.hint.length, `${refusal.kind} refused with an empty hint`).toBeGreaterThan(0);
    }
  });
});

describe("restorableVersions — newest first, superseded only", () => {
  it("lists only versions that can actually be restored", () => {
    const mixed = [
      deployment({ versionNumber: 5, status: "HEALTHY" }),
      deployment({ versionNumber: 4, status: "FAILED" }),
      deployment({ versionNumber: 3 }),
      deployment({ versionNumber: 2, imageRef: "" }),
      deployment({ versionNumber: 1 })
    ];
    expect(restorableVersions(mixed)).toEqual([3, 1]);
  });

  it("orders by version rather than by the order the server sent", () => {
    const shuffled = [
      deployment({ versionNumber: 1 }),
      deployment({ versionNumber: 7 }),
      deployment({ versionNumber: 4 })
    ];
    expect(restorableVersions(shuffled)).toEqual([7, 4, 1]);
  });
});

describe("parseTargetVersion — the flag reads what the CLI prints", () => {
  it("accepts a bare number", () => {
    expect(parseTargetVersion("7")).toBe(7);
  });

  it("accepts the `v7` form, which is what every listing shows", () => {
    // `apps deployments list` renders a Version column of `v7`. Refusing the
    // exact string the product just printed is a footgun with no upside.
    expect(parseTargetVersion("v7")).toBe(7);
    expect(parseTargetVersion("V7")).toBe(7);
  });

  it("trims surrounding whitespace", () => {
    expect(parseTargetVersion("  12  ")).toBe(12);
  });

  it("refuses a value with trailing junk instead of reading a prefix of it", () => {
    // `parseInt` would read these as 7 and 1 — a typo silently becoming a
    // DIFFERENT, valid version is the worst outcome this parser can produce.
    expect(parseTargetVersion("7abc")).toBeNull();
    expect(parseTargetVersion("1e3")).toBeNull();
    expect(parseTargetVersion("7.9")).toBeNull();
    expect(parseTargetVersion("7 8")).toBeNull();
  });

  it("refuses zero and negatives, which no deployment can carry", () => {
    expect(parseTargetVersion("0")).toBeNull();
    expect(parseTargetVersion("-3")).toBeNull();
  });

  it("refuses empty and non-numeric input", () => {
    expect(parseTargetVersion("")).toBeNull();
    expect(parseTargetVersion("   ")).toBeNull();
    expect(parseTargetVersion("latest")).toBeNull();
  });

  it("refuses a number too large to compare reliably", () => {
    // Past `Number.MAX_SAFE_INTEGER` two distinct versions compare equal, so a
    // resolved match would be meaningless rather than merely improbable.
    expect(parseTargetVersion("9007199254740993")).toBeNull();
  });
});
