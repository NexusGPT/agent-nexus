import type { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `--overwrite` ANSWERS THE PROFILE-OVERWRITE PROMPT, SO A SCRIPT CAN RE-LOGIN.
 *
 * `nexus auth login --api-key nxs_… --profile <existing>` had no way to consent
 * in the invocation, so the one remaining question — `Profile "x" already
 * exists. Overwrite? [y/N]` — was unanswerable from a script. Since the login
 * prompts began refusing rather than hanging it is blocked by a refusal instead
 * of a hang, which is better and still blocked.
 *
 * ── THE HAYSTACK IS THE `ask` CALL LOG, AND THAT IS DELIBERATE ───────────────
 *
 * Every arm below asserts over the list of questions the fake `ask` was handed.
 * That sidesteps the trap `login-prompts-are-never-invisible.test.ts` measured:
 * vitest substitutes its own `console`, so a `console.log` never reaches a
 * `process.stdout.write` spy and an absence arm phrased over a stream capture is
 * satisfied by a haystack that could never have held the string. `ask` is what
 * `resolveProfileName` actually calls, so the capture is the thing under test —
 * and the first CONTROL below proves that capture really does hold the question
 * when the flag is absent, which is what gives the absence arms their meaning.
 *
 * ── UNANSWERED QUESTIONS HANG ON PURPOSE, AND THE DEADLINE NAMES IT ─────────
 *
 * `askingFake` returns a promise that never settles for any question it has no
 * answer for. So an implementation that ignores `--overwrite` asks, waits
 * forever, and is reported by {@link withinDeadline} as a named failure instead
 * of hanging the suite. The second CONTROL proves that deadline fires at all —
 * without it, "resolved in time" and "the deadline is broken" are one green.
 *
 * Presence and absence live in SEPARATE `it` blocks throughout: a failing
 * assertion throws and aborts the rest of its own block, so an absence claim
 * written below a presence claim is never evaluated once the presence one reds.
 */

const existing = vi.hoisted(() => ({ names: new Set<string>() }));

vi.mock("../../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config")>();
  return {
    ...actual,
    getProfile: (name: string) =>
      existing.names.has(name) ? { apiKey: "nxs_old", orgName: "Acme" } : undefined
  };
});

/**
 * `runLogin`'s network-facing steps, stubbed so the THREADING arm can run
 * offline. The overwrite decision itself is the REAL `resolveProfileName`:
 * stubbing that would assert on a mock and could not see the field being
 * dropped between the command and the decision, which is the gap this arm is
 * here to close.
 */
const saved = vi.hoisted(() => ({ names: [] as string[] }));

vi.mock("./login.resolve-key", () => ({
  resolveApiKey: async () => ({
    apiKey: "nxs_new",
    isPersonalToken: false,
    isPlatformOperatorKey: false
  })
}));

vi.mock("./login.resolve-org-scoped", () => ({
  resolveOrgScopedIdentity: async () => ({
    orgName: "Acme",
    orgId: "org_1",
    userEmail: "operator@example.com"
  })
}));

vi.mock("./login.save", () => ({
  saveLoginProfile: (input: { profileName: string }) => {
    saved.names.push(input.profileName);
  }
}));

vi.mock("./login.tips", () => ({ printLoginTips: () => undefined }));

import { isConfirmable } from "../../util/confirm";
import { destructiveCandidates, everyCommand } from "../../util/destructive-confirmation.scan";
import { buildCommandTree } from "../../util/global-option-shadowing";
import { resolveLoginOptions } from "./login.resolve-options";
import { resolveProfileName } from "./login.resolve-profile-name";
import { runLogin } from "./login.run";

const DEADLINE_MS = 2_000;

/** The substring that identifies the overwrite question, and nothing else. */
const OVERWRITE_QUESTION = "already exists. Overwrite?";

