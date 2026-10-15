/** A dot-name: `.DS_Store`, `._x`, `.git`, `.env`. Skipped when walked, pushed when named. */
export function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}
