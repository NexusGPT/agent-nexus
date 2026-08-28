/**
 * SCORES — the universal score store's public surface.
 *
 * A score attaches one measured value to one scorable entity. Any emitter can
 * produce one internally (an eval judge, a workflow node, a CSAT bridge), but
 * this SDK reaches only the PUBLIC pair of routes, and those carry two
 * server-owned rules that shape every type below.
 *
 * ## `emitterType` is absent from the write and present on the read
 *
 * It is NOT an oversight and it is not symmetrical by accident. The server
 * forces `CUSTOM_KPI` on every score recorded through the public route, so an
 * external caller cannot forge an `EVAL_JUDGE`, `CSAT`, `SYSTEM_EVENT` or
 * `WORKFLOW_NODE` score and have it counted as one. {@link RecordScoreBody}
 * therefore has no `emitterType` field to set, while {@link PublicScore} does
 * expose it — reads tell you which kind of emitter produced a row, writes do
 * not let you choose.
 *
 * The organization is taken from the API key's auth context on both routes and
 * appears in neither type, for the same reason.
 *
 * ## The value is a discriminated union, not three optional fields
 *
 * {@link ScoreValue} is the type-level twin of the database's
 * `Score_value_matches_type_chk` CHECK constraint: a `NUMERIC` score carries a
 * `numericValue` and nothing else, a `CATEGORICAL` one a `categoricalValue`, a
 * `BOOLEAN` one a `booleanValue`. Every other combination is unrepresentable,
 * so a caller cannot construct an invalid score, let alone persist one.
 *
 * ## Timestamps are STRINGS
 *
 * `createdAt` arrives ISO-formatted and is handed back exactly as the wire
 * carried it. Parse it yourself if you want a `Date`; this package does not,
 * because a client that rehydrates some fields and not others is worse than one
 * that returns what arrived.
 */

/** The kinds of entity a score can be attached to. */
export type ScorableType =
  | "MESSAGE"
  | "CHAT"
  | "GENERATION"
  | "TRACE"
  | "WORKFLOW_EXECUTION"
  | "WORKFLOW_EXECUTION_NODE";

/**
 * What produced a score.
 *
 * 🔴 READS ONLY. Every score recorded through the public route is `CUSTOM_KPI`,
 * assigned server-side — see this file's header for why the write body has no
 * such field.
 */
export type ScoreEmitterType =
  | "EVAL_JUDGE"
  | "WORKFLOW_NODE"
  | "CSAT"
  | "SYSTEM_EVENT"
  | "CUSTOM_KPI"
  | "HUMAN";

/** Which of the three value shapes a score carries. */
export type ScoreValueType = "NUMERIC" | "CATEGORICAL" | "BOOLEAN";

/**
 * The value of a score — exactly one shape per `valueType`.
 *
 * Discriminating on `valueType` is what makes the wrong pairing a compile error
 * rather than a rejected request.
 */
export type ScoreValue =
  | { valueType: "NUMERIC"; numericValue: number }
  | { valueType: "CATEGORICAL"; categoricalValue: string }
  | { valueType: "BOOLEAN"; booleanValue: boolean };

/** The descriptor half of a recorded score, minus the server-owned `emitterType`. */
export interface RecordScoreDescriptor {
  /** Metric key, e.g. `"helpfulness"`, `"csat"`, `"resolved"`. */
  name: string;
  /** The kind of entity being scored. */
  scorableType: ScorableType;
  /** UUID of the entity being scored. */
  scorableId: string;
  /** Id of the emitter when it is an entity (judge id, node id). */
  emitterId?: string | null;
  /** Human label for the emitter (criterion name, KPI label). */
  emitterName?: string | null;
  /** Optional rationale from the emitter. */
  reasoning?: string | null;
  /**
   * Free-form JSON kept alongside the score and returned unchanged on reads.
   *
   * Deliberately opaque: every emitter puts something different here, and
   * constraining it would make the type the union of all of them. Not indexed
   * and not filterable.
   */
  metadata?: unknown;
}

/**
 * Body for {@link ScoresResource.record}.
 *
 * The descriptor and the discriminated value are intersected, so the
 * value/valueType invariant holds at the type level and not merely at the
 * boundary.
 */
export type RecordScoreBody = RecordScoreDescriptor & ScoreValue;

/** Response from {@link ScoresResource.record} — the id of the appended row. */
export interface RecordScoreResponse {
  /** UUID of the score that was appended. */
  scoreId: string;
}

/**
 * Query for {@link ScoresResource.list}.
 *
 * 🔴 BOTH FIELDS ARE REQUIRED. This is a bounded read of one entity's scores,
 * never a paginated scan of the organization's — there is no "list every score"
 * route to reach. The organization is the API key's and is not a parameter.
 */
export interface ListScoresParams {
  /** The kind of entity whose scores to read. */
  scorableType: ScorableType;
  /** UUID of the entity whose scores to read. */
  scorableId: string;
}

/**
 * The fields every returned score carries, whatever its value shape.
 *
 * Not exported as the score type itself: see {@link PublicScore} for why the
 * public shape is a flat union rather than this intersected with a value.
 */
interface PublicScoreCommon {
  /** UUID of this score row. */
  id: string;
  /** Metric key. */
  name: string;
  /** The kind of entity scored. */
  scorableType: ScorableType;
  /** UUID of the entity scored. */
  scorableId: string;
  /** What produced this score. Public writes are always `CUSTOM_KPI`. */
  emitterType: ScoreEmitterType;
  /** Id of the emitter when it is an entity, else `null`. */
  emitterId: string | null;
  /** Human label for the emitter, else `null`. */
  emitterName: string | null;
  /** Rationale from the emitter, else `null`. */
  reasoning: string | null;
  /**
   * Free-form JSON, returned exactly as it was stored.
   *
   * OPTIONAL rather than required, and that is the contract's shape rather than
   * a choice: the read schema declares `z.unknown()`, which accepts `undefined`,
   * so Zod infers the key as optional.
   */
  metadata?: unknown;
  /** ISO-8601 string, exactly as the wire carried it. */
  createdAt: string;
}

/**
 * A score as returned by the public read route.
 *
 * 🔴 A FLAT UNION OF THREE COMPLETE OBJECTS, NEVER `PublicScoreCommon &
 * ScoreValue`, AND THE DIFFERENCE IS LOAD-BEARING. The two describe the same
 * values, but `v1-response-types-match-the-contract` compares the type NODE
 * rather than assignability, and its `Wire<T>` walk flattens the contract's
 * `z.intersection` into a mapped object — which distributes over the value
 * union and yields exactly the three flat objects below. An intersection here
 * is not identical to that node, so the gate reds with the shapes agreeing.
 *
 * Writing it flat is therefore how this type states the wire truthfully: what
 * arrives IS one of three complete objects, and the intersection was only ever
 * a convenient way to spell it.
 */
export type PublicScore =
  | (PublicScoreCommon & { valueType: "NUMERIC"; numericValue: number })
  | (PublicScoreCommon & { valueType: "CATEGORICAL"; categoricalValue: string })
  | (PublicScoreCommon & { valueType: "BOOLEAN"; booleanValue: boolean });

/** Response from {@link ScoresResource.list} — newest first. */
export type ListScoresResponse = PublicScore[];
