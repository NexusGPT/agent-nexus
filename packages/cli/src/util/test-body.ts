/**
 * Builders for the `workflow test` / `workflow test-node` request bodies.
 *
 * Both endpoints expect a *structured* body — `{ triggerData, sampleConfig }`
 * for the full-workflow test and `{ input }` for a single node — and silently
 * strip any other top-level keys server-side. Historically the CLI sent the
 * flat `--input` / `--body` payload straight through, so `--input '{"x":1}'`
 * and a flat `--body '{"x":1}'` were accepted but dropped (NEX-2483): the
 * trigger's stored `runOutput` shadowed them and only the explicit
 * `--body '{"triggerData":{...}}'` wrapper took effect.
 *
 * These helpers normalize the CLI inputs into the shape the API expects while
 * preserving the already-working structured form (so it is not double-wrapped).
 */

import { coerceStructuredObject, isPlainObject, omitEmpty } from "./test-body.shape";

/**
 * Parse a raw `--input` flag value into an object, with a friendly error.
 * Returns `undefined` when the flag was not provided.
 */
export function parseInputFlag(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in --input: ${raw.length > 120 ? raw.slice(0, 120) + "…" : raw}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `--input must be a JSON object, got ${Array.isArray(parsed) ? "array" : typeof parsed}`
    );
  }
  return parsed;
}

/**
 * Build the `{ triggerData, sampleConfig }` body for `POST /workflows/:id/test`.
 *
 * Precedence:
 *  - `--input` (when provided) is always the trigger payload and overrides any
 *    `triggerData` derived from `--body`.
 *  - A `--body` already in structured form (`triggerData` and/or `sampleConfig`
 *    keys present) is used as-is.
 *  - Any other (flat) `--body` is treated as the trigger payload.
 *  - `flagSampleConfig` (from `--sample` / `--limit-array`) is merged onto the
 *    body's `sampleConfig`, with the flags winning on conflict.
 *  - An empty trigger payload (`{}`) is omitted so a stored override survives.
 *  - A structured key whose value is not an object throws (no silent drop).
 *
 * Note: `--input` is the trigger payload verbatim — a `sampleConfig` nested
 * inside it is part of that payload, not a cap directive. Use `--sample` /
 * `--limit-array` (which compose with `--input`) or a structured `--body` for
 * caps.
 */
export function buildTestWorkflowBody(
  base: Record<string, unknown> | undefined,
  input: Record<string, unknown> | undefined,
  flagSampleConfig: Record<string, number> | undefined
): { triggerData?: Record<string, unknown>; sampleConfig?: Record<string, number> } {
  let triggerData: Record<string, unknown> | undefined;
  let bodySampleConfig: Record<string, unknown> | undefined;

  if (isPlainObject(base)) {
    const hasStructuredKeys = "triggerData" in base || "sampleConfig" in base;
    if (hasStructuredKeys) {
      triggerData = coerceStructuredObject(base.triggerData, "triggerData in --body");
      bodySampleConfig = coerceStructuredObject(base.sampleConfig, "sampleConfig in --body");
    } else {
      // Flat --body: the whole object is the trigger payload.
      triggerData = base;
    }
  }

  // --input always supplies the trigger payload and overrides --body's.
  if (input !== undefined) triggerData = input;

  // An empty trigger payload ({}) is "no override": omit it so a stored trigger
  // runOutput / upstream context is preserved (matches the backend's
  // newsMonitor "empty == absent" handling) instead of clobbering it with {}.
  triggerData = omitEmpty(triggerData);

  const mergedSampleConfig =
    flagSampleConfig || bodySampleConfig
      ? { ...(bodySampleConfig ?? {}), ...(flagSampleConfig ?? {}) }
      : undefined;

  const result: { triggerData?: Record<string, unknown>; sampleConfig?: Record<string, number> } =
    {};
  if (triggerData !== undefined) result.triggerData = triggerData;
  if (mergedSampleConfig !== undefined) {
    result.sampleConfig = mergedSampleConfig as Record<string, number>;
  }
  return result;
}

/**
 * Build the `{ input }` body for `POST /workflows/:id/nodes/:nodeId/test`.
 *
 * Precedence mirrors {@link buildTestWorkflowBody}:
 *  - `--input` (when provided) is always the node input and overrides `--body`.
 *  - A `--body` already in structured form (`input` key present) is used as-is.
 *  - Any other (flat) `--body` is treated as the node input.
 *
 * Returns `undefined` when neither flag yields any input, so the endpoint's
 * optional body stays absent.
 */
export function buildTestNodeBody(
  base: Record<string, unknown> | undefined,
  input: Record<string, unknown> | undefined
): { input: Record<string, unknown> } | undefined {
  let nodeInput: Record<string, unknown> | undefined;

  if (isPlainObject(base)) {
    if ("input" in base) {
      nodeInput = coerceStructuredObject(base.input, "input in --body");
    } else {
      // Flat --body: the whole object is the node input.
      nodeInput = base;
    }
  }

  if (input !== undefined) nodeInput = input;

  // An empty input ({}) is "no payload": omit it so the node falls back to its
  // stored runOutput / upstream test context rather than running against {}.
  nodeInput = omitEmpty(nodeInput);

  return nodeInput !== undefined ? { input: nodeInput } : undefined;
}
