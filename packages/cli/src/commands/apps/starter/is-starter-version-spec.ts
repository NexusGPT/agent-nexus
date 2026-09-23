/** Exact semver or `latest` — the only spellings the endpoint accepts. */
const STARTER_VERSION_SPEC =
  /^(latest|(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?)$/;

export function isStarterVersionSpec(value: string): boolean {
  return STARTER_VERSION_SPEC.test(value);
}
