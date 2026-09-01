import { describe, expect, it } from "vitest";

import type { GetDeployStateResponse, VibeDeployStateOutcome } from "../vibe-wire-types";
import {
  describeOutcome,
  formatAge,
  formatServedLines,
  qualifyRefName,
  renderDeployState
} from "./apps-deploy-state";

/**
 * `apps deploy-state` is the one command whose OUTPUT is the product: the
 * endpoint behind it already holds the answer, so every defect this verb can
 * have is a rendering defect. The assertions are therefore on the WORDS, in the
 * same spirit as `apps-deployability.test.ts` — an operator who cannot tell two
 * states apart by reading the output is the failure being prevented.
 *
 * Two of them are load-bearing rather than cosmetic, and are asserted from more
 * than one direction:
 *
 *   · `served` is an OBSERVATION and its age is part of the answer. A rendering
 *     that drops the age reads as "this is what is served right now", which is
 *     the exact mistake — one layer up — of reading a HEALTHY deployment as a
 *     served one.
 *   · `servedProvenAt: null` must never render as "not serving", and the null
 *     can be PERMANENT. "Not proven" without the reason is the same trap with a
 *     politer label, so the reason is asserted too.
 */

// The colour helpers no-op when stdout is not a TTY, which it is not under
// vitest. Stripped anyway so a test never depends on that staying true.
// eslint-disable-next-line no-control-regex
const plain = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");
const render = (data: GetDeployStateResponse, nowMs: number): string =>
  plain(renderDeployState(data, nowMs).join("\n"));

const NOW = Date.parse("2026-08-04T12:00:00.000Z");

const DEPLOYMENT = {
  id: "dep-1111",
  vibeAppId: "app-1",
  color: "blue",
  versionNumber: 4,
  status: "HEALTHY",
  triggerSha: "a8a2ef7913aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  imageRef: "registry/app:a8a2ef7",
  detectedPort: 3000,
  forceRebuild: false,
  errorReason: null,
  createdAt: "2026-08-04T11:50:00.000Z"
};

const LIVE_V4 = {
  deploymentId: "dep-1111",
  versionNumber: 4,
  commitSha: "a8a2ef7913aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  url: "https://greeter.example",
  servedProvenAt: null as string | null,
  createdAt: "2026-08-04T11:50:00.000Z"
};

const SERVED_V4 = {
  deploymentId: "dep-1111",
  commitSha: "a8a2ef7913aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  imageRef: "registry/app:a8a2ef7",
  provenAt: "2026-08-04T11:55:00.000Z",
  healthyToServedMs: 42_000
};

/** The previous build — a different deployment, a different commit. */
const SERVED_V3 = {
  deploymentId: "dep-0000",
  commitSha: "111111111111111111111111111111111111bbbb",
  imageRef: "registry/app:1111111",
  provenAt: "2026-08-04T11:52:00.000Z",
  healthyToServedMs: 30_000
};

function state(over: Partial<GetDeployStateResponse> = {}): GetDeployStateResponse {
  return {
    outcome: "DEPLOYED",
    resolved: {
      sha: "a8a2ef7913aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      refName: "refs/heads/main",
      from: "deployBranch"
    },
    ref: {
      id: "ref-1",
      vibeGitProjectId: "proj-1",
      organizationId: "org-1",
      refName: "refs/heads/main",
      sha: "a8a2ef7913aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdAt: "2026-08-01T09:00:00.000Z",
      updatedAt: "2026-08-04T11:49:00.000Z"
    },
    deployment: DEPLOYMENT,
    buildJob: null,
    live: { ...LIVE_V4, servedProvenAt: SERVED_V4.provenAt },
    served: SERVED_V4,
    ...over
  };
}

describe("qualifyRefName — the flag a person actually types", () => {
  it("expands a bare branch name, because the contract only accepts a full ref", () => {
    // Without this, `--ref main` is refused by a Zod regex message — the same
    // "the platform knows and will not say" shape this command exists to close.
    expect(qualifyRefName("main")).toBe("refs/heads/main");
  });

  it("leaves an already-qualified ref alone, which is how a TAG is reached", () => {
    expect(qualifyRefName("refs/tags/v1.0")).toBe("refs/tags/v1.0");
    expect(qualifyRefName("refs/heads/release/prod")).toBe("refs/heads/release/prod");
  });

  it("trims, so a copy-pasted ref with whitespace is not silently mis-qualified", () => {
    expect(qualifyRefName("  refs/heads/main  ")).toBe("refs/heads/main");
    expect(qualifyRefName(" main ")).toBe("refs/heads/main");
  });
});

describe("formatAge — the staleness of an observation", () => {
  it("scales from seconds to days", () => {
    expect(formatAge(5_000)).toBe("5s ago");
    expect(formatAge(5 * 60_000)).toBe("5m ago");
    expect(formatAge(5 * 3_600_000)).toBe("5h ago");
    expect(formatAge(5 * 86_400_000)).toBe("5d ago");
  });

  it("renders clock skew as 'just now' rather than a negative number", () => {
    // A negative age reads as a corrupted answer when it is a corrupted clock.
    expect(formatAge(-4_000)).toBe("just now");
  });
});

