import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type DiagnoseResult,
  diffSnapshots,
  entrySignature,
  flattenDiagnose,
  formatFollowLine,
  isTerminalStatus,
  shortTag} from "../../src/util/follow-diagnose";

test("flattenDiagnose flattens top-level nodes in order", () => {
  const diag: DiagnoseResult = {
    executionId: "e1",
    status: "RUNNING",
    nodes: [
      {
        nodeId: "a",
        label: "read_companies",
        nodeType: "plugin",
        status: "COMPLETED",
        duration: 1200,
        outputSummary: "429 rows"
      },
      { nodeId: "b", label: "parse_rows", nodeType: "customScript", status: "RUNNING" }
    ]
  };
  const entries = flattenDiagnose(diag);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].key, "a");
  assert.equal(entries[0].pathLabel, "read_companies");
  assert.equal(entries[0].status, "COMPLETED");
  assert.equal(entries[1].pathLabel, "parse_rows");
});

test("flattenDiagnose addresses loop iterations individually (0-based)", () => {
  const diag: DiagnoseResult = {
    status: "RUNNING",
    nodes: [
      {
        nodeId: "loop1",
        label: "loop_companies",
        nodeType: "loop",
        status: "RUNNING",
        loopIterations: [
          {
            iteration: 1,
            status: "COMPLETED",
            nodes: [
              {
                nodeId: "ws",
                label: "workday_search",
                nodeType: "plugin",
                status: "COMPLETED",
                duration: 8400,
                outputSummary: "450 jobs"
              }
            ]
          },
          {
            iteration: 2,
            status: "RUNNING",
            nodes: [
              { nodeId: "ws", label: "workday_search", nodeType: "plugin", status: "RUNNING" }
            ]
          }
        ]
      }
    ]
  };
  const entries = flattenDiagnose(diag);
  // loop node + 2 iteration child nodes
  assert.equal(entries.length, 3);

  const loop = entries[0];
  // Loop node is still RUNNING, so the planned total is unknown (diagnose only
  // materializes spawned iterations) — total stays null until the loop finishes.
  assert.deepEqual(loop.loopProgress, { done: 1, total: null });

  const iter0 = entries[1];
  assert.equal(iter0.key, "loop1#iter1>ws");
  assert.equal(iter0.pathLabel, "loop_companies iter 0: workday_search");
  assert.equal(iter0.outputSummary, "450 jobs");

  const iter1 = entries[2];
  assert.equal(iter1.pathLabel, "loop_companies iter 1: workday_search");
  assert.equal(iter1.status, "RUNNING");
});

test("diffSnapshots only returns entries whose signature changed", () => {
  const diag1: DiagnoseResult = {
    status: "RUNNING",
    nodes: [
      { nodeId: "a", label: "a", nodeType: "plugin", status: "RUNNING" },
      { nodeId: "b", label: "b", nodeType: "plugin", status: "PENDING" }
    ]
  };
  const { changed: c1, next: s1 } = diffSnapshots(new Map(), flattenDiagnose(diag1));
  assert.equal(c1.length, 2); // first poll prints everything

  // Second poll: a completes, b unchanged.
  const diag2: DiagnoseResult = {
    status: "RUNNING",
    nodes: [
      {
        nodeId: "a",
        label: "a",
        nodeType: "plugin",
        status: "COMPLETED",
        duration: 100,
        outputSummary: "ok"
      },
      { nodeId: "b", label: "b", nodeType: "plugin", status: "PENDING" }
    ]
  };
  const { changed: c2 } = diffSnapshots(s1, flattenDiagnose(diag2));
  assert.equal(c2.length, 1);
  assert.equal(c2[0].key, "a");
  assert.equal(c2[0].status, "COMPLETED");
});

