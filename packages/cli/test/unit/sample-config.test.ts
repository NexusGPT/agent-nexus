import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSampleConfig } from "../../src/util/sample-config";

test("returns undefined when no flags are set", () => {
  assert.equal(parseSampleConfig({}), undefined);
  assert.equal(parseSampleConfig({ limitArray: [] }), undefined);
});

test("--sample with --sample-node builds a single-entry map", () => {
  assert.deepEqual(parseSampleConfig({ sample: "5", sampleNode: "loop-abc" }), { "loop-abc": 5 });
});

test("--sample without --sample-node throws", () => {
  assert.throws(() => parseSampleConfig({ sample: "5" }), /requires --sample-node/);
  assert.throws(() => parseSampleConfig({ sampleNode: "x" }), /requires --sample-node/);
});

test("--sample rejects non-positive integers", () => {
  assert.throws(() => parseSampleConfig({ sample: "0", sampleNode: "x" }), /positive integer/);
  assert.throws(() => parseSampleConfig({ sample: "-3", sampleNode: "x" }), /positive integer/);
  assert.throws(() => parseSampleConfig({ sample: "abc", sampleNode: "x" }), /positive integer/);
});

test("--limit-array parses repeated nodeId=N pairs", () => {
  assert.deepEqual(parseSampleConfig({ limitArray: ["loop-abc=5", "rows=10"] }), {
    "loop-abc": 5,
    rows: 10
  });
});

test("--limit-array rejects malformed pairs", () => {
  assert.throws(() => parseSampleConfig({ limitArray: ["loop-abc"] }), /<nodeId>=<N>/);
  assert.throws(() => parseSampleConfig({ limitArray: ["=5"] }), /<nodeId>=<N>/);
  assert.throws(() => parseSampleConfig({ limitArray: ["x="] }), /<nodeId>=<N>/);
  assert.throws(() => parseSampleConfig({ limitArray: ["x=0"] }), /positive integer/);
});

test("--sample and --limit-array merge; later --limit-array wins on conflict", () => {
  assert.deepEqual(
    parseSampleConfig({ sample: "5", sampleNode: "loop", limitArray: ["loop=3", "other=7"] }),
    { loop: 3, other: 7 }
  );
});
