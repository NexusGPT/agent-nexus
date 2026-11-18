/**
 * THE THREE FACTS `mcp-server call`'s HELPERS ASSERT IN THEIR OWN HEADERS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The action body used to hold all of this inline, where every fact was reachable
 * only by driving the whole leaf — a client, a network double, `process.exitCode`.
 * Splitting it into `call-inputs.ts`, `call-body.ts` and `call-failure.ts` made each
 * fact a pure function, and a pure function with no arm is a header making a claim
 * nobody has watched fail.
 *
 * 🔴 ONE ARM PER `it`, deliberately. A failing assertion throws and aborts the rest
 * of its own block, so two arms in one `it` means a mutant that can reach both
 * scores exactly the first — and which one goes unscored is a property of the
 * MUTANT, not of the writing order, so no ordering convention fixes it.
 *
 * ⚠️ THE NEGATIVE ARMS ARE PAIRED ON PURPOSE. "The hint does not mention media
 * blocks" is satisfied by a hint that mentions nothing at all, so each one sits
 * beside a positive arm over the same string.
 */
import { describe, expect, it } from "vitest";

import { buildMcpCallBody } from "./call-body";
import { describeMcpCallFailure } from "./call-failure";
import { type McpCallInputs, resolveMcpCallInputs } from "./call-inputs";
import type { McpCallResult } from "./call-wire";

const INPUTS: McpCallInputs = { toolArguments: { q: "x" }, cardVariables: { region: "eu" } };

function resultWith(mediaBlockCount: number): McpCallResult {
  return {
    toolName: "search_issues",
    isError: true,
    text: "the upstream repository is archived",
    // `type` is NOT decoration. `McpCallResult` is derived off the shipping client, so
    // the compiler holds this fixture to the real block shape — it refused the
    // three-field version of this literal, which `vitest` had run green.
    mediaBlocks: Array.from({ length: mediaBlockCount }, () => ({
      type: "image" as const,
      data: "aGk=",
      mimeType: "image/png"
    }))
  };
}

describe("resolveMcpCallInputs", () => {
  it("reports --arguments when BOTH flags are malformed", () => {
    const resolved = resolveMcpCallInputs({ arguments: "[]", cardVariables: "[]" }, "srv-1");
    expect("reason" in resolved ? resolved.reason : "NO REFUSAL").toContain("--arguments");
  });

  it("…and does NOT report --card-variables in the same breath", () => {
    const resolved = resolveMcpCallInputs({ arguments: "[]", cardVariables: "[]" }, "srv-1");
    expect("reason" in resolved ? resolved.reason : "NO REFUSAL").not.toContain("--card-variables");
  });

  it("names the server in the --arguments hint, so the operator has a next command", () => {
    const resolved = resolveMcpCallInputs({ arguments: "not json" }, "srv-42");
    expect("hint" in resolved ? resolved.hint : "NO REFUSAL").toContain(
      "nexus mcp-server get srv-42"
    );
  });

  it("reaches --card-variables once --arguments is well formed", () => {
    const resolved = resolveMcpCallInputs({ arguments: "{}", cardVariables: "7" }, "srv-1");
    expect("reason" in resolved ? resolved.reason : "NO REFUSAL").toContain("--card-variables");
  });

  it("resolves both to {} when neither flag was passed", () => {
    expect(resolveMcpCallInputs({}, "srv-1")).toStrictEqual({
      toolArguments: {},
      cardVariables: {}
    });
  });
});

describe("buildMcpCallBody", () => {
  it("omits credentialId entirely when the flag is absent", () => {
    expect("credentialId" in buildMcpCallBody("t", {}, INPUTS)).toBe(false);
  });

  it("…and carries it when the flag is present", () => {
    expect(buildMcpCallBody("t", { credentialId: "cred-1" }, INPUTS).credentialId).toBe("cred-1");
  });

  it("writes expectedSchemaHash EVEN WHEN ABSENT — declining to pin is an act", () => {
    expect("expectedSchemaHash" in buildMcpCallBody("t", {}, INPUTS)).toBe(true);
  });

  it("keys cardVariableValues off the FLAG, so an explicitly empty object is still sent", () => {
    const body = buildMcpCallBody("t", { cardVariables: "{}" }, { ...INPUTS, cardVariables: {} });
    expect(body.cardVariableValues).toStrictEqual({});
  });

  it("…and omits the key when the flag was never passed", () => {
    expect("cardVariableValues" in buildMcpCallBody("t", {}, INPUTS)).toBe(false);
  });
});

describe("describeMcpCallFailure", () => {
  it("categorises the tool's own refusal as remote-error, never as the caller's bug", () => {
    expect(describeMcpCallFailure(resultWith(0)).cause).toBe("remote-error");
  });

  it("carries the tool's own text into the message, because that is the answer", () => {
    expect(describeMcpCallFailure(resultWith(0)).message).toContain(
      "the upstream repository is archived"
    );
  });

  it("names the dropped media blocks when there are some", () => {
    expect(describeMcpCallFailure(resultWith(3)).hint).toContain("3 media block(s) are dropped");
  });

  it("…and says nothing about media blocks when there are none", () => {
    expect(describeMcpCallFailure(resultWith(0)).hint).not.toContain("media block");
  });

  it("CONTROL for the arm above — that hint is non-empty, so the negative is not vacuous", () => {
    expect(describeMcpCallFailure(resultWith(0)).hint).toContain("the tool's own answer");
  });
});
