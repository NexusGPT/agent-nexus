/**
 * Check a response payload against the shape its route publishes.
 *
 * ## What this is for
 *
 * `HttpClient.requestWithMeta` ends every read with an unchecked assertion —
 * the envelope's `data` is returned as `T` with nothing having looked at it —
 * and `@agent-nexus/cli` prints that value VERBATIM under `--json`. So the
 * CLI's documented output contract is, at run time, whatever the server sent.
 *
 * Three instruments already compare the parts of that chain WITHIN one tree
 * (the backend's `V1ResponseValidationInterceptor`, the SDK's compile-time
 * `v1-response-types-match-the-contract.test.ts`, and the backend's
 * `v1-response-contracts-match-the-handler.spec.ts`). All three read a single
 * commit. The case none of them can reach is an INSTALLED client talking to a
 * server that moved on without it, which is the ordinary state of a published
 * CLI. Only the client can see that, and only at the moment it reads a payload.
 *
 * ## What it does on a mismatch: NOTHING to the value
 *
 * The payload is returned unchanged, always, in every state. This module
 * OBSERVES; it never substitutes, strips or defaults.
 *
 * That is deliberate and it is the whole design. A checker that handed back its
 * own parsed output would DELETE any field the server added that the manifest
 * does not know about — so an older client against a newer server would quietly
 * drop the new fields from `--json` output, which is the exact defect this
 * exists to detect, wearing the cure. The backend's own interceptor states the
 * same rule for the same reason.
 *
 * ## Three outcomes, never two
 *
 * A route with no published schema must not be indistinguishable from one that
 * passed. {@link ResponseContractState} has a third value for exactly that, and
 * {@link ContractReport.reason} names which kind of silence it is.
 */

/** A sorted string of type letters: `s`tring `n`umber `b`oolean `o`bject `a`rray, `0` null. */
export type FieldTypeCode = string;

/** The shape of one payload, or the reason there is none to describe. */
export type PayloadShape =
  | {
      readonly kind: "object";
      readonly fields: Readonly<Record<string, FieldTypeCode>>;
      readonly required: readonly string[];
    }
  | { readonly kind: "array"; readonly items: PayloadShape }
  | { readonly kind: "opaque"; readonly why: string }
  | { readonly kind: "undeclared"; readonly why: "noResponse" | "rawResponse" };

/** One route of the published v1 contract. */
export interface RouteShape {
  /** The descriptor's name in the contract, e.g. `"AgentGet"`. */
  readonly name: string;
  readonly method: string;
  /** `"/agents/:agentId"` — the path as `HttpClient` spells it. */
  readonly path: string;
  readonly payload: PayloadShape;
}

/** `"<METHOD> <path>"` → shape, for every route the contract declares. */
export type RouteShapeManifest = Readonly<Record<string, RouteShape>>;

/** Whether the payload was checked, and what came of it. */
export type ResponseContractState = "passed" | "mismatch" | "unchecked";

/** One disagreement between the payload and the shape its route publishes. */
export interface ContractIssue {
  /** Dotted path into the payload, e.g. `"data[0].createdAt"`. */
  readonly at: string;
  readonly message: string;
}

/** What one read had to say about its own payload. */
export interface ContractReport {
  readonly state: ResponseContractState;
  /** The descriptor name, when a route matched. `null` when none did. */
  readonly route: string | null;
  readonly method: string;
  readonly path: string;
  /** Why nothing was checked. Present only when `state` is `"unchecked"`. */
  readonly reason?: string;
  /** Capped at {@link MAX_ISSUES}. Present only when `state` is `"mismatch"`. */
  readonly issues?: readonly ContractIssue[];
  /** How many issues were found before the cap. */
  readonly issueCount?: number;
}

/**
 * A caller notified of every read's verdict.
 *
 * Installing one is what turns the check ON: with no sink no manifest is
 * consulted and the client behaves exactly as it did before. A published SDK
 * should not start spending cycles, or start printing, because it was upgraded.
 *
 * The manifest itself arrives with it, through
 * `HttpClientOptions.responseContract`, and is imported from
 * `@agent-nexus/sdk/v1-response-contract` — it is not compiled into the client,
 * because it is larger than everything else the package ships and one opt-in
 * path reads it. A reporter installed without one is told so, per read, rather
 * than told nothing; see `./v1-response-contract.ts`.
 */
export type ContractReporter = (report: ContractReport) => void;

/**
 * How many issues one report carries.
 *
 * A renamed wrapper object makes EVERY field of a payload disagree at once, so
 * an uncapped report is a wall of text describing one change. Ten names the
 * change; the eleventh adds nothing a reader acts on. `issueCount` keeps the
 * true total.
 */
