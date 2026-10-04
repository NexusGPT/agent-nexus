import type { WaitForThreadResult } from "@agent-nexus/sdk";

/** The one document a wait produces, on every outcome including the timeout. */
export function waitDocument(result: WaitForThreadResult): Record<string, unknown> {
  const { thread } = result;
  const lastAssistant = [...(thread.messages ?? [])].reverse().find((m) => m.role === "assistant");
  return {
    threadId: thread.threadId,
    status: thread.status,
    response: lastAssistant?.content ?? "",
    ...(thread.promptResult ? { promptResult: thread.promptResult } : {}),
    ...(result.outcome === "timed-out" ? { timedOut: true } : {})
  };
}
