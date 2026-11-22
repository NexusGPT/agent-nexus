import { beforeEach, describe, expect, it, vi } from "vitest";

// The install itself is faked: this spec pins the QUESTION and what happens
// when it cannot be put, never the installers.
const runInstallPlan = vi.hoisted(() => vi.fn());
vi.mock("./install/run-install-plan", () => ({ runInstallPlan }));

import type { DepsIo } from "../../workspace-direct-mount/deps-io";
import { installPlanFor } from "../../workspace-direct-mount/install/install-plan";
import { installDecision } from "../../workspace-direct-mount/install/install-policy";
import { rcloneReadiness } from "./rclone-readiness";

/**
 * THE MOUNT'S INSTALL QUESTION GATES ON `DepsIo.canAsk`, AND THE SEAM CARRIES
 * TWO BOOLEANS BECAUSE IT ASKS TWO DIFFERENT QUESTIONS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `nexus workspace-mount … >out.log 2>err.log`, TYPED AT A REAL KEYBOARD.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * stdin is still a terminal, so a gate on `io.stdinIsTTY` reached
 * `askAndInstall`, which wrote `Install it now? [y/N]` through `promptStream()`
 * into err.log. The terminal showed nothing and the mount blocked on a keystroke
 * nobody was asked for — after printing a multi-line install offer into the same
 * file. `io.canAsk` is both halves of the conversation, so the question is
 * unreachable in exactly the case where it would be invisible, and the mount
 * refuses with the manual commands instead.
 *
 * ── WHY THIS SEAM HAS TWO FLAGS AND NOT ONE WIDENED ONE ─────────────────────
 *
 * 🚨 WIDENING `stdinIsTTY` TO MEAN "CAN WE ASK" IS NOT A HANG FIX — IT IS A
 *    BEHAVIOUR CHANGE IN THE INSTALLER, AND THE ARMS BELOW PRICE IT.
 *
 * `rcloneReadiness` passes `stdinIsTTY` to `installPlanFor` as `host.terminal`,
 * where it decides WHERE THE ADMINISTRATOR PASSWORD IS ASKED FOR: `sudo` on the
 * terminal (`fuse-t-cask` via brew, or `fuse-t-pkg` with `password: "terminal"`)
 * against macOS's own password WINDOW (`password: "dialog"`). `sudo` reads and
 * writes `/dev/tty`, so redirecting THIS process's stdout takes nothing away
 * from it.
 *
 * So one flag would reroute a real install step on every redirected mount typed
 * at a keyboard: a working `brew install` + sudo prompt swapped for a downloaded
 * pkg behind a GUI dialog. Two questions, two fields, and the arm named
 * "still plans for a terminal" is what refuses the merge.
 *
 * ── WHY A SECOND CONSUMER MAKES THE SEAM THE RIGHT PLACE ────────────────────
 *
 * `rclone-readiness.ts` is not the only route to this question: `io.askYesNo` is
 * reached through `askAndInstall`, and the same `installDecision` guards it for
 * every caller of `rcloneReadiness`. Fixing the seam fixes them together, which
 * a per-call-site patch would not.
 */

const OFFICIAL = "rclone v1.74.4\n- go/tags: cmount\n";

interface Machine {
  /** A terminal on stdin — what `sudo` needs. Default: yes. */
  readonly stdinIsTTY?: boolean;
  /** A conversation this process can hold — what a QUESTION needs. Default: yes. */
  readonly canAsk?: boolean;
  /** What `io.askYesNo` resolves with, when it is reached at all. */
  readonly answer?: boolean | "never";
}

/**
 * A Mac with rclone present and NO FUSE library, so the preflight always has a
 * problem and the run always reaches the decision under test. `hasBrew` is true,
 * which is what makes the terminal/no-terminal plans differ observably.
 */
function machine(m: Machine = {}) {
  const present = new Set<string>();
  const printed: string[] = [];
  const asked: string[] = [];
  const io: DepsIo = {
    platform: "darwin",
    arch: "arm64",
    env: {},
    stdinIsTTY: m.stdinIsTTY ?? true,
    canAsk: m.canAsk ?? true,
    exists: (file) => present.has(file),
    // rclone itself is always present and mount-capable here, whichever copy is
    // probed: the FUSE library is the only problem, so every run reaches the
    // decision under test instead of being refused earlier for a missing rclone.
    rcloneVersion: () => OFFICIAL,
    macFuseApproved: () => true,
    winFspInstallDir: () => "unknown",
    hasBrew: () => true,
    download: vi.fn(),
    run: vi.fn(),
    askYesNo: async (question) => {
      asked.push(question);
      // A question nobody saw never settles. This is the real behaviour, not a
      // stand-in for it: the defect is that nothing ever arrives.
      if (m.answer === "never") return new Promise<boolean>(() => undefined);
      return m.answer ?? false;
    },
    promptLine: (text) => {
      printed.push(text);
    }
  };
  runInstallPlan.mockReset();
  runInstallPlan.mockImplementation(async () => undefined);
  return { io, printed, asked };
}

