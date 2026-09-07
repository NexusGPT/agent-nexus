/**
 * The release pin gate, driven against the bytes that actually shipped.
 *
 * ## Why this spec is in `test/` and not beside its siblings in `src/`
 *
 * `tsconfig.json` compiles `src` with `rootDir: src`, so anything under `src/`
 * that imports `scripts/` fails the build typecheck with TS6059 — and it fails
 * for the whole package, not just for the spec. `tsconfig.test.json` is the one
 * that spans `src`, `test` and `scripts`, and `vitest.config.ts` includes both
 * trees in one runner. So a spec covering a `scripts/` module belongs here;
 * `test/skills-bundle/select-skill-dirs.test.ts` is the existing precedent.
 *
 * ## Why the fixture is recorded rather than invented
 *
 * The state under test is not hypothetical. `@agent-nexus/cli@1.3.0` was
 * published 2026-09-05T15:36:49Z with its bundle recording pin `61fb85d2dd`,
 * while `NexusGPT/claude-code-skills-nexus@main` stood at `ec5acadf30` — eight
 * commits further on, one of them the enforcement fix merged as PR #45 a day
 * earlier. `PUBLISHED_1_3_0_PIN` is read out of the tarball; `GAP_AT_1_3_0` is
 * GitHub's own compare payload, trimmed to the fields this code reads.
 *
 * Re-derive both rather than trusting these constants:
 *
 *   npm pack @agent-nexus/cli@1.3.0 && tar xzf agent-nexus-cli-1.3.0.tgz
 *   jq -r .sha package/dist/skills-content.generated.json
 *   gh api repos/NexusGPT/claude-code-skills-nexus/compare/61fb85d2dd2041143ed5d7eba3d97af21b339faa...ec5acadf30
 *
 * A gate proven only against an input its author wrote is proven against that
 * author's model of the defect. This one is proven against the defect.
 *
 * ## The controls that must stay green
 *
 * A checker that refuses everything is noise and gets removed, which is worse
 * than not having it. Two arms hold that line: a pin that IS the branch head
 * passes, and — the case that matters in production, because it is the common
 * one — a sync carrying no CLI release tag never consults this code at all.
 * That second control lives in the workflow and is asserted here against the
 * workflow's own text.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  checkPublishPin,
  gateOutputs,
  PUBLISH_PIN_EXIT_CODE
} from "../../scripts/skills-drift/publish-pin";
import type { GitHubReader, ReadResult } from "../../scripts/skills-drift/upstream";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");

/** The sha `@agent-nexus/cli@1.3.0`'s own bundle records. Read from the tarball. */
const PUBLISHED_1_3_0_PIN = "61fb85d2dd2041143ed5d7eba3d97af21b339faa";

/** `NexusGPT/claude-code-skills-nexus@main` at the instant 1.3.0 was published. */
const UPSTREAM_HEAD_AT_1_3_0 = "ec5acadf300227d1f5d0d99617fcb7cba5f07d2c";

/**
 * GitHub's compare of `61fb85d2dd...ec5acadf30`, trimmed to the read fields.
 * Eight commits, `behind_by` zero — the pin was cleanly behind, not diverged.
 */
const GAP_AT_1_3_0 = {
  status: "ahead",
  ahead_by: 8,
  behind_by: 0,
  total_commits: 8,
  commits: [
    {
      sha: "6242c695359afb4aae2d49d311c05dd722d7ef8f",
      commit: {
        committer: { date: "2026-09-03T02:11:52Z" },
        message: "docs(app-builder): the CLI group is `nexus apps`, and the `app` noun is gone"
      }
    },
    {
      sha: "c5f92f9a9cb218dcc9014fab40f757d507ddf48e",
      commit: {
        committer: { date: "2026-09-03T02:21:08Z" },
        message:
          "docs(app-builder): apps and git projects CAN be deleted; it is RENAME that has no route"
      }
    },
    {
      sha: "3edc3d3da90708c9e6b3f937721c1f6fd2e47359",
      commit: {
        committer: { date: "2026-09-04T09:52:47Z" },
        message: "fix(hooks): re-land W69 — a stale branch put both enforcers back to one root"
      }
    },
    {
      sha: "d984ee27eac9f438cd3558f41205f9d3fcb4c769",
      commit: {
        committer: { date: "2026-09-04T15:50:17Z" },
        message: "chore(hooks): merge main — the changelog conflict is additive, both entries stand"
      }
    },
    {
      sha: "eb35d622ee64fda5534a63d9e8d98c65f1299125",
      commit: {
        committer: { date: "2026-09-04T15:55:54Z" },
        message:
          "Merge pull request #45 from NexusGPT/fix/restore-sandbox-workspace-roots-enforcement"
      }
    },
    {
      sha: "55e1c60c40912c36cb665200c867965730f801b8",
      commit: {
        committer: { date: "2026-09-04T20:23:18Z" },
        message: "Merge pull request #43 from NexusGPT/fix/skills-docs-vibe-to-apps"
      }
    },
    {
      sha: "0be467832e6a6775d2ee404234755acadc27d59f",
      commit: {
        committer: { date: "2026-09-04T20:24:31Z" },
        message:
          "merge: main into false-route-claims — keep the delete-exists correction and the apps noun"
      }
    },
    {
      sha: UPSTREAM_HEAD_AT_1_3_0,
      commit: {
        committer: { date: "2026-09-04T20:25:33Z" },
        message: "Merge pull request #44 from NexusGPT/fix/skills-docs-false-route-claims"
      }
    }
  ]
};

