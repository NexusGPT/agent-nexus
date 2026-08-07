import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTestNodeBody, buildTestWorkflowBody, parseInputFlag } from "../../src/util/test-body";

// ── buildTestWorkflowBody ────────────────────────────────────────────────

test("--input is wrapped as triggerData (NEX-2483)", () => {
  assert.deepEqual(buildTestWorkflowBody(undefined, { probe: "INPUTFLAG" }, undefined), {
    triggerData: { probe: "INPUTFLAG" }
  });
});

test("a flat --body is treated as the trigger payload (NEX-2483)", () => {
  assert.deepEqual(buildTestWorkflowBody({ probe: "BODYFLAT" }, undefined, undefined), {
    triggerData: { probe: "BODYFLAT" }
  });
});

test("a structured --body { triggerData } is used as-is (not double-wrapped)", () => {
  assert.deepEqual(
    buildTestWorkflowBody({ triggerData: { probe: "BODYTRIGGER" } }, undefined, undefined),
    { triggerData: { probe: "BODYTRIGGER" } }
  );
});

test("--input overrides triggerData derived from --body", () => {
  assert.deepEqual(
    buildTestWorkflowBody(
      { triggerData: { probe: "FROMBODY" } },
      { probe: "FROMINPUT" },
      undefined
    ),
    { triggerData: { probe: "FROMINPUT" } }
  );
});

test("no input and no body yields an empty body", () => {
  assert.deepEqual(buildTestWorkflowBody(undefined, undefined, undefined), {});
});

test("flag sampleConfig is included alongside trigger payload", () => {
  assert.deepEqual(buildTestWorkflowBody({ probe: "x" }, undefined, { loop: 5 }), {
    triggerData: { probe: "x" },
    sampleConfig: { loop: 5 }
  });
});

test("structured --body sampleConfig is preserved and merged with flags (flags win)", () => {
  assert.deepEqual(
    buildTestWorkflowBody(
      { triggerData: { probe: "x" }, sampleConfig: { loop: 3, other: 7 } },
      undefined,
      { loop: 5 }
    ),
    { triggerData: { probe: "x" }, sampleConfig: { loop: 5, other: 7 } }
  );
});

test("a body with only sampleConfig is structured (not treated as flat trigger data)", () => {
  assert.deepEqual(buildTestWorkflowBody({ sampleConfig: { loop: 2 } }, undefined, undefined), {
    sampleConfig: { loop: 2 }
  });
});

test("an empty flat --body omits triggerData (preserves stored runOutput) (NEX-2483)", () => {
  assert.deepEqual(buildTestWorkflowBody({}, undefined, undefined), {});
});

test("an empty --input omits triggerData (preserves stored runOutput) (NEX-2483)", () => {
  assert.deepEqual(buildTestWorkflowBody(undefined, {}, undefined), {});
});

test("an empty structured triggerData is omitted", () => {
  assert.deepEqual(buildTestWorkflowBody({ triggerData: {} }, undefined, undefined), {});
});

test("an empty payload still applies flag sampleConfig without sending triggerData", () => {
  assert.deepEqual(buildTestWorkflowBody({}, undefined, { loop: 5 }), {
    sampleConfig: { loop: 5 }
  });
});

test("a non-object triggerData in --body throws instead of being silently dropped", () => {
  assert.throws(
    () => buildTestWorkflowBody({ triggerData: "nope" }, undefined, undefined),
    /triggerData in --body must be a JSON object/
  );
});

test("a non-object sampleConfig in --body throws", () => {
  assert.throws(
    () => buildTestWorkflowBody({ sampleConfig: "nope" }, undefined, undefined),
    /sampleConfig in --body must be a JSON object/
  );
});

test("a null structured triggerData is treated as absent (not an error)", () => {
  assert.deepEqual(buildTestWorkflowBody({ triggerData: null }, undefined, undefined), {});
});

// ── buildTestNodeBody ────────────────────────────────────────────────────

test("node --input is wrapped as { input }", () => {
  assert.deepEqual(buildTestNodeBody(undefined, { key: "value" }), { input: { key: "value" } });
});

test("a flat node --body is treated as the node input", () => {
  assert.deepEqual(buildTestNodeBody({ key: "value" }, undefined), { input: { key: "value" } });
});

test("a structured node --body { input } is used as-is", () => {
  assert.deepEqual(buildTestNodeBody({ input: { key: "value" } }, undefined), {
    input: { key: "value" }
  });
});

test("node --input overrides --body", () => {
  assert.deepEqual(buildTestNodeBody({ key: "fromBody" }, { key: "fromInput" }), {
    input: { key: "fromInput" }
  });
});

test("no node input yields undefined (body stays absent)", () => {
  assert.equal(buildTestNodeBody(undefined, undefined), undefined);
});

test("an empty node --input / --body yields undefined (preserves stored context)", () => {
  assert.equal(buildTestNodeBody({}, undefined), undefined);
  assert.equal(buildTestNodeBody(undefined, {}), undefined);
  assert.equal(buildTestNodeBody({ input: {} }, undefined), undefined);
});

test("a non-object node input in --body throws instead of being silently dropped", () => {
  assert.throws(
    () => buildTestNodeBody({ input: "nope" }, undefined),
    /input in --body must be a JSON object/
  );
});

// ── parseInputFlag ───────────────────────────────────────────────────────

test("parseInputFlag returns undefined when flag absent", () => {
  assert.equal(parseInputFlag(undefined), undefined);
});

test("parseInputFlag parses a JSON object", () => {
  assert.deepEqual(parseInputFlag('{"a":1}'), { a: 1 });
});

test("parseInputFlag rejects invalid JSON", () => {
  assert.throws(() => parseInputFlag("{not json"), /Invalid JSON in --input/);
});

test("parseInputFlag rejects non-object JSON", () => {
  assert.throws(() => parseInputFlag('"hello"'), /must be a JSON object/);
  assert.throws(() => parseInputFlag("[1,2]"), /must be a JSON object/);
});
