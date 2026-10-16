// ---------------------------------------------------------------------------
// Profile name validation
// ---------------------------------------------------------------------------

/**
 * What a profile name may be.
 *
 * `mount-registry.key.ts` and `commands/workspace-unmount.test.ts` both cite this
 * pattern, because an org id like `org_a1b2c3` satisfies it — which is why a
 * registry key cannot be told apart from a profile name by shape alone.
 */
const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Validate a profile name. Returns null if valid, or an error message. */
export function validateProfileName(name: string): string | null {
  if (!PROFILE_NAME_RE.test(name)) {
    return (
      `Invalid profile name "${name}". ` +
      "Use lowercase letters, numbers, hyphens, underscores (max 32 chars, must start with alphanumeric)."
    );
  }
  return null;
}

/** Slugify a string into a valid profile name. */
export function slugifyProfileName(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "default"
  );
}