const DEADLINE_MS = 2_000;

/**
 * A hang is worse than a red — no assertion to read, no failure to name — so
 * every arm that could reach an unanswerable question is bounded and fails by
 * name instead of taking the suite to the runner's timeout.
 */
async function withinDeadline<T>(label: string, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} did not settle within ${DEADLINE_MS}ms — it is blocked on a keystroke ` +
              `for a question written to a redirected stream, which is the hang this file refuses.`
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

beforeEach(() => {
  runInstallPlan.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLS. Every assertion below them is "it did not ask" or "it refused", and
// a harness that can never reach the question produces both for free.
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTROLS — the question is reachable, and the deadline can fire", () => {
  it("CONTROL: with a conversation available the question IS put", async () => {
    const { io, asked } = machine({ canAsk: true, answer: false });

    await withinDeadline("rcloneReadiness", rcloneReadiness("auto", "ask", { io }));

    expect(asked).toEqual(["Install it now?"]);
  });

  it("CONTROL: the deadline FIRES on a question that never settles", async () => {
    // Without this, a deadline that could never reject would make the bounded
    // arms below green on a tree that hangs. Reachable here precisely because
    // `canAsk` is true, so the ask is legitimate and the silence is the
    // operator's rather than the stream's.
    const { io } = machine({ canAsk: true, answer: "never" });

    await expect(
      withinDeadline("rcloneReadiness", rcloneReadiness("auto", "ask", { io }))
    ).rejects.toThrow(/did not settle within 2000ms/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE DEFECT. One property per `it`: a failing assertion throws and aborts the
// rest of its own block, so "refused" and "never asked" under one `it` would be
// scored on whichever a mutant reaches first — and "never asked" is satisfied
// for free by any refusal, which is the arm that must be able to fail alone.
// ─────────────────────────────────────────────────────────────────────────────

describe("a terminal on stdin with no readable output: refuses, never blocks", () => {
  it("REFUSES instead of blocking on a keystroke nobody was asked for", async () => {
    const { io } = machine({ stdinIsTTY: true, canAsk: false, answer: "never" });

    const readiness = await withinDeadline(
      "rcloneReadiness",
      rcloneReadiness("auto", "ask", { io })
    );

    expect(readiness.ok).toBe(false);
  });

  it("never puts the question at all, because nobody could have read it", async () => {
    const { io, asked } = machine({ stdinIsTTY: true, canAsk: false, answer: "never" });

    await withinDeadline("rcloneReadiness", rcloneReadiness("auto", "ask", { io }));

    // Its positive twin is the first CONTROL above, over this same recorder,
    // which REQUIRES the question — so an empty list here cannot be satisfied
    // by a seam the spec never reaches.
    expect(asked).toEqual([]);
  });

  it("names the manual remedy, so the refusal is actionable from the log file", async () => {
    const { io, printed } = machine({ stdinIsTTY: true, canAsk: false, answer: "never" });

    const readiness = await withinDeadline(
      "rcloneReadiness",
      rcloneReadiness("auto", "ask", { io })
    );

    // The PRESENT half that the absence above is read against: this run
    // demonstrably produced output.
    expect(printed.join("\n")).toContain("The CLI can install what is missing");
    const refusal = readiness.ok ? "" : readiness.refusal.message + readiness.refusal.hint;
    expect(refusal).toContain("--install-deps");
  });

  it("runs no installer, so nothing is downloaded on an unanswered question", async () => {
    const { io } = machine({ stdinIsTTY: true, canAsk: false, answer: "never" });

    await withinDeadline("rcloneReadiness", rcloneReadiness("auto", "ask", { io }));

    // `sudo` and a 30 MB download behind a question nobody saw is the outcome
    // the refusal exists to prevent, and it is not implied by `ok: false`.
    expect(runInstallPlan).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE PRICE OF ONE FLAG. These are the arms that refuse the "just widen
// stdinIsTTY" merge, and they fail on exactly that change.
// ─────────────────────────────────────────────────────────────────────────────

describe("the seam's two booleans answer two different questions", () => {
  it("installDecision reads CAN-ASK: no conversation and no flag means refuse", () => {
    // Stated as the member it excludes rather than as class membership: `ask`
    // and `run` are both "did not refuse", and only `refuse`/`no-tty` is the
    // verdict this row pins.
    expect(installDecision("ask", false)).toEqual({ kind: "refuse", because: "no-tty" });
    expect(installDecision("ask", true)).toEqual({ kind: "ask" });
    // An explicit --install-deps is the one thing that proceeds with no person.
    expect(installDecision("install", false)).toEqual({ kind: "run" });
  });

  it("installPlanFor reads TERMINAL: it chooses where sudo asks, not whether we ask", () => {
    const host = { platform: "darwin", arch: "arm64", hasBrew: () => true } as const;
    const found = { rclone: null, fuse: { kind: "no-fuse-library" } } as const;

    // A terminal on stdin: brew, which runs `sudo installer` and prompts on the
    // user's own tty. No terminal: the pinned pkg behind the macOS dialog.
    expect(installPlanFor(found, { ...host, terminal: true })).toEqual({
      kind: "steps",
      steps: [{ kind: "fuse-t-cask" }]
    });
    expect(installPlanFor(found, { ...host, terminal: false })).toEqual({
      kind: "steps",
      steps: [{ kind: "fuse-t-pkg", password: "dialog" }]
    });
  });

  it("STILL PLANS FOR A TERMINAL when the outputs are redirected but stdin is a tty", async () => {
    // 🚨 THE ARM THAT REFUSES THE ONE-FLAG MERGE. `canAsk` is false, so no
    // question is put; `stdinIsTTY` is true, so `sudo` can still prompt, and the
    // offer printed for the operator to act on by hand must be the brew/sudo
    // plan. Widen `terminal:` to `io.canAsk` and this reds, naming the dialog
    // command it would have printed instead.
    const { io, printed } = machine({ stdinIsTTY: true, canAsk: false, answer: "never" });

    await withinDeadline("rcloneReadiness", rcloneReadiness("auto", "ask", { io }));

    const offer = printed.join("\n");
    expect(offer).toContain("brew install");
    // The dialog path's own command, asserted absent against a haystack the
    // line above proves carries the offer at all.
    expect(offer).not.toContain("macOS shows its password window");
  });

  it("plans for the DIALOG when there is genuinely no terminal on stdin", async () => {
    // The other side of the same distinction, so the arm above is a statement
    // about `stdinIsTTY` and not a constant.
    const { io, printed } = machine({ stdinIsTTY: false, canAsk: false });

    await withinDeadline("rcloneReadiness", rcloneReadiness("auto", "ask", { io }));

    const offer = printed.join("\n");
    expect(offer).toContain("macOS shows its password window");
    expect(offer).not.toContain("brew install");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE ROWS THAT DID NOT MOVE.
// ─────────────────────────────────────────────────────────────────────────────

describe("the unchanged rows", () => {
  it("--install-deps installs with no question, whatever the streams are", async () => {
    const { io, asked } = machine({ stdinIsTTY: true, canAsk: false, answer: "never" });

    await withinDeadline("rcloneReadiness", rcloneReadiness("auto", "install", { io }));

    expect(asked).toEqual([]);
    expect(runInstallPlan).toHaveBeenCalledTimes(1);
  });

  it("--no-install-deps refuses before a plan is built, and never asks", async () => {
    const { io, asked } = machine({ stdinIsTTY: true, canAsk: true, answer: "never" });

    const readiness = await withinDeadline(
      "rcloneReadiness",
      rcloneReadiness("auto", "never", { io })
    );

    expect(readiness.ok).toBe(false);
    expect(asked).toEqual([]);
  });

  it("an operator who answers n gets a refusal and no install", async () => {
    const { io, asked } = machine({ canAsk: true, answer: false });

    const readiness = await withinDeadline(
      "rcloneReadiness",
      rcloneReadiness("auto", "ask", { io })
    );

    expect(readiness.ok).toBe(false);
    // Paired with the refusal: the question WAS put, so this decline is the
    // operator's and not a gate returning early.
    expect(asked).toEqual(["Install it now?"]);
  });
});
