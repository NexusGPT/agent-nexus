export function dockerfile(...lines: readonly string[]): string {
  return lines.join("\n");
}

export const MANIFEST_COPY = "COPY package.json package-lock.json ./";
