/** An unknown throw as the one line a refusal or a warning can carry. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
