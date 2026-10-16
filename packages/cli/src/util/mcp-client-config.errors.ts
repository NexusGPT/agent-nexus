/** What the merge refuses, and the repair each refusal names. */

export class McpConfigConflictError extends Error {
  constructor(name: string, configPath: string) {
    super(
      `"${name}" is already configured in ${configPath}. ` +
        `Pass --force to replace it, or --name <other> to add a second entry.`
    );
    this.name = "McpConfigConflictError";
  }
}

export class McpConfigUnreadableError extends Error {
  constructor(configPath: string, cause: string) {
    super(
      `${configPath} exists and is not valid JSON (${cause}). ` +
        `Fix or move it — refusing to overwrite a file this command cannot read.`
    );
    this.name = "McpConfigUnreadableError";
  }
}
