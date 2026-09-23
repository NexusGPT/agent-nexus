/**
 * Expand a bare branch name to the fully-qualified ref the contract requires.
 *
 * `--ref main` is what a person types and `refs/heads/main` is what the schema
 * accepts, so without this the ordinary invocation is refused by a Zod message
 * about a regex — which is precisely the class of "the platform knows and will
 * not say" defect this command exists to close.
 *
 * Anything already qualified is passed through untouched, which is also how a
 * TAG is reached: `refs/tags/v1.0`. A bare name is assumed to be a branch,
 * because a bare name is a branch in every other git command a caller has just
 * run.
 */
export function qualifyRefName(ref: string): string {
  const trimmed = ref.trim();
  return trimmed.startsWith("refs/") ? trimmed : `refs/heads/${trimmed}`;
}