export const MAX_ISSUES = 10;

/** How many elements of an array payload are checked. */
export const MAX_ARRAY_SAMPLE = 3;

/** The JSON types a value may hold. `"null"` is one of them, not an absence. */
export type JsonTypeName = "string" | "number" | "boolean" | "object" | "array" | "null";

/**
 * The alphabet the generated manifest is written in — one letter per JSON type.
 *
 * 🚨 **This is a HAND-COPY of `JSON_TYPE_CODES` in `@nexus/types`, and it has to
 * be**: the bundle rule that keeps this package dependency-free forbids
 * importing that module from any publishable file, and this is one.
 *
 * Two tables are two things that can drift, and a drift here is the WORST kind
 * of failure this module can have — every field type would be scored against
 * the wrong letter, silently, with the manifest and the checker each internally
 * consistent. So the copy is CHECKED rather than trusted:
 * `response-contract.codegen.test.ts` compares it to the projector's own map,
 * asserts the letters are distinct, and asserts every code in the shipped
 * manifest is spelled in it — with a control proving the comparison
 * discriminates. `satisfies` is what makes a MISSING entry a compile error.
 */
export const TYPE_LETTER = {
  string: "s",
  number: "n",
  boolean: "b",
  object: "o",
  array: "a",
  null: "0"
} as const satisfies Record<JsonTypeName, string>;

/**
 * The inverse, DERIVED rather than written out a second time.
 *
 * The hand-written copy this replaces was a third table nothing compared to the
 * other two — an entry going stale there would have mislabelled a type in every
 * message a reader acts on, while both other tables stayed correct.
 */
const LETTER_TYPE: Readonly<Record<string, JsonTypeName>> = Object.fromEntries(
  Object.entries(TYPE_LETTER).map(([name, letter]) => [letter, name as JsonTypeName])
);

/**
 * The JSON type of a value, as one {@link TYPE_LETTER}.
 *
 * `"?"` is deliberately NOT a letter of the alphabet: it is what a value JSON
 * cannot carry decodes to (`undefined`, a function, a symbol, a bigint), and
 * because no declared code contains it, such a value always mismatches. A
 * `typeof` lookup keyed by string would have returned a letter for `bigint`
 * that no schema can ever declare.
 */
function typeLetterOf(value: unknown): string {
  if (value === null) return TYPE_LETTER.null;
  if (Array.isArray(value)) return TYPE_LETTER.array;
  switch (typeof value) {
    case "string":
      return TYPE_LETTER.string;
    case "number":
      return TYPE_LETTER.number;
    case "boolean":
      return TYPE_LETTER.boolean;
    case "object":
      return TYPE_LETTER.object;
    default:
      return "?";
  }
}

/** `"0s"` → `"null | string"`, for a message a reader can act on. */
function describeTypes(code: FieldTypeCode): string {
  return [...code].map((letter) => LETTER_TYPE[letter] ?? letter).join(" | ") || "anything";
}

/**
 * A path template matched against a concrete path.
 *
 * A LITERAL segment outranks a `:param` one, so `/agents/folders` resolves to
 * its own route rather than to `/agents/:agentId` — both are real routes here
 * and picking the wrong one would check a payload against another route's
 * shape, which reads as drift and is not.
 */
interface CompiledRoute {
  readonly segments: readonly string[];
  readonly literalCount: number;
  readonly shape: RouteShape;
}

/** A manifest compiled once for repeated matching. */
export interface CompiledManifest {
  /** `"<METHOD> <segment count>"` → candidates, most literal first. */
  readonly byShape: ReadonlyMap<string, readonly CompiledRoute[]>;
  readonly routeCount: number;
}

