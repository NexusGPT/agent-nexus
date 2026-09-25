/**
 * The environment an install step's child process runs under: `brew`,
 * `sudo installer`, `unzip`. An ALLOW-list, not a deny-list: the child gets
 * the names below and nothing else, so a secret the CLI reads tomorrow can
 * never reach an installer, because nobody has to remember to strip it. The
 * cost runs the other way — a name an installer needs that is missing here
 * fails LOUDLY on that machine — and the one family that bites is the proxy
 * one, so it is listed.
 *
 * Why not the deny-list rclone uses (`secret-free-env.ts`): rclone reads a
 * wide, vendor-defined set and its renewal helper inherits from it, so that
 * list is production-proven and left alone. The installers are three known
 * programs with a knowable need.
 */
const INSTALLER_KEYS = [
  // to run at all, and for sudo to prompt on the user's terminal
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "TMPDIR",
  // locale and clock: brew warns without them, some installers refuse
  "LANG",
  "TZ",
  // corporate networks: without these the download fails behind a proxy
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR"
] as const;

/** `LC_*` is the rest of the locale; `HOMEBREW_*` is the user's own brew configuration. */
const INSTALLER_KEY_PREFIXES = /^(LC_|HOMEBREW_)/;

/**
 * A brew setting that is itself a credential (`HOMEBREW_GITHUB_API_TOKEN`)
 * stays out: an install from a release asset needs no API token, and the
 * same bag reaches `sudo installer` and `unzip`, which need no brew setting.
 */
const CREDENTIAL_SHAPED = /TOKEN|SECRET|PASSWORD/;

export function installerEnvFor(inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(inherited)) {
    const listed = INSTALLER_KEYS.some((allowed) => allowed === key);
    const prefixed = INSTALLER_KEY_PREFIXES.test(key) && !CREDENTIAL_SHAPED.test(key);
    if (listed || prefixed) env[key] = value;
  }
  // Keeps `brew install` from running `brew update` first, which can take
  // minutes on a stale tap and prints nothing the person asked for.
  return { ...env, HOMEBREW_NO_AUTO_UPDATE: "1" };
}
