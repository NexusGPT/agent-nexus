/**
 * Read all data from stdin (for piped input).
 * Returns a promise that resolves to the full input string.
 */
export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8").trim()));
    process.stdin.on("error", reject);
    // If stdin is a TTY and nothing is piped, resolve immediately with empty
    if (process.stdin.isTTY) {
      resolve("");
    }
  });
}

/**
 * Resolve a flag value that may be "-" (read from stdin) or a file path.
 * If the value is "-", reads from stdin.
 * If the value is a file path, reads the file.
 * Otherwise returns the value as-is.
 */
export async function resolveInputValue(value: string): Promise<string> {
  if (value === "-") {
    return readStdin();
  }

  // Check if it looks like a file path
  try {
    const fs = await import("node:fs");
    if (fs.existsSync(value) && fs.statSync(value).isFile()) {
      return fs.readFileSync(value, "utf-8").trim();
    }
  } catch {}

  return value;
}