/**
 * A reader scripted from a path→body map.
 *
 * Every request an arm did not anticipate resolves to a 500 rather than a
 * default body: a stub that answers a call the code was not expected to make
 * turns an unexpected code path into a passing one.
 */
function readerFor(routes: Record<string, unknown>): GitHubReader {
  return (apiPath: string): Promise<ReadResult> => {
    if (apiPath in routes) {
      return Promise.resolve({ kind: "ok", body: routes[apiPath] });
    }
    return Promise.resolve({
      kind: "http",
      status: 500,
      statusText: `unstubbed path ${apiPath}`
    });
  };
}

const GAP_ROUTES = {
  "/commits/main": { sha: UPSTREAM_HEAD_AT_1_3_0 },
  [`/compare/${PUBLISHED_1_3_0_PIN}...${UPSTREAM_HEAD_AT_1_3_0}`]: GAP_AT_1_3_0
};

describe("the release pin gate, against the state that shipped 1.3.0", () => {
  it("REFUSES the pin @agent-nexus/cli@1.3.0 actually published", async () => {
    const verdict = await checkPublishPin({
      pin: PUBLISHED_1_3_0_PIN,
      read: readerFor(GAP_ROUTES)
    });

    expect(verdict.state).toBe("RELEASE_PIN_BEHIND");
    expect(verdict.code).toBe("PIN_BEHIND_HEAD");
    expect(PUBLISH_PIN_EXIT_CODE[verdict.state]).toBe(1);
  });

  it("names every missing commit, so the refusal is not a hunt", async () => {
    const verdict = await checkPublishPin({
      pin: PUBLISHED_1_3_0_PIN,
      read: readerFor(GAP_ROUTES)
    });

    // Asserted as a SET of shas, not as a substring of the rendered blob: over a
    // rendered report every short sha is a substring of its own full sha and of
    // the surrounding prose, so `toContain` there passes for the wrong reason.
    expect(verdict.missing.map((c) => c.sha)).toEqual(GAP_AT_1_3_0.commits.map((c) => c.sha));
  });

  it("carries the enforcement fix's own commit and its PR number", async () => {
    const verdict = await checkPublishPin({
      pin: PUBLISHED_1_3_0_PIN,
      read: readerFor(GAP_ROUTES)
    });

    // The commit that carries the fix, and the merge that landed it. These are
    // the two rows whose absence from a refusal would send the reader to the
    // compare view — the investigation the gate exists to replace.
    const fix = verdict.missing.find((c) => c.sha.startsWith("3edc3d3da9"));
    expect(fix?.subject).toContain("re-land W69");
    expect(fix?.date).toBe("2026-09-04T09:52:47Z");

    expect(verdict.missing.map((c) => c.pr)).toContain(45);
  });

  it("puts each missing sha in the printed detail, and nothing that is not missing", async () => {
    const verdict = await checkPublishPin({
      pin: PUBLISHED_1_3_0_PIN,
      read: readerFor(GAP_ROUTES)
    });
    const detail = verdict.detail.join("\n");

    for (const commit of GAP_AT_1_3_0.commits) {
      expect(detail).toContain(commit.sha.slice(0, 10));
    }
    // The discriminating half. A renderer that printed every commit it had ever
    // seen — or the pin itself as though it were missing — would satisfy the
    // loop above and fail here.
    expect(detail).not.toContain(PUBLISHED_1_3_0_PIN.slice(0, 10));
  });

  it("prints the remedy, not just the diagnosis", async () => {
    const verdict = await checkPublishPin({
      pin: PUBLISHED_1_3_0_PIN,
      read: readerFor(GAP_ROUTES)
    });
    expect(verdict.detail.join("\n")).toContain("run gen:skills");
  });
});