/** Bound the wait, so an ignored flag arrives as a named failure, not silence. */
async function withinDeadline<T>(label: string, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} did not settle within ${DEADLINE_MS}ms — it is blocked on an overwrite ` +
              `question that --overwrite should already have answered.`
          )
        ),
      DEADLINE_MS
    );
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * An `ask` that records every question and answers only the ones named.
 *
 * Anything unnamed NEVER SETTLES, which is what makes an ignored `--overwrite`
 * a deadline failure rather than a silent pass on some default answer.
 */
function askingFake(answers: Readonly<Record<string, string>>): {
  ask: (question: string) => Promise<string>;
  asked: string[];
} {
  const asked: string[] = [];
  const ask = (question: string): Promise<string> => {
    asked.push(question);
    const key = Object.keys(answers).find((candidate) => question.includes(candidate));
    if (key === undefined) return new Promise<string>(() => undefined);
    return Promise.resolve(answers[key] as string);
  };
  return { ask, asked };
}

describe("--overwrite answers the profile-overwrite prompt", () => {
  const exitCodeWas = process.exitCode;

  beforeEach(() => {
    existing.names = new Set(["work"]);
    saved.names = [];
  });

  afterEach(() => {
    process.exitCode = exitCodeWas;
  });

  it("CONTROL: without the flag an existing profile IS asked about", async () => {
    // This is what makes every absence arm below mean something: the capture
    // demonstrably holds the question when nothing suppresses it.
    const { ask, asked } = askingFake({ [OVERWRITE_QUESTION]: "y" });

    const name = await withinDeadline(
      "the control",
      resolveProfileName({ ask, provided: "work", orgName: "Acme", overwrite: undefined })
    );

    expect(asked.join("\n")).toContain(OVERWRITE_QUESTION);
    expect(name).toBe("work");
  });

  it("CONTROL: the deadline itself fires on a question that never settles", async () => {
    // Without this arm, an implementation that resolved for the wrong reason and
    // a deadline that never fires are the same green.
    await expect(
      withinDeadline("the deadline control", new Promise<string>(() => undefined))
    ).rejects.toThrow(/did not settle within 2000ms/);
  });

  it("asks NO overwrite question when --overwrite is passed", async () => {
    // 🔴 THE FAKE ANSWERS THIS QUESTION ON PURPOSE, SO THE KILL IS ATTRIBUTABLE.
    // With a fake that HANGS on it, an implementation ignoring the flag reds this
    // block on the DEADLINE — which proves the deadline is live and says nothing
    // about the assertion below ever being evaluated. Answering it means the call
    // completes and the absence claim is reached and FAILS on its own terms.
    // Measured: mutant M1 reds this on the `toContain`, not on the deadline.
    const { ask, asked } = askingFake({ [OVERWRITE_QUESTION]: "y" });

    await withinDeadline(
      "the overwrite arm",
      resolveProfileName({ ask, provided: "work", orgName: "Acme", overwrite: true })
    );

    expect(asked.join("\n")).not.toContain(OVERWRITE_QUESTION);
  });

  it("PROCEEDS with the profile name when --overwrite is passed", async () => {
    // This one keeps the HANGING fake, so the two arms carry different kill
    // modes: the absence arm above fails on its assertion, this one on the
    // 2,000 ms deadline, and a mutant that only produced one of the two would
    // be visible as a single kill rather than a pair.
    const { ask } = askingFake({});

    const name = await withinDeadline(
      "the overwrite arm",
      resolveProfileName({ ask, provided: "work", orgName: "Acme", overwrite: true })
    );

    expect(name).toBe("work");
  });

  it("still aborts on anything but y when the flag is absent", async () => {
    const { ask } = askingFake({ [OVERWRITE_QUESTION]: "n" });

    const name = await withinDeadline(
      "the abort arm",
      resolveProfileName({ ask, provided: "work", orgName: "Acme", overwrite: undefined })
    );

    expect(name).toBeNull();
  });

  it("asks nothing about a profile that does not exist yet, flag or no flag", async () => {
    // Guards the condition against being inverted into one that asks only WITH
    // the flag: a fresh name has nothing to overwrite in either tree.
    existing.names = new Set();
    const { ask, asked } = askingFake({});

    const name = await withinDeadline(
      "the fresh-profile arm",
      resolveProfileName({ ask, provided: "brand-new", orgName: "Acme", overwrite: undefined })
    );

    expect(asked.join("\n")).not.toContain(OVERWRITE_QUESTION);
    expect(name).toBe("brand-new");
  });
});

describe("the flag reaches the decision from the command", () => {
  beforeEach(() => {
    existing.names = new Set(["work"]);
    saved.names = [];
  });

  it("runLogin threads --overwrite through to the overwrite decision", async () => {
    // THE ARM THAT CLOSES THE THREADING GAP. Declaring the option and honouring
    // it in `resolveProfileName` can both be right while `login.run.ts` drops
    // the field in between — and nothing else in this file would notice, because
    // every other arm calls `resolveProfileName` directly.
    const { ask } = askingFake({});

    await withinDeadline(
      "runLogin with --overwrite",
      runLogin({
        ask,
        effective: { apiKey: "nxs_new", profile: "work", overwrite: true },
        baseUrl: undefined,
        dashboardUrl: undefined,
        resolvedBaseUrl: "https://api.example.com"
      })
    );

    expect(saved.names).toEqual(["work"]);
  });

  it("auth login declares --overwrite on the live command tree", () => {
    const leaf = everyCommand(buildCommandTree()).find(([path]) => path === "auth login");

    expect(leaf, "auth login is not in the command tree").toBeDefined();
    expect(leaf?.[1].options.map((option) => option.long)).toContain("--overwrite");
  });

  it("resolveLoginOptions carries --overwrite onto the merged options", () => {
    // THE LAST UNCOVERED HOP, and typecheck cannot see it: `effective` is built
    // by spreading and every field of `LoginOptions` is optional, so a rewrite
    // that stopped carrying `overwrite` would read `undefined` at runtime and
    // still compile. Over the REAL leaf out of the live tree, not a hand-built
    // replica of the command under test.
    const leaf = everyCommand(buildCommandTree()).find(([path]) => path === "auth login");

    expect(leaf, "auth login is not in the command tree").toBeDefined();
    if (leaf === undefined) return;

    leaf[1].setOptionValue("overwrite", true);

    expect(resolveLoginOptions(leaf[1], leaf[1].opts()).effective.overwrite).toBe(true);
  });
});

describe("the consent flag is --overwrite, never --yes", () => {
  /**
   * THE ARM THAT PINS THE DESIGN DECISION, and the reason it is worth an arm:
   * `--yes` is the spelling a later reader will reach for, it compiles, and the
   * cost is paid in a different file. `destructiveCandidates()` unions the
   * destructive-verb leaves with every leaf declaring an option whose `long` is
   * `--yes`, so that edit silently makes `auth login` a destructive candidate
   * the partition cannot account for honestly — the header of
   * `login.resolve-profile-name.ts` walks all three sets.
   */
  /**
   * ⚠️ ONE PROPERTY PER BLOCK, and that is a MEASUREMENT rather than a style
   * choice. These three stood in a single `it`. A failing assertion throws and
   * aborts the rest of its own block, so when the `--yes` mutant red the first
   * one, `isConfirmable` and `destructiveCandidates` never executed — they were
   * neither passed nor failed, and the battery scored the block as one kill.
   * `core/vacuous-assertions.md`'s fourth form, measured here: the mutant's own
   * output named line 295 and nothing below it. Split, each property is scored
   * on its own, and the `--yes` mutant reds two of the three while leaving
   * `isConfirmable` green — which is the honest answer, since a hand-rolled
   * `.option("--yes")` never reaches the WeakSet.
   */
  const authLogin = (): [string, Command] => {
    const leaf = everyCommand(buildCommandTree()).find(([path]) => path === "auth login");
    expect(leaf, "auth login is not in the command tree").toBeDefined();
    return leaf as [string, Command];
  };

  it("auth login declares no --yes", () => {
    expect(authLogin()[1].options.map((option) => option.long)).not.toContain("--yes");
  });

  it("auth login is not registered as confirmable", () => {
    // Only `confirmable()` writes that WeakSet, so this is the half a hand-rolled
    // `.option("--yes")` would NOT trip — it needs its own mutant.
    expect(isConfirmable(authLogin()[1])).toBe(false);
  });

  it("auth login is not a destructive candidate", () => {
    expect(destructiveCandidates(buildCommandTree())).not.toContain("auth login");
  });

  it("CONTROL: that candidate derivation does find the leaves that DO declare --yes", () => {
    // An empty or broken derivation would satisfy the `not.toContain` above
    // whatever this command declares.
    expect(destructiveCandidates(buildCommandTree())).toContain("phone-number buy");
  });
});
