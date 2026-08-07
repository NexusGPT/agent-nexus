import { appendFilePart } from "../multipart";
import type { PageResponse } from "../types/common";
import type {
  AddEvalDatasetRowBody,
  CreateEvalSessionBody,
  DeleteEvalSessionResponse,
  EvalDatasetRow,
  EvalJudgeType,
  EvalResult,
  EvalSession,
  EvalSessionDetail,
  EvalSupportedFormat,
  ExecuteEvalResponse,
  JudgeEvalBody,
  JudgeEvalResponse,
  UploadDatasetResult
} from "../types/evaluations";
import { BaseResource } from "./base-resource";

/**
 * AI-task evaluation resource. Accessed via `client.evaluations`.
 *
 * A session pairs one AI task with a dataset, runs the task over every row, then
 * scores the outputs with a judge model. `execute()` and `judge()` are both
 * asynchronous — they acknowledge the request, and progress shows up on
 * `getSession()`.
 */
export class EvaluationsResource extends BaseResource {
  /**
   * Create an evaluation session for a task.
   *
   * @param taskId - AI task UUID.
   * @param body - Session properties. `name` is required.
   * @returns The created session.
   */
  async createSession(taskId: string, body: CreateEvalSessionBody): Promise<EvalSession> {
    return this.http.request<EvalSession>("POST", `/skills/tasks/${taskId}/evaluations`, { body });
  }