describe("the controls that must stay green", () => {
  it("passes when the pin IS the branch head", async () => {
    const verdict = await checkPublishPin({
      pin: UPSTREAM_HEAD_AT_1_3_0,
      read: readerFor({ "/commits/main": { sha: UPSTREAM_HEAD_AT_1_3_0 } })
    });

    expect(verdict.state).toBe("RELEASE_PIN_CURRENT");
    expect(verdict.missing).toEqual([]);
    expect(PUBLISH_PIN_EXIT_CODE[verdict.state]).toBe(0);
  });

  it("compares case-insensitively, so an upper-case sha is not a false refusal", async () => {
    const verdict = await checkPublishPin({
      pin: UPSTREAM_HEAD_AT_1_3_0.toUpperCase(),
      read: readerFor({ "/commits/main": { sha: UPSTREAM_HEAD_AT_1_3_0 } })
    });
    expect(verdict.state).toBe("RELEASE_PIN_CURRENT");
  });

  it("never runs at all on a sync that carries no CLI release tag", () => {
    // The production control. Most mirror syncs release nothing, or release only
    // the sdk — and this gate must be invisible to them, or it becomes a tax on
    // traffic it has no opinion about. That guard is a condition in the
    // workflow, so the workflow is what has to be read.
    //
    // AND THIS ARM READS TEXT, NOT BEHAVIOUR — say so rather than let a green
    // imply more. It catches the guard being deleted or renamed, which is the
    // realistic regression. It cannot catch the guard being present and wrong:
    // a condition that never matches, a step ordered after the tag push, a
    // `working-directory` that puts the tags file out of reach. Only a run of
    // the workflow answers those, and nothing here is a substitute for one.
    const workflow = fs.readFileSync(
      path.join(REPO_ROOT, ".github", "workflows", "mirror-public-packages.yml"),
      "utf-8"
    );
    expect(workflow).toContain("check-publish-pin.ts");
    expect(workflow).toContain("grep -q '^cli-v' \"${GITHUB_WORKSPACE}/tags-to-push.txt\"");
  });
});

describe("a gate that cannot measure must not report success", () => {
  it("refuses with NO_TOKEN when there is no credential", async () => {
    const verdict = await checkPublishPin({ pin: PUBLISHED_1_3_0_PIN, read: null });
    expect(verdict.state).toBe("RELEASE_PIN_UNCHECKED");
    expect(verdict.code).toBe("NO_TOKEN");
    expect(PUBLISH_PIN_EXIT_CODE[verdict.state]).toBe(2);
  });

  it("refuses when the branch head cannot be read", async () => {
    const verdict = await checkPublishPin({
      pin: PUBLISHED_1_3_0_PIN,
      read: () => Promise.resolve({ kind: "transport", message: "socket hang up" })
    });
    expect(verdict.state).toBe("RELEASE_PIN_UNCHECKED");
    expect(verdict.code).toBe("HEAD_UNREADABLE");
  });

  it("refuses when the pin is not an object upstream holds", async () => {
    const verdict = await checkPublishPin({
      pin: PUBLISHED_1_3_0_PIN,
      read: (apiPath) =>
        Promise.resolve(
          apiPath === "/commits/main"
            ? { kind: "ok", body: { sha: UPSTREAM_HEAD_AT_1_3_0 } }
            : { kind: "http", status: 404, statusText: "Not Found" }
        )
    });
    expect(verdict.state).toBe("RELEASE_PIN_UNCHECKED");
    expect(verdict.code).toBe("PIN_NOT_IN_UPSTREAM");
  });

  it("refuses when two different shas compare to no commits at all", async () => {
    const verdict = await checkPublishPin({
      pin: PUBLISHED_1_3_0_PIN,
      read: readerFor({
        "/commits/main": { sha: UPSTREAM_HEAD_AT_1_3_0 },
        [`/compare/${PUBLISHED_1_3_0_PIN}...${UPSTREAM_HEAD_AT_1_3_0}`]: {
          status: "ahead",
          ahead_by: 3,
          behind_by: 0,
          total_commits: 3,
          commits: []
        }
      })
    });
    // Not a pass. A gap the code could not enumerate is a gap nobody has read.
    expect(verdict.state).toBe("RELEASE_PIN_UNCHECKED");
    expect(verdict.code).toBe("COMPARE_EMPTY");
  });
});

describe("a pin off the branch is a different refusal from a pin behind it", () => {
  it("reports PIN_DIVERGED, because refreshing the pin is not the remedy", async () => {
    const verdict = await checkPublishPin({
      pin: PUBLISHED_1_3_0_PIN,
      read: readerFor({
        "/commits/main": { sha: UPSTREAM_HEAD_AT_1_3_0 },
        [`/compare/${PUBLISHED_1_3_0_PIN}...${UPSTREAM_HEAD_AT_1_3_0}`]: {
          ...GAP_AT_1_3_0,
          status: "diverged",
          behind_by: 2
        }
      })
    });

    expect(verdict.state).toBe("RELEASE_PIN_BEHIND");
    expect(verdict.code).toBe("PIN_DIVERGED");
    // Still names the commits — a diverged pin needs the list more, not less.
    expect(verdict.missing).toHaveLength(GAP_AT_1_3_0.commits.length);
  });
});

