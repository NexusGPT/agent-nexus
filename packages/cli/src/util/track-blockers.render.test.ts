import { afterEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";
import { RECONSTRUCTION_CAVEAT, type WhyNotReadyReport } from "./track-blockers";
import { renderWhyNotReady } from "./track-blockers.render";

/**
 * THE CAVEAT HAS TO REACH THE READER, NOT ONLY THE MODULE THAT DEFINES IT.
 *
 * `RECONSTRUCTION_CAVEAT` being correct proves nothing about the output: a
 * rendering that never prints it turns a client-side derivation into "the
 * server's reason" in the one place a person actually reads. The JSON half
 * carries it as a field on the envelope, which `tracks.ts` builds; this file
 * covers the terminal half.
 */

const report: WhyNotReadyReport = {
  unready: [
    {
      id: "leaf",
      title: "Extract the lifecycle skeleton",
      kind: "STEP",
      reason: "BLOCKED",
      blockers: [
        {
          taskId: "decision",
          title: "Decide the storage shape",
          kind: "DECISION",
          isWork: false,
          isStructure: false,
          done: false,
          hold: "OPEN",
          viaAncestorTaskId: "section"
        }
      ]
    }
  ],
  reconstructedReadyIds: [],
  disagreesWithServer: false,
  ancestryLooped: false
};

const captured: string[] = [];
const capture = (): void => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    captured.push(args.map(String).join(" "));
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  captured.length = 0;
  setJsonMode(false);
});

describe("the terminal rendering", () => {
  it("prints the caveat verbatim", () => {
    setJsonMode(false);
    capture();
    renderWhyNotReady(report, []);

    expect(captured.join("\n")).toContain(RECONSTRUCTION_CAVEAT);
  });

  it("names the blocker, its kind and the ancestor the edge is hung on", () => {
    setJsonMode(false);
    capture();
    renderWhyNotReady(report, []);
    const out = captured.join("\n");

    expect(out).toContain("Decide the storage shape");
    expect(out).toContain("DECISION");
    // The ancestor column is the half a task-only composition loses.
    expect(out).toContain("section");
  });

  it("still prints the caveat when nothing is held", () => {
    // The control for the first case: a rendering that only reached the caveat
    // through the populated branch would leave the empty board uncaveated, and
    // an empty board is the exact state this command is run in.
    setJsonMode(false);
    capture();
    renderWhyNotReady(
      {
        unready: [],
        reconstructedReadyIds: [],
        disagreesWithServer: false,
        ancestryLooped: false
      },
      []
    );

    expect(captured.join("\n")).toContain(RECONSTRUCTION_CAVEAT);
  });
});
