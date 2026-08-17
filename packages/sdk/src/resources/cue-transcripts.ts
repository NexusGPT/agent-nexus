import type { PageResponse } from "../types/common";
import type {
  CueConversationSummary,
  CueTranscriptDocument,
  ExportCueTranscriptsParams,
  ListCueConversationsParams
} from "../types/cue-transcripts";
import { BaseResource } from "./base-resource";

/**
 * Cue transcript export — the full JSON log of every Cue conversation and every
 * subagent it spawned.
 *
 * Read-only. The API surface behind it carries one scope, `cue_transcripts:read`.
 */
export class CueTranscriptsResource extends BaseResource {
  /**
   * The discovery list: which conversations exist in a date window and how big
   * each one is, with no transcript content.
   *
   * `startDate` / `endDate` bound the conversation's `updatedAt`, so the same
   * window that scopes a corpus pull also answers "what changed since my last
   * export".
   */
  async listConversations(
    params?: ListCueConversationsParams
  ): Promise<PageResponse<CueConversationSummary>> {
    return this.http.requestPage<CueConversationSummary>("GET", "/cue/conversations", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * One conversation's full transcript: the lead's turns plus the complete
   * transcript of every subagent the session spawned, nested under the tool-use
   * id that spawned it.
   */
  async getTranscript(conversationId: string): Promise<CueTranscriptDocument> {
    return this.http.request<CueTranscriptDocument>(
      "GET",
      `/cue/conversations/${conversationId}/transcript`
    );
  }

  /**
   * The bulk corpus pull: every transcript in a date range, as one string.
   *
   * ⚠️ **The ROUTE streams; this method does not.** `requestRaw` buffers the
   * whole response before resolving, so a wide date range is held in memory here
   * even though the server wrote it a document at a time. That is the existing
   * SDK idiom (`analytics.export()` does the same) and it is fine for a scoped
   * window; for a corpus large enough to matter, call
   * `GET /api/public/v1/cue/transcripts/export` directly and consume the body as
   * a stream — NDJSON is line-delimited precisely so a reader can.
   *
   * Returns NDJSON by default: one `CueTranscriptDocument` per line. Pass
   * `format: "json"` for a single array instead.
   *
   * Rate limited to 5 requests per minute per organization.
   */
  async export(params?: ExportCueTranscriptsParams): Promise<string> {
    return this.http.requestRaw("GET", "/cue/transcripts/export", {
      query: params as Record<string, string | number | undefined>
    });
  }
}
