import type { PromptAssistantThreadResponse } from "@agent-nexus/sdk";

/** The `get-thread` record shape, shared by the plain read and the `--wait` read. */
export const GET_THREAD_FIELDS = [
  { key: "threadId", label: "ID" },
  { key: "status", label: "Status" },
  // How long it has been in that status, measured by the SERVER. `status` alone
  // cannot tell a generation that started two seconds ago from one that has been
  // running forty minutes, and that gap is what NEX-2524 was filed about.
  { key: "progress", label: "Progress" },
  { key: "messages", label: "Messages" },
  { key: "promptResult", label: "Prompt Result" }
] as const satisfies readonly { key: keyof PromptAssistantThreadResponse; label: string }[];
