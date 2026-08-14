// ============================================================================
// Session status
// ============================================================================

/** Lifecycle status of an evaluation session. */
export type EvalSessionStatus =
  | "DRAFT"
  | "EXECUTING"
  | "EXECUTED"
  | "JUDGING"
  | "COMPLETED"
  | "FAILED";

/** Per-row execution status inside an evaluation session. */
export type EvalRowStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

// ============================================================================
// Session
// ============================================================================

/** One row of `client.evaluations.listSessions()`. */
export interface EvalSession {
  /** Session UUID. */
  id: string;
  /** Session display name. */
  name: string;
  /** Free-text description, or `null`. */
  description: string | null;
  /** Lifecycle status. */
  status: EvalSessionStatus;
  /** UUID of the AI task under evaluation. */
  taskId: string;
  /** Rows in the session's dataset. */
  datasetRowCount: number;
  /** Rows that finished executing. */
  completedRows: number;
  /** Rows that errored. */
  failedRows: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string | null;
}

/** Response from `client.evaluations.getSession()`. */
export interface EvalSessionDetail extends EvalSession {
  /** Mean judged score, or `null` before judging runs. */
  averageScore: number | null;
  /** Rows the judge has scored. */
  judgedRows: number;
  /**
   * Rows the judge attempted and failed on. Without it a session whose every
   * judgement errored reads identically to one that was never judged.
   */
  judgeFailedRows: number;
  /** Model used to judge, or `null` before judging is configured. */
  judgeModel: string | null;
  /** Prompt used to judge, or `null` before judging is configured. */
  judgePrompt: string | null;
}

/** Response from `client.evaluations.deleteSession()`. */
export interface DeleteEvalSessionResponse {
  /** UUID of the deleted session. */
  id: string;
  /** Always `true` on success. */
  deleted: true;
}

// ============================================================================
// Dataset
// ============================================================================

/** One row of the dataset an evaluation session runs against. */
export interface EvalDatasetRow {
  /** Row UUID. */
  id: string;
  /** Input handed to the task. Shape is task-specific. */
  input: unknown;
  /** Expected output to judge against, or `null` when the row has none. */
  expectedOutput: unknown;
  /** Caller-supplied metadata carried alongside the row. */
  metadata: unknown;
}

// ============================================================================
// Results
// ============================================================================

/** One scored row of `client.evaluations.getResults()`. */
export interface EvalResult {
  /** UUID of the dataset row this scores. */
  rowId: string;
  /** Input the task received. */
  input: unknown;
  /** Expected output the judge compared against. */
  expectedOutput: unknown;
  /** Output the task produced. */
  actualOutput: unknown;
  /** Judge score, or `null` before judging runs. */
  score: number | null;
  /** Judge rationale, or `null` before judging runs. */
  judgeComment: string | null;
  /** Task execution time in milliseconds, or `null` while unfinished. */
  executionTimeMs: number | null;
  /** Row execution status. */
  status: EvalRowStatus;
  /**
   * Judging status, a SECOND dimension from {@link EvalResult.status}.
   *
   * A row can be `COMPLETED` and still unjudged. Reading judging off `status`
   * alone makes a judge failure indistinguishable from a row nothing has judged
   * yet.
   */
  judgeStatus: EvalRowStatus;
  /** Why the row's task execution failed, or `null` when it did not. */
  executionError: string | null;
  /** Why judging the row failed, or `null` when it did not. */
  judgeError: string | null;
}

// ============================================================================
// Execute / judge
// ============================================================================

/**
 * Response from `client.evaluations.execute()`.
 *
 * Execution is asynchronous — this acknowledges the request, it does not carry
 * results. Poll `getSession()` for progress.
 */
export interface ExecuteEvalResponse {
  /** UUID of the session now executing. */
  sessionId: string;
  /** Always `"EXECUTING"`. */
  status: "EXECUTING";
}

/**
 * Response from `client.evaluations.judge()`.
 *
 * Judging is asynchronous — this acknowledges the request. Poll `getSession()`
 * for `averageScore` and `judgedRows`.
 */
export interface JudgeEvalResponse {
  /** UUID of the session now judging. */
  sessionId: string;
  /** Always `"JUDGING"`. */
  status: "JUDGING";
}

/**
 * Response from `client.evaluations.uploadDataset()`.
 *
 * The upload REPLACES the session's dataset, so `rowCount` describes the whole
 * dataset afterwards rather than the rows this call added.
 */
export interface UploadDatasetResult {
  /** Rows the server parsed out of the file and stored. */
  rowCount: number;
  /** Column names taken from the first row. Empty when the file carried none. */
  columns: string[];
  /** Parser the server used — `"json"` or `"csv"`. Chosen from the file name. */
  format: string;
}

// ============================================================================
// Catalogues
// ============================================================================

/** One dataset upload format supported by `client.evaluations.uploadDataset()`. */
export interface EvalSupportedFormat {
  /** File extension, without the dot. */
  extension: string;
  /** MIME type to send the upload with. */
  mimeType: string;
  /** What the format is good for. */
  description: string;
}

/** One judge model offered by `client.evaluations.listJudges()`. */
export interface EvalJudgeType {
  /** Identifier to pass when configuring judging. */
  id: string;
  /** Provider serving the model. */
  provider: string;
  /** Provider-side model name. */
  modelName: string;
  /** Name to show in a picker. */
  displayName: string;
}

// ============================================================================
// Request bodies and params
// ============================================================================

/** Request body for `client.evaluations.createSession()`. */
export interface CreateEvalSessionBody {
  /** Session display name (required). */
  name: string;
  /** Free-text description. */
  description?: string;
}

/** Request body for `client.evaluations.addDatasetRow()`. */
export interface AddEvalDatasetRowBody {
  /** Input to hand the task. */
  input: unknown;
  /** Expected output to judge against. */
  expectedOutput?: unknown;
  /** Metadata to carry alongside the row. */
  metadata?: unknown;
}

/** Request body for `client.evaluations.judge()`. */
export interface JudgeEvalBody {
  /** Judge model id, from `client.evaluations.listJudges()`. */
  judgeModel?: string;
  /** Prompt the judge scores with. */
  judgePrompt?: string;
}
