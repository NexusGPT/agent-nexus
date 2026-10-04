/** `nexus prompt-assistant get-thread` — the hand-written prose. */
export const PROMPT_ASSISTANT_GET_THREAD_HELP = `
Examples:
  $ nexus prompt-assistant get-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01
  $ nexus prompt-assistant get-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --json
  $ nexus prompt-assistant get-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --wait
  $ nexus prompt-assistant get-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --wait --wait-timeout 3600

Notes:
  --wait DOES THE POLLING FOR YOU. It blocks until status is completed, failed
  or cancelled — through "generating", which is where the minutes go — and exits
  non-zero on a timeout or a failed thread. This is the recovery path for a chat
  that was killed: recover the id with list-threads, then wait on it here.

  ⚠️ --wait ON A THREAD AWAITING YOUR ANSWER BLOCKS FOR THE FULL TIMEOUT. A
  thread whose assistant asked a question sits in_progress until you reply, and
  in_progress is not a state waiting ever leaves. Reply with
  "prompt-assistant chat --thread-id <id> --wait" instead.

  WITHOUT --wait THIS IS THE POLL. Generation is asynchronous, so re-run this
  command until status is completed, failed or cancelled — do not open a second
  thread and do not resend the message.
  promptResult IS ABSENT UNTIL status IS completed. Its absence is "not ready",
  never "no prompt was produced".

  --wait MOVES THE PATHS DOWN ONE LEVEL. Without it the document is the thread
  itself; with it the document is {thread, outcome, waitedMs} and the thread's
  own fields are under .thread. outcome is terminal, assistant-replied,
  generating or timed-out — the same verdict the exit code carries, readable
  without inspecting $?.

  THE SHAPE, read from the top level without --wait and from .thread with it:
    thread          {threadId, status, messages, promptResult}
    messages[]      {role, content, timestamp}   role is "user" or "assistant"
    promptResult    {prompt, name, description, …}
  name and description are what a caller fills "agent create --first-name /
  --description" or "task create --name / --description" with; prompt is the
  prompt itself. THE REST OF promptResult DEPENDS ON THE MODE THE THREAD WAS
  OPENED WITH, and reading for the wrong one gets undefined rather than an error.

  🚨 --mode agent AND --mode ai-task PRODUCE DIFFERENT prompt FORMATS. Both are
  used verbatim and neither is ever JSON.parse'd, but they are not interchangeable:
    agent     NEXUS SECTION MARKUP, NOT PROSE MARKDOWN. It opens
              ::: section: name="…", deploymentSpecific=false, readonly=false,
              hidden=false, defaultConfig=false :::
              then ::: tab: NEXUS :::, and it may carry {{firstName}}-style
              placeholders. Those directives ARE the agent prompt format — send
              the string unchanged to "nexus agent create/update --prompt";
              stripping them flattens every section and tab into one blob.
              This mode also returns agentFields and promptJson.
    ai-task   PLAIN PROSE, with no directives at all — the model's text as
              written. This mode instead returns input and output, each
              {type: "json"|"text", schema?}, which is what "task create"
              --expected-input / --expected-output and the JSON schemas want.

  The thread id is a UUID; lost ones are recovered with
  "prompt-assistant list-threads".`;
