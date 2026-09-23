/**
 * Workspace bucket names as `workspace-bucket-name.ts` spells them:
 * `nxw-<env>-<12 hex>` for an organization, `nxw-<env>-shared` for the platform
 * bucket. rclone's log names the bucket in every S3 error, so a log line is
 * passed through here before it is shown to anyone.
 */
const BUCKET_NAME_RE = /\bnxw-(?:p|s|d)-(?:[0-9a-f]{12}|shared)\b/g;

export function redactBucketNames(text: string): string {
  return text.replace(BUCKET_NAME_RE, "<bucket>");
}