describe("describeOutcome — the discriminator, with its meaning", () => {
  const ALL: VibeDeployStateOutcome[] = [
    "DEPLOYED",
    "RECEIVED_NOT_DEPLOYED",
    "NOT_RECEIVED",
    "REF_UNKNOWN",
    "NO_REPOSITORY"
  ];

  it("gives every outcome a distinct explanation, not just a distinct word", () => {
    const described = ALL.map((o) => plain(describeOutcome(o)));
    expect(new Set(described).size).toBe(ALL.length);
    for (const line of described) expect(line.length).toBeGreaterThan(30);
  });

  it("says RECEIVED_NOT_DEPLOYED means the push LANDED", () => {
    // The dangerous misreading: an operator who reads this as a push failure
    // goes hunting a git problem that does not exist.
    const line = plain(describeOutcome("RECEIVED_NOT_DEPLOYED"));
    expect(line).toContain("LANDED");
    expect(line).toContain("deploy branch");
  });

  it("warns that NOT_RECEIVED means 'cannot see it', not 'rejected'", () => {
    // Ref rows record HEADS, so a commit that landed and was then pushed past
    // also reads NOT_RECEIVED. Stating only the enum invites the wrong action.
    const line = plain(describeOutcome("NOT_RECEIVED"));
    expect(line).toContain("HEADS");
    expect(line).not.toContain("rejected the push");
  });

  it("names the FIX for NO_REPOSITORY, not just the state", () => {
    expect(plain(describeOutcome("NO_REPOSITORY"))).toContain("attach-repo");
  });

  it("prints an unrecognised outcome rather than dropping it", () => {
    // A published binary routinely talks to a newer backend. The cast is the
    // point of the test: it simulates a value this CLI version cannot know.
    const line = plain(describeOutcome("SOMETHING_NEW" as VibeDeployStateOutcome));
    expect(line).toContain("SOMETHING_NEW");
    expect(line).toContain("upgrade");
  });
});

describe("formatServedLines — an observation is never rendered without its age", () => {
  it("carries the age in every one of the three cases", () => {
    const cases = [
      formatServedLines(null, null, NOW),
      formatServedLines({ ...LIVE_V4, servedProvenAt: SERVED_V4.provenAt }, SERVED_V4, NOW),
      formatServedLines(LIVE_V4, SERVED_V3, NOW)
    ];
    // Case 1 has nothing to date; the other two MUST say how old the
    // observation is, or they read as "this is what is served right now".
    expect(plain(cases[1].join(" "))).toContain("5m ago");
    expect(plain(cases[2].join(" "))).toContain("8m ago");
  });

  it("never says 'not serving' — in any case, ever", () => {
    // The single invariant this whole module exists to hold. `servedProvenAt`
    // is about EVIDENCE; a reader who takes its null for "not serving"
    // reinvents the bug the field was added to close.
    const everything = [
      formatServedLines(null, null, NOW),
      formatServedLines(LIVE_V4, null, NOW),
      formatServedLines({ ...LIVE_V4, servedProvenAt: SERVED_V4.provenAt }, SERVED_V4, NOW),
      formatServedLines(LIVE_V4, SERVED_V3, NOW),
      formatServedLines(null, SERVED_V3, NOW)
    ]
      .flat()
      .map(plain)
      .join("\n");
    expect(everything.toLowerCase()).not.toContain("not serving");
    expect(everything.toLowerCase()).not.toContain("not served");
  });

  it("reads a null `served` as 'not observed', and says the probe may never reach the app", () => {
    const lines = plain(formatServedLines(LIVE_V4, null, NOW).join("\n"));
    expect(lines).toContain("not observed");
    expect(lines).toContain("NOT a statement that nothing is being served");
    expect(lines).toContain("cannot reach");
  });

  it("names BOTH builds when the edge was last seen on the previous one", () => {
    // This is the case `served` was added for: without naming the target, the
    // operator cannot tell "proof is still coming" from "the swap has not
    // happened", which is the ambiguity the old bare null carried.
    const lines = plain(formatServedLines(LIVE_V4, SERVED_V3, NOW).join("\n"));
    expect(lines).toContain("previous build");
    expect(lines).toContain("1111111"); // the served (old) commit
    expect(lines).toContain("v4"); // the live (new) version it has not swapped to
    expect(lines).toContain("a8a2ef7"); // the live (new) commit
  });

  it("does not invent a live slot to compare against when the slot is EMPTY", () => {
    // Nothing is HEALTHY, yet the edge was observed answering. Calling that a
    // "previous build" that has not swapped to "the deployment now in the live
    // slot" contradicts the Live line directly above it, which says the slot is
    // empty — and it misstates the real case: an app still answering while no
    // deployment is healthy. The observation is the whole finding here.
    const lines = plain(formatServedLines(null, SERVED_V3, NOW).join("\n"));
    expect(lines).toContain("last observed");
    expect(lines).toContain("1111111"); // the observed commit is still named
    expect(lines).toContain("8m ago"); // and still carries its age
    expect(lines).not.toContain("previous build");
    expect(lines).not.toContain("the deployment now in the live slot");
  });

  it("reports the healthy-to-served lag when the swap is proven", () => {
    const lines = plain(
      formatServedLines({ ...LIVE_V4, servedProvenAt: SERVED_V4.provenAt }, SERVED_V4, NOW).join(
        "\n"
      )
    );
    expect(lines).toContain("42s after");
    expect(lines).toContain("UPPER bound");
  });
});

