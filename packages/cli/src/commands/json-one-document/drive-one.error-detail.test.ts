import { Command } from "commander";
import { beforeAll, describe, expect, it } from "vitest";

import type { DriveDeps } from "./drive-deps";
import { driveOne } from "./drive-one";
import type { LeafRun } from "./outcome";

/**
 * The detail a failed run is reported with must quote the stream that holds its
 * evidence.
 *
 * Driven through `driveOne` itself, over a program whose leaves each reproduce
 * one failure shape, so the arms read what the gate prints and not a helper in
 * isolation. One assertion per `it`: a failing arm aborts its block, and a
 * second arm below it would be scored by the first one's red.
 */

const MASKED_DOCUMENT = '{"id":"app_1","outcome":"unlisted"}';

function buildProgram(): Command {
  const program = new Command("nexus").option("--json");
  const leaf = (name: string, act: () => void): void => {
    program.command(name).action(act);
  };
  leaf("masked-quiet", () => {
    console.log(MASKED_DOCUMENT);
    process.exitCode = 11;
  });
  leaf("masked-noisy", () => {
    console.log(MASKED_DOCUMENT);
    console.error("unlisted outcome");
    process.exitCode = 11;
  });
  leaf("mute", () => {
    process.exitCode = 1;
  });
  leaf("prose-on-stdout", () => {
    console.log("Deleted.");
    process.exitCode = 1;
  });
  leaf("prose-on-stderr", () => {
    console.error("Error: --body is required.");
    process.exitCode = 1;
  });
  return program;
}

const deps: DriveDeps = {
  buildProgram,
  sandboxDir: "",
  requestCount: () => 0,
  resetRequests: () => {}
};

const runs = new Map<string, LeafRun>();
const run = (leaf: string): LeafRun => {
  const found = runs.get(leaf);
  if (found === undefined) throw new Error(`no run recorded for ${leaf}`);
  return found;
};

beforeAll(async () => {
  for (const leaf of [
    "masked-quiet",
    "masked-noisy",
    "mute",
    "prose-on-stdout",
    "prose-on-stderr"
  ]) {
    runs.set(leaf, await driveOne(leaf, leaf, [leaf], deps));
  }
});

describe("CONTROLS: each leaf lands in the outcome its arm is about", () => {
  it("a document on stdout with a failing exit and a quiet stderr is error-masked", () => {
    expect(run("masked-quiet").errorOutcome).toBe("error-masked");
  });
  it("the same with a line on stderr is still error-masked", () => {
    expect(run("masked-noisy").errorOutcome).toBe("error-masked");
  });
  it("a failure that writes nothing anywhere is error-mute", () => {
    expect(run("mute").errorOutcome).toBe("error-mute");
  });
  it("prose on stdout during a failure is error-prose", () => {
    expect(run("prose-on-stdout").errorOutcome).toBe("error-prose");
  });
  it("prose on stderr with an empty stdout is error-prose", () => {
    expect(run("prose-on-stderr").errorOutcome).toBe("error-prose");
  });
});

describe("the error detail names the stream that holds the evidence", () => {
  it("error-masked with an empty stderr names the stdout document", () => {
    expect(run("masked-quiet").errorDetail).toBe(
      `stdout held a non-error document: ${MASKED_DOCUMENT}`
    );
  });
  it("error-masked with a stderr line names the document AND the line", () => {
    expect(run("masked-noisy").errorDetail).toBe(
      `stdout held a non-error document: ${MASKED_DOCUMENT} | stderr: unlisted outcome`
    );
  });
  it("error-mute, and only error-mute, reports nothing on either stream", () => {
    expect(run("mute").errorDetail).toBe("(nothing on either stream)");
  });
  it("error-prose with an empty stderr quotes the prose stdout held", () => {
    expect(run("prose-on-stdout").errorDetail).toBe("nothing on stderr; stdout held: Deleted.");
  });
  it("error-prose with a stderr line quotes that line", () => {
    expect(run("prose-on-stderr").errorDetail).toBe("Error: --body is required.");
  });
});
