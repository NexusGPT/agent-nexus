import { describe, expect, it } from "vitest";

import {
  INSTALL_POLICIES,
  type InstallDecision,
  installDecision,
  type InstallPolicy,
  policyFrom
} from "./install-policy";

describe("install policy — the flag pair narrowed once, then one decision", () => {
  it("maps commander's tri-state: true → install, false → never, undefined → ask", () => {
    expect(policyFrom(true)).toBe("install");
    expect(policyFrom(false)).toBe("never");
    expect(policyFrom(undefined)).toBe("ask");
  });

  it.each([
    ["install", true, { kind: "run" }],
    ["install", false, { kind: "run" }],
    ["never", true, { kind: "refuse", because: "never" }],
    ["never", false, { kind: "refuse", because: "never" }],
    ["ask", true, { kind: "ask" }],
    ["ask", false, { kind: "refuse", because: "no-tty" }]
    // The second column is `canAsk` — BOTH halves of the conversation, never
    // `stdin.isTTY`. A terminal with both outputs redirected is `false` here and
    // `true` on a stdin test, and that row is the hang this gate now refuses.
    // The callback's parameter annotations are the column-order guard: leave
    // them inferred and a reordered table still compiles.
  ] as const)(
    "policy %s, a conversation is possible: %s → %j",
    (policy: InstallPolicy, canAsk: boolean, decision: InstallDecision) => {
      expect(installDecision(policy, canAsk)).toEqual(decision);
    }
  );

  it("covers every policy the union declares — the table above is the whole space", () => {
    // Six rows: three policies × two conversation states. A fourth policy would
    // redden `installDecision` at compile time (satisfies never) and this count.
    expect(INSTALL_POLICIES).toHaveLength(3);
  });

  it("nowhere to ask never proceeds: only an explicit --install-deps runs without a person", () => {
    for (const policy of INSTALL_POLICIES) {
      const decision = installDecision(policy, false);
      expect(decision.kind === "run").toBe(policy === "install");
    }
  });
});
