/**
 * The `--help` prose for `nexus workspace credential-process`, byte for byte as
 * the registrar carried it.
 */
export const WORKSPACE_CREDENTIAL_PROCESS_HELP = `
Examples:
  $ nexus workspace credential-process 0123456789abcdef --check

Notes:
  YOU DO NOT RUN THIS. A direct-engine mount writes a credential_process line
  into its own AWS config, and rclone's AWS SDK runs this command through it
  on the first S3 request at or after the expiry the previous run reported.
  STDOUT IS ONE JSON DOCUMENT FOR THE SDK — the AWS process-credentials shape,
  never a table — and every diagnostic goes to stderr.
  IT RENEWS ONLY WHEN THE STORED ACCESS IS INSIDE FIVE MINUTES OF EXPIRY.
  Otherwise it prints the stored triplet, with an Expiration five minutes
  early so an upload in flight finishes on access that is still valid.
  A RENEWAL ACTS ON THE PROFILE AND ORGANIZATION PINNED AT MOUNT TIME, read
  from the mount's own session file. "nexus auth use-org" or an exported
  NEXUS_ORGANIZATION_ID after mounting cannot re-point a live drive; a fresh
  "nexus auth login" under the same profile name heals it on the next click.
  IT REFUSES A RENEWAL IT MUST NOT SERVE: a lower grade than the mount was
  made with (a read credential under a read-write drive lets a save succeed
  locally and vanish at upload), or a different workspace behind the same
  slug. Both exit non-zero and name the fix.
  AFTER A FAILURE IT REFUSES FOR 30 SECONDS WITHOUT ASKING NEXUS, so a Finder
  poll on a broken drive is not a storm of requests. The outcome of every
  renewal is recorded for "nexus workspace status" before this command exits;
  when that record cannot be written, stderr says so and a renewed lease is
  still served.
  ON macOS THE ok→failed AND failed→ok TRANSITIONS POST A NOTIFICATION, at most
  once per ten minutes for the same state.
  --check READS THE SESSION AND THE AWS CONFIG AND EXITS 0 WHEN THE REFRESH
  PATH IS USABLE, NON-ZERO WHEN IT IS NOT. It prints no credential value on
  either channel.`;
