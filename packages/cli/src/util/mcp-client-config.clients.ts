/** The MCP hosts `nexus mcp install` can write a block for. */
export const MCP_CLIENTS = ["claude-code", "claude-desktop", "cursor"] as const;

export type McpClient = (typeof MCP_CLIENTS)[number];
