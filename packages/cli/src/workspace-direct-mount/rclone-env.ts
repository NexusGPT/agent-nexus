import { awsProfileFor } from "./mount-id";
import { secretFreeEnv } from "./secret-free-env";

export interface RcloneEnvInput {
  readonly inherited: NodeJS.ProcessEnv;
  /** The `aws.config` this mount wrote — `sessionPathsFor(mountId).awsConfigFile`. */
  readonly awsConfigFile: string;
  readonly mountId: string;
  readonly region: string;
  readonly bucket: string;
  readonly prefix: string;
}

/**
 * The process environment rclone runs under on a direct mount.
 *
 * The inherited environment arrives through `secretFreeEnv`: every `AWS_*`
 * key is dropped there because a static `AWS_ACCESS_KEY_ID` in the user's
 * shell outranks `credential_process` in the SDK's chain and would sign the
 * mount with the wrong identity while looking healthy; every `RCLONE_*` key
 * for the same reason from the other side (an `RCLONE_S3_ENDPOINT` left over
 * from MinIO testing re-points the remote defined below at another host, and
 * an `RCLONE_S3_ACCESS_KEY_ID` outranks `env_auth`); and the three `NEXUS_*`
 * selectors because the helper reads its pins from the session file, and
 * rclone's environment is what the helper inherits.
 *
 * 🔴 STRIPPING THE ENVIRONMENT IS NOT ENOUGH, and the docblock used to claim it
 * was. rclone ALSO reads the user's own remotes from
 * `~/.config/rclone/rclone.conf` and MERGES them with these BY NAME. A user who
 * happens to have a remote called `nxs3` — the name is ours, so the collision is
 * ours — contributes their own `access_key_id`, and rclone's s3 backend honours
 * `env_auth` only while that key is BLANK. Observed against the real bucket:
 * with such a file the mount answers `InvalidAccessKeyId`; with `RCLONE_CONFIG`
 * pointed away it lists normally. So the config file is pointed at nothing, and
 * the remotes below are the only ones this process has.
 *
 * The BUCKET lives here and nowhere on a command line: the remote rclone is
 * pointed at is the alias `nxws:`, which resolves to `nxs3:<bucket>/<prefix>`
 * only inside this environment, readable by the owning user alone.
 *
 * `no_check_bucket` is load-bearing, not tuning: the session policy allows
 * ListBucket only under the mount's prefix, so the HeadBucket rclone would
 * otherwise issue at startup is denied and the mount fails before its first
 * listing.
 */
export function rcloneEnvFor(input: RcloneEnvInput): NodeJS.ProcessEnv {
  return {
    ...secretFreeEnv(input.inherited),
    AWS_CONFIG_FILE: input.awsConfigFile,
    AWS_PROFILE: awsProfileFor(input.mountId),
    AWS_SHARED_CREDENTIALS_FILE: "/dev/null",
    AWS_EC2_METADATA_DISABLED: "true",
    // The user's own remotes merge by NAME, and `nxs3` is a name we chose.
    RCLONE_CONFIG: "/dev/null",
    RCLONE_CONFIG_NXS3_TYPE: "s3",
    RCLONE_CONFIG_NXS3_PROVIDER: "AWS",
    RCLONE_CONFIG_NXS3_ENV_AUTH: "true",
    RCLONE_CONFIG_NXS3_REGION: input.region,
    RCLONE_CONFIG_NXS3_NO_CHECK_BUCKET: "true",
    RCLONE_CONFIG_NXWS_TYPE: "alias",
    RCLONE_CONFIG_NXWS_REMOTE: `nxs3:${input.bucket}/${input.prefix}`
  };
}
