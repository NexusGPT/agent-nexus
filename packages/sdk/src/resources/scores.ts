import type {
  ListScoresParams,
  ListScoresResponse,
  RecordScoreBody,
  RecordScoreResponse
} from "../types/scores";
import { BaseResource } from "./base-resource";

/**
 * SCORES — attach a measured value to a scorable entity. Accessed via
 * `client.scores`.
 *
 * ## Two routes, and the asymmetry between them is deliberate
 *
 * `record()` appends one score; `list()` reads every score on ONE entity,
 * newest first. There is no update, no delete and no organization-wide scan,
 * because the public contract declares no such route — the store is
 * append-only from out here, and a wrong score is superseded by a later one
 * rather than edited.
 *
 * ## 🔴 YOU CANNOT CHOOSE THE EMITTER TYPE, AND THAT IS THE POINT
 *
 * Every score recorded through this resource is stamped `CUSTOM_KPI`
 * server-side. The write body has no `emitterType` field to set, so an external
 * caller cannot forge an `EVAL_JUDGE`, `CSAT`, `SYSTEM_EVENT` or
 * `WORKFLOW_NODE` score and have downstream analytics count it as one. Reads DO
 * report `emitterType`, so a row's provenance is visible even though it is not
 * selectable.
 *
 * The organization is taken from the API key on both routes and is a parameter
 * of neither.
 *
 * ## The value/valueType pairing is enforced by the type, not by the server
 *
 * `RecordScoreBody` intersects the descriptor with a discriminated union on
 * `valueType`, so `{ valueType: "NUMERIC", categoricalValue: "x" }` does not
 * compile. That mirrors the database's own `Score_value_matches_type_chk`
 * constraint rather than duplicating a rule in prose.
 */
export class ScoresResource extends BaseResource {
  /**
   * Record one score against one entity.
   *
   * The score is appended, never merged: recording the same metric on the same
   * entity twice leaves two rows, and `list()` returns both with the newer one
   * first. There is no upsert here, so a caller wanting "the current value"
   * reads the newest row rather than expecting this call to replace anything.
   *
   * @param body - Descriptor plus the discriminated value. `emitterType` is not
   * settable — see this class's docblock.
   * @returns The id of the appended score row.
   */
  async record(body: RecordScoreBody): Promise<RecordScoreResponse> {
    return this.http.request<RecordScoreResponse>("POST", `/scores`, { body });
  }

  /**
   * Every score on one entity, newest first.
   *
   * ⚠️ BOTH PARAMETERS ARE REQUIRED and this is not a paginated list. It is a
   * bounded read of a single entity's scores — the contract declares no route
   * that scans an organization's scores, so there is no `page`/`limit` to pass
   * and no cursor to follow.
   *
   * An entity in another organization reads as an EMPTY ARRAY rather than a
   * refusal: the query is anchored on the API key's organization, so a foreign
   * id simply matches no rows — the same answer a real entity with no scores
   * gives. Do not read `[]` as proof the entity exists.
   *
   * @param params - The entity to read, by type and UUID. Both required.
   * @returns The entity's scores, newest first.
   */
  async list(params: ListScoresParams): Promise<ListScoresResponse> {
    return this.http.request<ListScoresResponse>("GET", `/scores`, {
      query: params as unknown as Record<string, string | number | undefined>
    });
  }
}
