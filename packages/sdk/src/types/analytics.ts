// ============================================================================
// Overview
// ============================================================================

/** One point on an analytics time series. */
export interface AnalyticsTimeSeriesPoint {
  /** Bucket date. */
  date: string;
  /** Value for that bucket. */
  value: number;
}

/** One row of an analytics breakdown by channel, deployment or model. */
export interface AnalyticsBreakdownEntry {
  /** Id of the entity this row counts. */
  entityId: string;
  /** Display name, or `null` when the entity has been removed. */
  label: string | null;
  /** Value attributed to the entity. */
  value: number;
}

/** Token totals over the reporting window. */
export interface AnalyticsTokenUsage {
  /** Tokens sent to the model. */
  inputTokens: number;
  /** Tokens the model produced. */
  outputTokens: number;
}

/** Daily series for each headline metric. */
export interface AnalyticsTimeSeries {
  /** Conversations started per day. */
  conversationsPerDay: AnalyticsTimeSeriesPoint[];
  /** Messages exchanged per day. */
  messagesPerDay: AnalyticsTimeSeriesPoint[];
  /** Unique users per day. */
  usersPerDay: AnalyticsTimeSeriesPoint[];
  /** Spend per day, in USD. */
  costPerDay: AnalyticsTimeSeriesPoint[];
}

/**
 * Response from `client.analytics.getOverview()`.
 *
 * Each `*Change` field is the delta against the preceding window of the same
 * length, not a percentage of the current one.
 */
export interface AnalyticsOverview {
  /** Conversations in the window. */
  totalConversations: number;
  /** Change in conversations against the preceding window. */
  totalConversationsChange: number;
  /** Messages in the window. */
  totalMessages: number;
  /** Change in messages against the preceding window. */
  totalMessagesChange: number;
  /** Distinct users in the window. */
  totalUniqueUsers: number;
  /** Change in unique users against the preceding window. */
  totalUniqueUsersChange: number;
  /** Spend in the window, in USD. */
  totalCostUsd: number;
  /** Change in spend against the preceding window. */
  totalCostChange: number;
  /** Token totals for the window. */
  tokenUsage: AnalyticsTokenUsage;
  /** Daily series for each headline metric. */
  timeSeries: AnalyticsTimeSeries;
  /** Conversations broken down by channel. */
  byChannel: AnalyticsBreakdownEntry[];
  /** Conversations broken down by deployment. */
  byDeployment: AnalyticsBreakdownEntry[];
  /** Conversations broken down by model. */
  byModel: AnalyticsBreakdownEntry[];
}

/** Query parameters accepted by `client.analytics.getOverview()` and `exportCsv()`. */
export interface AnalyticsOverviewParams {
  /** Reporting window, e.g. `"7d"`. */
  timePeriod?: string;
  /** Restrict to one deployment. */
  deploymentId?: string;
}

// ============================================================================
// Feedback
// ============================================================================

/** One row of `client.analytics.listFeedback()`. */
export interface FeedbackEntry {
  /** Feedback UUID. */
  id: string;
  /** Rating the user gave. */
  score: number;
  /** Free-text comment, or `null` when the user left none. */
  comment: string | null;
  /** Text of the message the feedback is about. */
  messageContent: string;
  /** UUID of the message the feedback is about. */
  messageId: string;
  /** Agent display name, or `null` when the agent is gone. */
  agentName: string | null;
  /** Deployment display name, or `null` when the deployment is gone. */
  deploymentName: string | null;
  /** UUID of the chat the message belongs to, or `null`. */
  chatId: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Query parameters accepted by `client.analytics.listFeedback()`. */
export interface ListFeedbackParams {
  /** Reporting window, e.g. `"7d"`. */
  timePeriod?: string;
  /** Restrict to one deployment. */
  deploymentId?: string;
  /** Restrict to one rating. */
  score?: number;
  /** Case-insensitive keyword filter on the feedback comment text. */
  search?: string;
  /** Page number (1-based). */
  page?: number;
  /** Items per page. */
  limit?: number;
}
