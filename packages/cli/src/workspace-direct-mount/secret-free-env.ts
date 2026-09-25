/** Inherited keys rclone must not see, beyond every `AWS_*` and `RCLONE_*`. */
export const STRIPPED_ENV_KEYS = [
  "NEXUS_API_KEY",
  "NEXUS_ADMIN_TOKEN",
  "NEXUS_PROFILE",
  "NEXUS_ORGANIZATION_ID"
] as const;

/**
 * The user's environment with the keys rclone must not see removed: a
 * DENY-list, kept because rclone reads a wide, vendor-defined set and its
 * renewal helper inherits from it, so the list is production-proven. The
 * installers use the opposite shape (`installer-env.ts`, an allow-list).
 *
 * `AWS_*` and `RCLONE_*` go because a static key or a leftover endpoint in the
 * shell outranks what the mount configures and would sign or point the drive
 * wrongly while looking healthy. The `NEXUS_*` selectors and tokens go because
 * they are the user's identity and rclone needs none of them: it renews
 * through `credential_process`, which reads its pins from the session file.
 * Everything else — PATH, HOME, the locale — stays, because rclone and the
 * helper need it to run.
 */
export function secretFreeEnv(inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(inherited)) {
    if (/^(AWS|RCLONE)_/.test(key)) continue;
    if (STRIPPED_ENV_KEYS.some((stripped) => stripped === key)) continue;
    env[key] = value;
  }
  return env;
}
