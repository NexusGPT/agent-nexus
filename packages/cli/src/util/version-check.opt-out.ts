function isEnvFlagSet(value: string | undefined): boolean {
  return !!value && value !== "0" && value.toLowerCase() !== "false";
}

/**
 * The automatic updater is off — via `NEXUS_NO_AUTO_UPDATE`, or implicitly in
 * CI, an environment where neither a global self-install nor an unasked-for
 * registry round trip is ever wanted.
 *
 * 🚨 THIS GOVERNS TWO SIDE EFFECTS, NOT ONE: the self-INSTALL and the version
 * LOOKUP. It used to gate only the install, and the lookup is the one a user
 * actually feels — `checkForUpdate` ran in the `else` branch of the same `if`,
 * so setting the variable moved the CLI from "install over yourself" to "make
 * the npm request anyway". Measured on 0.26.0: with `NEXUS_NO_AUTO_UPDATE=1`
 * and with `CI=1`, `registry.npmjs.org` was still contacted once per 24 h, at
 * ~300 ms warm and a 3 s ceiling with no egress.
 *
 * Read `checkForUpdate` in `version-check.check.ts` for where the second gate
 * now lives, and why it is inside this module rather than at the call site.
 */
export function isAutoUpdateDisabled(): boolean {
  return isEnvFlagSet(process.env.NEXUS_NO_AUTO_UPDATE) || isEnvFlagSet(process.env.CI);
}