test("diffSnapshots reprints a loop node when iteration progress advances", () => {
  const mk = (done: number): DiagnoseResult => ({
    status: "RUNNING",
    nodes: [
      {
        nodeId: "loop1",
        label: "loop",
        nodeType: "loop",
        status: "RUNNING",
        loopIterations: Array.from({ length: 3 }, (_, i) => ({
          iteration: i + 1,
          status: i < done ? "COMPLETED" : "RUNNING",
          nodes: []
        }))
      }
    ]
  });
  const { next: s1 } = diffSnapshots(new Map(), flattenDiagnose(mk(0)));
  const { changed } = diffSnapshots(s1, flattenDiagnose(mk(2)));
  assert.equal(changed.length, 1);
  // Loop node still RUNNING -> total unknown; the advancing `done` count is what
  // changes the signature and triggers the reprint.
  assert.deepEqual(changed[0].loopProgress, { done: 2, total: null });
});

test("flattenDiagnose reports the real total once the loop node is terminal", () => {
  const diag: DiagnoseResult = {
    status: "COMPLETED",
    nodes: [
      {
        nodeId: "loop1",
        label: "loop",
        nodeType: "loop",
        status: "COMPLETED",
        loopIterations: Array.from({ length: 3 }, (_, i) => ({
          iteration: i + 1,
          status: "COMPLETED",
          nodes: []
        }))
      }
    ]
  };
  const [loop] = flattenDiagnose(diag);
  assert.deepEqual(loop.loopProgress, { done: 3, total: 3 });
});

test("formatFollowLine omits the denominator while the loop total is unknown", () => {
  const loopEntry = {
    key: "l",
    pathLabel: "loop_companies",
    type: "loop",
    status: "RUNNING",
    duration: null,
    outputSummary: null,
    error: null,
    loopProgress: { done: 1, total: null }
  };
  assert.equal(
    formatFollowLine(loopEntry, "wf1"),
    "[wf wf1] node loop_companies (loop) RUNNING — 1 iterations done"
  );
});

test("formatFollowLine matches the issue's line shape", () => {
  const [entry] = flattenDiagnose({
    status: "RUNNING",
    nodes: [
      {
        nodeId: "a",
        label: "read_companies",
        nodeType: "plugin",
        status: "COMPLETED",
        duration: 1200,
        outputSummary: "429 rows"
      }
    ]
  });
  assert.equal(
    formatFollowLine(entry, "bc4e2043"),
    "[wf bc4e2043] node read_companies (plugin) COMPLETED in 1.2s — output: 429 rows"
  );
});

test("formatFollowLine renders loop progress and errors", () => {
  const loopEntry = {
    key: "l",
    pathLabel: "loop_companies",
    type: "loop",
    status: "RUNNING",
    duration: null,
    outputSummary: null,
    error: null,
    loopProgress: { done: 1, total: 5 }
  };
  assert.equal(
    formatFollowLine(loopEntry, "wf1"),
    "[wf wf1] node loop_companies (loop) RUNNING — 1/5 iterations done"
  );

  const errEntry = {
    key: "x",
    pathLabel: "fetch",
    type: "plugin",
    status: "FAILED",
    duration: 500,
    outputSummary: null,
    error: "boom"
  };
  assert.equal(
    formatFollowLine(errEntry, "wf1"),
    "[wf wf1] node fetch (plugin) FAILED in 500ms — error: boom"
  );
});

test("isTerminalStatus / shortTag helpers", () => {
  assert.equal(isTerminalStatus("COMPLETED"), true);
  assert.equal(isTerminalStatus("FAILED"), true);
  assert.equal(isTerminalStatus("RUNNING"), false);
  assert.equal(isTerminalStatus(undefined), false);
  assert.equal(shortTag("bc4e2043-ddda-4e95"), "bc4e2043");
  assert.equal(shortTag(undefined), "?");
});

test("entrySignature changes when output preview changes", () => {
  const base = {
    key: "a",
    pathLabel: "a",
    type: "plugin",
    status: "COMPLETED",
    duration: 1,
    outputSummary: "x",
    error: null
  };
  assert.notEqual(entrySignature(base), entrySignature({ ...base, outputSummary: "y" }));
});