describe("renderDeployState — the whole answer", () => {
  it("explains a null `servedProvenAt` as NOT PROVEN, and says the null can be permanent", () => {
    // Both halves are required. "Not proven" alone is the same trap with a
    // politer label: a reader still has to guess whether waiting will fix it.
    const out = render(state({ live: LIVE_V4, served: SERVED_V3 }), NOW);
    expect(out).toContain("Not PROVEN served");
    expect(out).toContain('Not proven is not "not serving"');
    expect(out).toContain("permanently");
    expect(out).toContain("cannot reach");
  });

  it("does not claim 'not proven' when the swap IS proven", () => {
    const out = render(state(), NOW);
    expect(out).not.toContain("Not PROVEN");
  });

  it("keeps Live and Served as separate readings, and says Live precedes the swap", () => {
    // Collapsing the two into one badge is the defect the pair exists to
    // prevent — they routinely disagree for whole minutes after a deploy.
    const out = render(state({ live: LIVE_V4, served: SERVED_V3 }), NOW);
    expect(out).toContain("Live");
    expect(out).toContain("Served");
    expect(out).toContain("BEFORE the edge swaps");
  });

  it("does not contradict itself when the live slot is empty but the edge was observed", () => {
    // The Live and Served blocks are built by separate functions and printed
    // adjacently, so a disagreement between them is invisible to any test that
    // reads only one. Here Live says the slot is empty while Served used to say
    // the edge had not swapped to "the deployment now in the live slot" — two
    // statements about the same slot that cannot both be true.
    const out = render(state({ live: null, served: SERVED_V3 }), NOW);
    expect(out).toContain("nothing in the live slot");
    expect(out).toContain("last observed");
    expect(out).not.toContain("previous build");
    expect(out).not.toContain("the deployment now in the live slot");
  });

  it("distinguishes 'never arrived' from 'arrived and nothing deployed it'", () => {
    // The two readings of a bare `deployment === null`, which is the whole
    // reason the endpoint leads with a discriminator.
    const notReceived = render(
      state({
        outcome: "NOT_RECEIVED",
        ref: null,
        deployment: null,
        live: null,
        served: null,
        resolved: { sha: "deadbee", refName: null, from: "sha" }
      }),
      NOW
    );
    const notDeployed = render(
      state({ outcome: "RECEIVED_NOT_DEPLOYED", deployment: null, live: null, served: null }),
      NOW
    );
    expect(notReceived).toContain("NOT_RECEIVED");
    expect(notReceived).toContain("no ref row");
    expect(notDeployed).toContain("RECEIVED_NOT_DEPLOYED");
    expect(notDeployed).toContain("is the head of refs/heads/main");
    expect(notReceived).not.toBe(notDeployed);
  });

  it("says WHICH commit it answered about when the caller named nothing", () => {
    // A caller who passed neither --sha nor --ref is otherwise unable to tell.
    expect(render(state(), NOW)).toContain("resolved from the app's own deploy branch");
    expect(
      render(state({ resolved: { sha: "abc1234", refName: null, from: "sha" } }), NOW)
    ).toContain("resolved from the sha you named");
  });

  it("surfaces the build's error, which is why the build job is inlined at all", () => {
    const out = render(
      state({
        deployment: { ...DEPLOYMENT, status: "FAILED", errorReason: "build failed" },
        buildJob: {
          id: "job-1",
          vibeDeploymentId: "dep-1111",
          status: "FAILED",
          builder: "buildpack",
          logsRef: "s3://logs/job-1",
          durationMs: 1200,
          errorReason: "no lockfile found",
          createdAt: "2026-08-04T11:50:00.000Z"
        }
      }),
      NOW
    );
    expect(out).toContain("no lockfile found");
    expect(out).toContain("s3://logs/job-1");
  });

  it("renders a null Live as 'nothing in the live slot', never as a served claim", () => {
    const out = render(state({ live: null, served: null, deployment: null }), NOW);
    expect(out).toContain("nothing in the live slot");
    expect(out.toLowerCase()).not.toContain("not serving");
  });
});
