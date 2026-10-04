/** `nexus chat` — the namespace epilogue. */
export const CHAT_HELP = `
The browser chat surface, in two hops:

  1. A SERVER mints a short-lived, deployment-scoped session token with the
     organization API key ("nexus chat session").
  2. A BROWSER holds that token and streams turns with it. The API key never
     reaches the browser.

"nexus chat send" performs both, so one command demonstrates the whole shape.
The stream is the Vercel AI SDK 7 UI Message Stream format, which is what makes
a stock useChat() work against this API with no configuration.

  nexus chat session <deployment-id>        →  mint a token for a browser
  nexus chat send <deployment-id> -m "..."  →  mint + stream one turn

A turn is not only started. These three are the rest of a real chat client, and
each takes the SAME session token, so a browser can reach all of them:

  nexus chat stop <deployment-id>           →  the Stop button
  nexus chat status <deployment-id>         →  is a turn still running
  nexus chat resume <deployment-id>         →  reattach after a drop or a reload

Each needs the conversation named, by --session-token or by --chat-id. Stopping
reports that the stop was ACCEPTED, never that it has taken effect; "status" is
where "outcome": "stopped" appears.`;
