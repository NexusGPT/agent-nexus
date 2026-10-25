/** The errno string (`EPERM`, `ENOENT`, …) a thrown Node system error carries, or undefined when it carries none. */
export function errnoOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
