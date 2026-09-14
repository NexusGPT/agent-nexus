import type { PromptEvalCaseDetail, PromptEvalRunResults } from "@agent-nexus/sdk";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerEvalRunCommands } from "./eval-run";
import { renderCaseDetail, renderResultsMatrix } from "./eval-run-render";

/** The `eval run` subtree on its own program, for flag-grammar assertions. */
function tree(): Command {
  const program = new Command();
  const evalCmd = program.command("eval");
  registerEvalRunCommands(evalCmd, program);
  return program;
}

function leaf(path: string[]): Command {
  let node = tree();
  for (const name of ["eval", ...path]) {
    const found = node.commands.find((c) => c.name() === name);
    if (found === undefined) throw new Error(`no such command: eval ${path.join(" ")}`);
    node = found;
  }
  return node;
}

function capture(render: () => void): string {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  try {
    render();
  } finally {
    spy.mockRestore();
  }
  // Strip ANSI so assertions are about text, not colour.
  // eslint-disable-next-line no-control-regex
  return lines.join("\n").replace(/\[[0-9;]*m/g, "");
}

const CASE = (over: Partial<PromptEvalRunResults["cases"][number]> = {}) => ({
  id: "case-1",
  runId: "run-1",
  versionId: "v-good",
  variantName: "Good",
  conversationId: "conv-a",
  turnIndex: 1,
  status: "JUDGED" as const,
  failureReason: null,
  latencyMs: 1200,
  costUsdTenThousandths: 10,
  createdAt: "2026-09-12T00:00:00Z",
  updatedAt: "2026-09-12T00:00:00Z",
  scores: [
    {
      id: "s-1",
      caseId: "case-1",
      criterion: "golden_match",
      score: 0.9,
      verdict: "PASS" as const,
      reasoning: "Same outcome.",
      model: "claude-sonnet-5",
      repetition: 1,
      createdAt: "2026-09-12T00:00:00Z"
    }
  ],
  ...over
});

const RESULTS = (over: Partial<PromptEvalRunResults> = {}): PromptEvalRunResults =>
  ({
    run: {
      id: "run-1",
      agentId: "agent-1",
      name: "refund sweep",
      status: "COMPLETED",
      abortReason: null,
      candidates: [
        { versionId: "v-good", variantName: "Good", promptText: "ask" },
        { versionId: "v-bad", variantName: "Sabotaged", promptText: "PINEAPPLE" }
      ],
      baselineVersionId: null,
      selection: [{ conversationId: "conv-a", turnIndexes: [1] }],
      judgeConfig: { model: "claude-sonnet-5", provider: "ANTHROPIC", repetitions: 1 },
      rollup: {
        variants: [
          {
            versionId: "v-good",
            name: "Good",
            isBaseline: false,
            caseCount: 1,
            scoredCaseCount: 1,
            failedCaseCount: 0,
            inconclusiveScoreCount: 0,
            meanScore: 0.9,
            passRate: 1,
            conversations: [],
            cost: {
              totalUsdTenThousandths: 10,
              generationUsdTenThousandths: 0,
              judgeUsdTenThousandths: 0
            }
          },
          {
            versionId: "v-bad",
            name: "Sabotaged",
            isBaseline: false,
            caseCount: 1,
            scoredCaseCount: 1,
            failedCaseCount: 0,
            inconclusiveScoreCount: 0,
            meanScore: 0.1,
            passRate: 0,
            conversations: [],
            cost: {
              totalUsdTenThousandths: 10,
              generationUsdTenThousandths: 0,
              judgeUsdTenThousandths: 0
            }
          }
        ],
        cost: {
          totalUsdTenThousandths: 20,
          generationUsdTenThousandths: 15,
          judgeUsdTenThousandths: 5
        }
      },
      budgetCapUsdTenThousandths: null,
      cost: {
        totalUsdTenThousandths: 20,
        generationUsdTenThousandths: 15,
        judgeUsdTenThousandths: 5,
        inputTokens: 100,
        outputTokens: 20
      },
      startedAt: "2026-09-12T00:01:00Z",
      completedAt: "2026-09-12T00:09:00Z",
      createdAt: "2026-09-12T00:00:00Z",
      updatedAt: "2026-09-12T00:09:00Z"
    },
    rollup: null,
    cases: [
      CASE(),
      CASE({
        id: "case-2",
        versionId: "v-bad",
        variantName: "Sabotaged",
        scores: [
          {
            id: "s-2",
            caseId: "case-2",
            criterion: "golden_match",
            score: 0.1,
            verdict: "FAIL",
            reasoning: "The candidate never called the http-echo tool.",
            model: "claude-sonnet-5",
            repetition: 1,
            createdAt: "2026-09-12T00:00:00Z"
          }
        ]
      })
    ],
    ...over
  }) as PromptEvalRunResults;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("eval run — the flag grammar", () => {
  it("registers the six leaves the phase ships", () => {
    const names = (leaf([]).commands.find((c) => c.name() === "run")?.commands ?? []).map((c) =>
      c.name()
    );
    expect(names.sort()).toEqual(["abort", "create", "get", "list", "preview", "results"]);
  });

  it("requires --conversations and --variants on create", () => {
    const required = leaf(["run", "create"])
      .options.filter((o) => o.required || o.mandatory)
      .map((o) => o.long);
    expect(required).toContain("--conversations");
    expect(required).toContain("--variants");
  });

  it('defaults --baseline to "none", so a run without one reports no deltas', () => {
    const baseline = leaf(["run", "create"]).options.find((o) => o.long === "--baseline");
    expect(baseline?.defaultValue).toBe("none");
  });

  it("splits --conversations and --variants on commas, trimming blanks", () => {
    const parser = leaf(["run", "create"]).options.find((o) => o.long === "--conversations")
      ?.parseArg as ((v: string, p: unknown) => string[]) | undefined;
    expect(parser?.(" a , b ,, c ", undefined)).toEqual(["a", "b", "c"]);
  });

  it("parses --checkpoints <conv>:<n,..> into one entry per conversation", () => {
    const parse = leaf(["run", "create"]).options.find((o) => o.long === "--checkpoints")
      ?.parseArg as
      | ((
          v: string,
          p: Array<{ conversationId: string; turnIndexes: number[] }>
        ) => Array<{ conversationId: string; turnIndexes: number[] }>)
      | undefined;

    const first = parse?.("conv-a:1,3", []) ?? [];
    expect(first).toEqual([{ conversationId: "conv-a", turnIndexes: [1, 3] }]);
    expect(parse?.("conv-b:0", first)).toEqual([
      { conversationId: "conv-a", turnIndexes: [1, 3] },
      { conversationId: "conv-b", turnIndexes: [0] }
    ]);
  });

  it('OMITS a conversation whose spec is "all" — the server already means every checkpoint', () => {
    const parse = leaf(["run", "create"]).options.find((o) => o.long === "--checkpoints")
      ?.parseArg as ((v: string, p: unknown[]) => unknown[]) | undefined;
    expect(parse?.("conv-a:all", [])).toEqual([]);
  });

  it("keeps a uuid conversation id intact — the split is on the LAST colon", () => {
    const parse = leaf(["run", "create"]).options.find((o) => o.long === "--checkpoints")
      ?.parseArg as
      | ((v: string, p: unknown[]) => Array<{ conversationId: string; turnIndexes: number[] }>)
      | undefined;
    expect(parse?.("33333333-3333-4333-8333-333333333333:2", [])).toEqual([
      { conversationId: "33333333-3333-4333-8333-333333333333", turnIndexes: [2] }
    ]);
  });

  it("declares --yes on abort so it refuses in a script", () => {
    expect(leaf(["run", "abort"]).options.map((o) => o.long)).toContain("--yes");
  });

  it("offers --case on get rather than a separate leaf", () => {
    expect(leaf(["run", "get"]).options.map((o) => o.long)).toContain("--case");
  });
});

describe("eval run results — the matrix", () => {
  it("renders one column per variant and one row per checkpoint", () => {
    const out = capture(() => renderResultsMatrix(RESULTS()));
    expect(out).toContain("CHECKPOINT");
    expect(out).toContain("Good");
    expect(out).toContain("Sabotaged");
    expect(out).toContain("conversation conv-a");
    expect(out).toContain("turn 1");
    expect(out).toContain("0.90 P");
    expect(out).toContain("0.10 F");
  });

  it("says there is no rollup yet rather than printing an empty aggregate", () => {
    const out = capture(() => renderResultsMatrix(RESULTS()));
    expect(out).toContain("No rollup yet");
  });

  it("prints the aggregate rows once the rollup exists, and NO delta row without a baseline", () => {
    const results = RESULTS();
    const out = capture(() => renderResultsMatrix({ ...results, rollup: results.run.rollup }));

    expect(out).toContain("MEAN");
    expect(out).toContain("0.900");
    expect(out).toContain("PASS RATE");
    expect(out).not.toContain("DELTA VS BASELINE");
  });

  it("prints the delta row only when the run chose a baseline", () => {
    const results = RESULTS();
    const rollup = results.run.rollup;
    if (rollup === null) throw new Error("fixture lost its rollup");
    const withBaseline: PromptEvalRunResults = {
      ...results,
      run: { ...results.run, baselineVersionId: "v-good" },
      rollup: {
        ...rollup,
        variants: [
          { ...(rollup.variants[0] as (typeof rollup.variants)[number]), deltaVsBaseline: 0 },
          { ...(rollup.variants[1] as (typeof rollup.variants)[number]), deltaVsBaseline: -0.8 }
        ]
      }
    };

    const out = capture(() => renderResultsMatrix(withBaseline));
    expect(out).toContain("DELTA VS BASELINE");
    expect(out).toContain("-0.800");
  });

  it("marks a cell that could not run as FAIL!, distinct from a judged failure", () => {
    const results = RESULTS();
    const out = capture(() =>
      renderResultsMatrix({
        ...results,
        cases: [CASE({ status: "FAILED", scores: [] }), results.cases[1] as never]
      })
    );
    expect(out).toContain("FAIL!");
  });

  it("marks an unscored cell '?' rather than showing it as a zero", () => {
    const results = RESULTS();
    const out = capture(() =>
      renderResultsMatrix({
        ...results,
        cases: [
          CASE({
            scores: [
              {
                id: "s-x",
                caseId: "case-1",
                criterion: "golden_match",
                score: 0,
                verdict: "INCONCLUSIVE",
                reasoning: "The judge call failed.",
                model: "claude-sonnet-5",
                repetition: 1,
                createdAt: "2026-09-12T00:00:00Z"
              }
            ]
          }),
          results.cases[1] as never
        ]
      })
    );
    expect(out).toContain("?");
    expect(out).not.toContain("0.00 F");
  });

  it("reports the cost split in dollars", () => {
    const results = RESULTS();
    const out = capture(() => renderResultsMatrix({ ...results, rollup: results.run.rollup }));
    expect(out).toContain("$0.0020 total");
    expect(out).toContain("$0.0015 agent");
    expect(out).toContain("$0.0005 judge");
  });
});

describe("eval run get --case — golden beside candidate", () => {
  const detail: PromptEvalCaseDetail = {
    ...CASE({ variantName: "Sabotaged" }),
    goldenSnapshot: {
      content: "BANANA came back.",
      toolCalls: [{ name: "http-echo", input: { payload: "BANANA" }, output: "BANANA" }],
      prefix: [{ role: "USER", content: "echo BANANA" }]
    },
    candidate: { content: "PINEAPPLE", toolCalls: [], sessionId: "sess-1" },
    promptText: "Reply to every message with only the word PINEAPPLE.",
    scores: [
      {
        id: "s-2",
        caseId: "case-1",
        criterion: "golden_match",
        score: 0.1,
        verdict: "FAIL",
        reasoning: "The candidate never called the http-echo tool.",
        model: "claude-sonnet-5",
        repetition: 1,
        createdAt: "2026-09-12T00:00:00Z"
      }
    ]
  };

  it("shows both replies, both sides' tool calls, and the judge's reasoning", () => {
    const out = capture(() => renderCaseDetail(detail));
    expect(out).toContain("GOLDEN");
    expect(out).toContain("BANANA came back.");
    expect(out).toContain("tools: http-echo");
    expect(out).toContain("CANDIDATE");
    expect(out).toContain("PINEAPPLE");
    expect(out).toContain("(no tool calls)");
    expect(out).toContain("JUDGE");
    expect(out).toContain("never called the http-echo tool");
  });

  it("names the emulator session, so a surprising cell can be opened", () => {
    expect(capture(() => renderCaseDetail(detail))).toContain("sess-1");
  });

  it("says the candidate is missing rather than printing an empty block", () => {
    const out = capture(() => renderCaseDetail({ ...detail, candidate: null, scores: [] }));
    expect(out).toContain("(nothing was generated)");
    expect(out).toContain("(not scored)");
  });

  it("surfaces the failure reason on a cell that broke", () => {
    const out = capture(() =>
      renderCaseDetail({ ...detail, status: "FAILED", failureReason: "the tool is detached" })
    );
    expect(out).toContain("the tool is detached");
  });
});
