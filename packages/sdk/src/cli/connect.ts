#!/usr/bin/env node
import { exec } from "child_process";

import { NexusClient } from "../client";
import type { ConnectToolOAuthResponse } from "../types/tool-connection";

async function main() {
  const toolId = process.argv[2];
  const service = process.argv[3];

  if (!toolId || !service) {
    console.error("Usage: nexus-connect <toolId> <service>");
    console.error("Example: nexus-connect tool-123 GOOGLE_SHEETS");
    process.exit(1);
  }

  const client = new NexusClient();

  console.log(`Connecting tool ${toolId} with service ${service}...`);

  const result = await client.toolConnection.connect(toolId, {
    authType: "oauth",
    service
  });

  if (!("authorizationUrl" in result)) {
    console.log("Credential created directly:", result);
    return;
  }

  const oauthResult = result as ConnectToolOAuthResponse;

  console.log(`\nOpening browser for authentication...`);
  console.log(`URL: ${oauthResult.authorizationUrl}\n`);

  // Open browser (macOS)
  exec(`open "${oauthResult.authorizationUrl}"`);

  console.log("Waiting for authentication to complete...");
  const status = await client.toolConnection.waitForConnection(oauthResult.handshakeId, {
    timeoutMs: 5 * 60 * 1000,
    intervalMs: 2000
  });

  if (status.status === "COMPLETED") {
    console.log(`\nSuccess! Connection ID: ${status.connectionId}`);
  } else {
    console.error(`\nFailed: ${status.status} - ${status.errorMessage}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
