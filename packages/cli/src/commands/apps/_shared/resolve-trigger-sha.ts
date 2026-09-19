/** Validate the trigger sha client-side for a clear message before the request. */
export function resolveTriggerSha(raw: string, flag = "--sha"): string {
  const sha = raw.trim();
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    // Named by the caller, because two verbs take a sha under two different
    // flags. Telling someone who typed `--to` that their `--sha` is invalid
    // sends them looking for a flag they never used.
    throw new Error(`Invalid ${flag} "${raw}". Expected 7–40 hexadecimal characters.`);
  }
  return sha;
}
