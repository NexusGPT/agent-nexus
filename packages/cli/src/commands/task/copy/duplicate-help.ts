/** Appended to `nexus task duplicate`. */
export const TASK_DUPLICATE_HELP = `
Examples:
  $ nexus task duplicate 11111111-1111-4111-8111-111111111111
  $ nexus task duplicate 11111111-1111-4111-8111-111111111111 --name "Assessor v2"
  $ nexus task duplicate 11111111-1111-4111-8111-111111111111 \\
      --name "Assessor (haiku)" --model-name claude-haiku-4-5 --model-provider ANTHROPIC

Notes:
  THIS IS THE COMMAND THE 409 ON "task create" RECOMMENDS, and until this release
  it did not exist — following that error's advice answered
  "error: unknown command 'duplicate'".

  IF THE ONLY DIFFERENCE YOU WANT IS THE MODEL, YOU PROBABLY WANT NO COPY AT ALL.
  "task execute --model-name ... --model-provider ..." runs the existing task on
  another model for that one call, and a workflow's aiTask node takes the same
  override. Two copies of one prompt drift: a rubric change then has to land
  twice, or the bulk path and the on-demand path quietly stop agreeing. Duplicate
  is for a prompt that is genuinely going to diverge.

  THE COPY IS THE SOURCE FOR EVERY FIELD YOU DO NOT NAME — prompt, both JSON
  schemas, few-shots, formats, folder and temperature — everything except the
  task's knowledge collections, which are a permission decision this command does
  not make and so leaves unattached on the copy. That is the difference
  from re-creating the variant with "task create", where a field you leave out
  takes THAT command's default instead: an unsent temperature becomes 0.7 however
  the original was tuned, and nothing reports the change.

  NAMING A MODEL CLEARS THE PROVIDER TUNING, exactly as "task update" does.
  thinkingLevel, thinkingDisplay, reasoningEffort and the rest are specific to a
  provider and a model generation, so they are rebuilt from what you send rather
  than carried across a model change; send them under --body to set them on the
  copy. Omit the model flags and the copy keeps the source's model config whole.

  --model-name AND --model-provider TRAVEL TOGETHER. One without the other is
  refused, because completing the pair from the source task is exactly the silent
  inheritance this command removes. Omit both to copy the source's model.

  A CUSTOM MODEL IS NOT INHERITED WHEN YOU NAME A MODEL. A BYOM endpoint replaces
  the routing outright, so a copy re-pointed at a platform model runs the platform
  model; pass --custom-model-id to point the copy at a custom endpoint instead.

  The copy is a NEW task with a new id, and no version history — versions belong
  to the task they were taken on.`;
