import { Command, InvalidArgumentError } from "commander";
import { describe, expect, it } from "vitest";

import { parseFeedbackScore } from "./feedback-score";

/**
 * THE REGRESSION THIS FILE EXISTS FOR IS THE FRACTIONAL CASE, AND IT IS SILENT.
 *
 * `parseInt` refuses nothing: it reads `0.5` as `0` and hands the action a
 * number the caller never asked for. So a test that only checks that `5` is
 * refused would pass against the defective parser as well — `parseInt("5")` is
 * `5`, the route 400s, and the visible behaviour is identical. The case that
 * separates the two implementations is `0.5` SURVIVING as `0.5`.
 */
describe("parseFeedbackScore", () => {
  it("keeps a fractional score instead of truncating it to zero", () => {
    expect(parseFeedbackScore("0.5")).toBe(0.5);
    expect(parseFeedbackScore("0.7")).toBe(0.7);

    // The control: the old binding is what this asserts against.
    expect(parseInt("0.5")).toBe(0);
  });

  it("takes both ends of the contract's range", () => {
    expect(parseFeedbackScore("0")).toBe(0);
    expect(parseFeedbackScore("1")).toBe(1);
    expect(parseFeedbackScore(" 1 ")).toBe(1);
  });

  it("refuses a 1-to-5 score before a request is built", () => {
    expect(() => parseFeedbackScore("5")).toThrow(InvalidArgumentError);
    expect(() => parseFeedbackScore("-1")).toThrow(InvalidArgumentError);
    expect(() => parseFeedbackScore("1.01")).toThrow(InvalidArgumentError);
  });

  it("refuses a value that is not a number at all", () => {
    expect(() => parseFeedbackScore("good")).toThrow(InvalidArgumentError);
    expect(() => parseFeedbackScore("")).toThrow(InvalidArgumentError);
  });

  /**
   * Bound to a real commander option, because a parser that throws the right
   * error and is never wired reads exactly like one that works.
   */
  it("reaches the action through commander, fraction intact", () => {
    let seen: unknown;
    const program = new Command();
    program.exitOverride();
    program
      .command("feedback")
      .option("--score <number>", "Filter by score", parseFeedbackScore)
      .action((opts: { score?: number }) => {
        seen = opts.score;
      });

    program.parse(["node", "t", "feedback", "--score", "0.5"]);
    expect(seen).toBe(0.5);

    expect(() => program.parse(["node", "t", "feedback", "--score", "5"])).toThrow();
  });
});
