import type { BaseUrlSelection } from "./config";

/** Each host flag and the selection field it fills. */
const FLAGS: readonly (readonly [string, keyof BaseUrlSelection])[] = [
  ["--base-url", "override"],
  ["--region", "region"]
];

/**
 * The bridge's host flags, read off its own argv: `--base-url <url>` and
 * `--region <eu|us>`, each also accepted as `--flag=value`.
 *
 * Deliberately narrow. The bridge has no option parser and its default command
 * starts on ANY argv — a host configured to run `nexus-mcp` with stray
 * arguments must keep getting a server — so this reads the two flags it knows
 * and ignores everything else, exactly as before. A flag given with no value is
 * refused, because silently dropping `--region` would send the bridge to the
 * default deployment while the host's config names another.
 *
 * Validating the region NAME is not done here: `resolveBaseUrlWithSource` owns
 * that, so the refusal is one message whichever way the name arrived.
 */
export function parseHostArgs(args: readonly string[]): BaseUrlSelection {
  const selection: BaseUrlSelection = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    for (const [flag, key] of FLAGS) {
      if (arg === flag) {
        const value = args[i + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`${flag} needs a value.`);
        }
        selection[key] = value;
        i++;
      } else if (arg.startsWith(`${flag}=`)) {
        const value = arg.slice(flag.length + 1);
        if (value === "") throw new Error(`${flag} needs a value.`);
        selection[key] = value;
      }
    }
  }
  return selection;
}