/** Split a path on `/`, dropping the empty leading and trailing pieces. */
function segmentsOf(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

/** Index a manifest for matching. Cheap enough to do once per client. */
export function compileManifest(manifest: RouteShapeManifest): CompiledManifest {
  const byShape = new Map<string, CompiledRoute[]>();

  for (const shape of Object.values(manifest)) {
    const segments = segmentsOf(shape.path);
    const key = `${shape.method} ${segments.length}`;
    const compiled: CompiledRoute = {
      segments,
      literalCount: segments.filter((s) => !s.startsWith(":")).length,
      shape
    };
    const bucket = byShape.get(key);
    if (bucket) bucket.push(compiled);
    else byShape.set(key, [compiled]);
  }

  // Most literal segments first, so the first match is the most specific one.
  for (const bucket of byShape.values()) {
    bucket.sort((a, b) => b.literalCount - a.literalCount);
  }

  return { byShape, routeCount: Object.keys(manifest).length };
}

/**
 * The route a concrete request belongs to, or `null` when the contract declares
 * none.
 *
 * The query string is stripped first: `HttpClient` builds it onto the `URL`
 * rather than into `path`, but a caller reaching `request()` directly may not.
 */
export function matchRoute(
  compiled: CompiledManifest,
  method: string,
  path: string
): RouteShape | null {
  const withoutQuery = path.split("?")[0];
  const segments = segmentsOf(withoutQuery);
  const candidates = compiled.byShape.get(`${method.toUpperCase()} ${segments.length}`);
  if (!candidates) return null;

  for (const candidate of candidates) {
    const matches = candidate.segments.every(
      (segment, i) => segment.startsWith(":") || segment === segments[i]
    );
    if (matches) return candidate.shape;
  }
  return null;
}

/** Walk a payload against a shape, appending disagreements to `issues`. */
function collectIssues(
  shape: PayloadShape,
  value: unknown,
  at: string,
  issues: ContractIssue[]
): void {
  if (shape.kind === "opaque" || shape.kind === "undeclared") return;

  if (shape.kind === "array") {
    if (!Array.isArray(value)) {
      issues.push({
        at,
        message: `the route publishes an array and the payload is ${typeNameOf(value)}`
      });
      return;
    }
    for (let i = 0; i < Math.min(value.length, MAX_ARRAY_SAMPLE); i++) {
      collectIssues(shape.items, value[i], `${at}[${i}]`, issues);
    }
    return;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push({
      at,
      message: `the route publishes an object and the payload is ${typeNameOf(value)}`
    });
    return;
  }

  const record = value as Record<string, unknown>;

  for (const key of shape.required) {
    if (!(key in record)) {
      issues.push({
        at: at ? `${at}.${key}` : key,
        message: `the route publishes this field as required and the payload omits it`
      });
    }
  }

  for (const [key, code] of Object.entries(shape.fields)) {
    // An absent OPTIONAL key is legal, and an absent required one is already
    // reported above — reporting it twice under two headings reads as two
    // separate defects.
    if (!(key in record)) continue;
    // An empty code is the projection declining to make a claim. It matches
    // every value BY DESIGN; see the projector's header.
    if (code.length === 0) continue;
    const actual = typeLetterOf(record[key]);
    if (!code.includes(actual)) {
      issues.push({
        at: at ? `${at}.${key}` : key,
        message: `the route publishes ${describeTypes(code)} and the payload holds ${typeNameOf(record[key])}`
      });
    }
  }
}

/** A value's JSON type, spelled for a message. */
function typeNameOf(value: unknown): string {
  const letter = typeLetterOf(value);
  return LETTER_TYPE[letter] ?? (value === undefined ? "absent" : "an unrepresentable value");
}

/**
 * Check one payload and describe what happened.
 *
 * NEVER returns the payload. The caller keeps the value it already has; this
 * function only ever produces a description of it.
 */
export function checkResponse(
  compiled: CompiledManifest,
  method: string,
  path: string,
  payload: unknown
): ContractReport {
  const base = { method: method.toUpperCase(), path };
  const route = matchRoute(compiled, method, path);

  if (!route) {
    return {
      ...base,
      state: "unchecked",
      route: null,
      reason: "no route in the published v1 contract matches this method and path"
    };
  }

  const shape = route.payload;

  if (shape.kind === "undeclared") {
    return {
      ...base,
      state: "unchecked",
      route: route.name,
      reason:
        shape.why === "rawResponse"
          ? "the route writes a raw response, so there is no envelope to describe"
          : "the route publishes no response schema, so there is nothing to check against"
    };
  }

  if (shape.kind === "opaque") {
    return { ...base, state: "unchecked", route: route.name, reason: shape.why };
  }

  const issues: ContractIssue[] = [];
  collectIssues(shape, payload, "", issues);

  if (issues.length === 0) return { ...base, state: "passed", route: route.name };

  return {
    ...base,
    state: "mismatch",
    route: route.name,
    issues: issues.slice(0, MAX_ISSUES),
    issueCount: issues.length
  };
}

/** A one-line rendering of a report, for a warning channel. */
export function formatContractReport(report: ContractReport): string {
  if (report.state !== "mismatch") {
    return `${report.method} ${report.path}: ${report.state}${report.reason ? ` — ${report.reason}` : ""}`;
  }
  const shown = report.issues ?? [];
  const hidden = (report.issueCount ?? shown.length) - shown.length;
  const lines = shown.map((issue) => `  ${issue.at || "<payload>"}: ${issue.message}`);
  if (hidden > 0) lines.push(`  ...and ${hidden} more`);
  return (
    `response does not match the contract for ${report.route} ` +
    `(${report.method} ${report.path})\n${lines.join("\n")}`
  );
}