  /**
   * List a task's evaluation sessions.
   *
   * @param taskId - AI task UUID.
   * @param params - Optional pagination.
   * @returns Paginated list of sessions.
   */
  async listSessions(
    taskId: string,
    params?: { page?: number; limit?: number }
  ): Promise<PageResponse<EvalSession>> {
    return this.http.requestPage<EvalSession>("GET", `/skills/tasks/${taskId}/evaluations`, {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Get one session, including its judging configuration and average score.
   *
   * @param taskId - AI task UUID.
   * @param sessionId - Session UUID.
   * @returns The session.
   */
  async getSession(taskId: string, sessionId: string): Promise<EvalSessionDetail> {
    return this.http.request<EvalSessionDetail>(
      "GET",
      `/skills/tasks/${taskId}/evaluations/${sessionId}`
    );
  }

  /**
   * Delete an evaluation session and its results.
   *
   * @param taskId - AI task UUID.
   * @param sessionId - Session UUID.
   * @returns Confirmation carrying the deleted session's id.
   */
  async deleteSession(taskId: string, sessionId: string): Promise<DeleteEvalSessionResponse> {
    return this.http.request<DeleteEvalSessionResponse>(
      "DELETE",
      `/skills/tasks/${taskId}/evaluations/${sessionId}`
    );
  }

  /**
   * List the dataset rows a session runs against.
   *
   * @param taskId - AI task UUID.
   * @param sessionId - Session UUID.
   * @param params - Optional pagination.
   * @returns Paginated list of dataset rows.
   */
  async getDatasetRows(
    taskId: string,
    sessionId: string,
    params?: { page?: number; limit?: number }
  ): Promise<PageResponse<EvalDatasetRow>> {
    return this.http.requestPage<EvalDatasetRow>(
      "GET",
      `/skills/tasks/${taskId}/evaluations/${sessionId}/dataset`,
      {
        query: params as Record<string, string | number | undefined>
      }
    );
  }

  /**
   * Append one row to a session's dataset.
   *
   * @param taskId - AI task UUID.
   * @param sessionId - Session UUID.
   * @param body - The row's input, and optionally the output to judge against.
   * @returns The created row.
   */
  async addDatasetRow(
    taskId: string,
    sessionId: string,
    body: AddEvalDatasetRowBody
  ): Promise<EvalDatasetRow> {
    return this.http.request<EvalDatasetRow>(
      "POST",
      `/skills/tasks/${taskId}/evaluations/${sessionId}/dataset/rows`,
      { body }
    );
  }

  /**
   * Replace a session's dataset with the rows in an uploaded CSV or JSON file.
   *
   * The upload is a REPLACE, not an append: the server clears the session's
   * existing rows inside the same transaction. `addDatasetRow()` is the append.
   *
   * 🚨 **`fileName` is required here, and required for a reason.** The server
   * picks its parser from the file NAME and from nothing else — a name ending
   * in `.json` is parsed as a JSON array of objects, and every other name is
   * parsed as CSV. It reads no media type. So an upload that arrives unnamed is
   * not rejected; it is parsed as CSV, and a JSON document parsed as CSV stores
   * garbage rows without erroring. Every other upload method on this SDK takes
   * `fileName` optionally because its route ignores the name; this one makes it
   * required so the silent case cannot be written.
   *
   * @param taskId - AI task UUID.
   * @param sessionId - Session UUID.
   * @param file - The dataset file, as a `Blob` or `File`.
   * @param fileName - File name INCLUDING the extension that selects the parser.
   * @returns Rows stored, column names, and the parser the server used.
   *
   * @example
   * ```ts
   * import fs from "fs";
   *
   * const buffer = fs.readFileSync("cases.json");
   * const result = await client.evaluations.uploadDataset(
   *   "task-uuid",
   *   "session-uuid",
   *   new Blob([buffer]),
   *   "cases.json"
   * );
   * console.log(result.rowCount, result.format); // → 42 "json"
   * ```
   */
  async uploadDataset(
    taskId: string,
    sessionId: string,
    file: Blob | File,
    fileName: string
  ): Promise<UploadDatasetResult> {
    const formData = new FormData();
    appendFilePart(formData, "file", file, fileName);
    return this.http.request<UploadDatasetResult>(
      "POST",
      `/skills/tasks/${taskId}/evaluations/${sessionId}/dataset`,
      { body: formData }
    );
  }

  /**
   * Run the task over every dataset row.
   *
   * @param taskId - AI task UUID.
   * @param sessionId - Session UUID.
   * @returns Acknowledgement. Execution is asynchronous — poll `getSession()`.
   */
  async execute(taskId: string, sessionId: string): Promise<ExecuteEvalResponse> {
    return this.http.request<ExecuteEvalResponse>(
      "POST",
      `/skills/tasks/${taskId}/evaluations/${sessionId}/execute`
    );
  }

  /**
   * Score the executed rows with a judge model.
   *
   * @param taskId - AI task UUID.
   * @param sessionId - Session UUID.
   * @param body - Judge model and prompt. Both optional; the session's stored
   *   configuration is used when omitted.
   * @returns Acknowledgement. Judging is asynchronous — poll `getSession()`.
   */
  async judge(taskId: string, sessionId: string, body?: JudgeEvalBody): Promise<JudgeEvalResponse> {
    return this.http.request<JudgeEvalResponse>(
      "POST",
      `/skills/tasks/${taskId}/evaluations/${sessionId}/judge`,
      { body }
    );
  }

  /**
   * Read the per-row outputs and scores.
   *
   * @param taskId - AI task UUID.
   * @param sessionId - Session UUID.
   * @param params - Optional pagination.
   * @returns Paginated list of results. `score` is `null` until judging runs.
   */
  async getResults(
    taskId: string,
    sessionId: string,
    params?: { page?: number; limit?: number }
  ): Promise<PageResponse<EvalResult>> {
    return this.http.requestPage<EvalResult>(
      "GET",
      `/skills/tasks/${taskId}/evaluations/${sessionId}/results`,
      {
        query: params as Record<string, string | number | undefined>
      }
    );
  }

  /**
   * List the dataset file formats the upload endpoint accepts.
   *
   * @returns The supported formats. This catalogue is served from a fixed list.
   */
  async listFormats(): Promise<EvalSupportedFormat[]> {
    return this.http.request<EvalSupportedFormat[]>("GET", "/skills/evaluations/formats");
  }

  /**
   * List the judge models available to `judge()`.
   *
   * @returns The available judges. This catalogue is served from a fixed list.
   */
  async listJudges(): Promise<EvalJudgeType[]> {
    return this.http.request<EvalJudgeType[]>("GET", "/skills/evaluations/judges");
  }
}
