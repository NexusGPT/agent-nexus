/**
 * Appended to `nexus custom-model create`: why the endpoint flags are not named
 * --base-url/--api-key, that a 201 means stored and never "works", and which
 * surfaces each protocol can run on.
 *
 * Extracted so `registerCustomModelCreateCommand` stays inside the 80-line
 * per-function cap — the command declares two mandatory options through
 * `satisfiedByBodyField`, each carrying the reasoning that forced its name. The
 * prose is published help, so it moves as one block and is never trimmed to fit
 * a number.
 */

export const CREATE_NOTES = `
Examples:
  $ nexus custom-model create --display-name "My LLaMA" --model-name llama-3-70b \\
      --endpoint-url https://api.example.com/v1 --endpoint-key sk-xxx
  $ nexus custom-model create --display-name "Staging LLaMA" --model-name llama-3-70b \\
      --endpoint-url https://api.example.com/v1 --endpoint-key sk-xxx --enabled false
  $ nexus custom-model create --body '{"displayName":"My Model","modelName":"gpt-4","baseUrl":"https://api.example.com/v1","apiKey":"sk-xxx"}'

Notes:
  --endpoint-url AND --endpoint-key DESCRIBE THE MODEL PROVIDER, NOT NEXUS. They
  fill the body's baseUrl and apiKey. The global --base-url and --api-key point
  the CLI at a Nexus environment and are a different thing entirely; passing the
  provider's values there sends this CLI's own authenticated request to the
  provider's host, carrying the provider key as the Nexus key.

  A 201 MEANS STORED, NEVER "WORKS". Nothing contacts the endpoint while the
  model is created — no reachability probe, no auth check, no test completion.
  An unreachable baseUrl and a dead apiKey both create cleanly and surface only
  when an agent or a task first runs on the model, as an inference failure far
  from this command. Prove it yourself before pointing anything at it, and use
  --enabled false to keep it out of reach until you have.

  CREATING IT ATTACHES IT TO NOTHING. The id this returns is what selects it,
  through the --custom-model-id flag on "nexus agent create", "nexus agent
  update", "nexus task create" and "nexus task update". Each of those commands
  documents its own rules for the flag; on agent update it needs --model-name
  and --model-provider beside it.
  "nexus model list" also shows the row while it is ENABLED, with provider
  "CUSTOM_<PROTOCOL>" and modelId "custom:<uuid>". Neither string is an input,
  and a custom model is selected by this id alone. A DISABLED model is filtered
  out of that listing and is still here, and still attachable — attaching is a
  configuration act; the refusal for a disabled endpoint lands at inference.

  --protocol DECIDES WHICH SURFACES CAN RUN IT. Agents serve openai, anthropic
  and google. AI tasks serve "openai" only, because their providers are shared
  singletons that would have to cache your key: "nexus task create
  --custom-model-id" refuses the other two with a 400 naming the protocol, and
  the executor refuses again if the protocol changes after a task is attached.
  Pick openai if the model has to run inside a task.`;