describe("a truncated compare says so rather than reading as complete", () => {
  it("names the commits it could not list", async () => {
    const verdict = await checkPublishPin({
      pin: PUBLISHED_1_3_0_PIN,
      read: readerFor({
        "/commits/main": { sha: UPSTREAM_HEAD_AT_1_3_0 },
        [`/compare/${PUBLISHED_1_3_0_PIN}...${UPSTREAM_HEAD_AT_1_3_0}`]: {
          ...GAP_AT_1_3_0,
          ahead_by: 300,
          total_commits: 300
        }
      })
    });

    expect(verdict.detail.join("\n")).toContain(
      `and ${300 - GAP_AT_1_3_0.commits.length} more not listed`
    );
  });
});

describe("the verdict the workflow reads, one arm per state", () => {
  // `steps.publish_pin.outcome` is a TWO-state field and this is a THREE-state
  // question, which is why the mapping is code with arms rather than a condition
  // spelled out in YAML. Two decisions, deliberately independent:
  //   withhold — may this release publish?
  //   verdict  — whose problem is it, and does it page?

  it("a current pin ships and withholds nothing", () => {
    expect(gateOutputs("RELEASE_PIN_CURRENT")).toEqual({ verdict: "current", withhold: false });
  });

  it("a pin behind upstream is a deliberate refusal, and withholds", () => {
    expect(gateOutputs("RELEASE_PIN_BEHIND")).toEqual({ verdict: "behind", withhold: true });
  });

  it("an unverified pin withholds too — 1.3.0 shipped from exactly this state", () => {
    expect(gateOutputs("RELEASE_PIN_UNCHECKED").withhold).toBe(true);
  });

  it("UNCHECKED IS NOT A REFUSAL, so a tooling failure still pages", () => {
    // THE DISCRIMINATING ARM. The workflow arms `release_refused` on the exact
    // string `behind`, and `release_refused` is what SUPPRESSES the mirror
    // alarm. If `unchecked` reported itself as `behind`, a pnpm mismatch or a
    // missing credential would withhold the release AND silence the page —
    // nobody measured the pin, nobody shipped, and nobody was told. That is
    // strictly worse than the false page this whole chain started with, and no
    // other arm here can fail on it: the two states agree on `withhold`.
    expect(gateOutputs("RELEASE_PIN_UNCHECKED").verdict).not.toBe("behind");
    expect(gateOutputs("RELEASE_PIN_UNCHECKED").verdict).toBe("unchecked");
  });

  it("only `current` and `not-applicable` may publish, and the workflow tests that negatively", () => {
    // An ABSENT verdict — the gate killed, or never reached — must withhold. A
    // positive test ('is it behind?') would publish an unverified pin whenever
    // the check died, which is the direction that ships the defect.
    const workflow = fs.readFileSync(
      path.join(REPO_ROOT, ".github", "workflows", "mirror-public-packages.yml"),
      "utf-8"
    );
    expect(workflow).toContain("steps.publish_pin.outputs.verdict != 'current'");
    expect(workflow).toContain("steps.publish_pin.outputs.verdict != 'not-applicable'");
    // The workflow publishes FACTS and computes no verdict of its own: whether
    // they add up to a deliberate refusal is `releaseWasRefused` in
    // `scripts/mirror-release-reconcile.mjs`, which has arms. A YAML expression
    // has none, which is why the decision is not allowed to live here.
    expect(workflow).toContain("publish_pin_verdict: ${{ steps.publish_pin.outputs.verdict }}");
    // ONE declared fact, and the declaring step must run `always()` — without
    // it a prior failure skips the step, the output is absent, and absent is
    // what pages. That is the design, not a fallback.
    expect(workflow).toContain(
      "release_withheld: ${{ steps.withhold_decl.outputs.release_withheld }}"
    );
    expect(workflow).toContain("id: withhold_decl");
    expect(workflow).not.toContain("push_failed:");
    expect(workflow).not.toContain("push_commit_conclusion:");
    expect(workflow).not.toContain("release_refused:");
  });

  it("every state maps to a withhold decision — no state falls through", () => {
    // A `switch` that gained a state and not a case would return undefined here,
    // and `withhold: undefined` is falsy, so it would PUBLISH.
    for (const state of [
      "RELEASE_PIN_CURRENT",
      "RELEASE_PIN_BEHIND",
      "RELEASE_PIN_UNCHECKED"
    ] as const) {
      expect(typeof gateOutputs(state).withhold).toBe("boolean");
      expect(gateOutputs(state).verdict).toBeTruthy();
    }
  });
});
