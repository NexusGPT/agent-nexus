/** `--currency EUR` or `--currency none`, which clears it. */
export function readNullableString(raw: string): string | null {
  return raw === "none" || raw === "null" ? null : raw;
}
