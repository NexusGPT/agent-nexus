import { DOCS_FEED_DEFAULT_TIMEOUT_SECONDS } from "./_shared/feeds";

/** `nexus docs --help`, after the generated usage block. */
export const DOCS_HELP = `
Examples:
  $ nexus docs                                        # Show doc links
  $ nexus docs --index                                # Fetch page index
  $ nexus docs --full                                 # Fetch full docs (large)
  $ nexus docs search "how to deploy to WhatsApp"     # Semantic search
  $ nexus docs search "creating agents" --limit 10

Notes:
  --full and --index read the llms.txt feeds from the API HOST, so they follow
  --base-url / --profile / NEXUS_BASE_URL / NEXUS_ENV like every other command.
  The browsable doc links printed by a bare "nexus docs" are on the DASHBOARD
  host, which is a different host and follows NEXUS_DASHBOARD_URL.
  --full is large (megabytes). Redirect it rather than reading it in a pager.
  The global --timeout <seconds> applies to these fetches; without it they wait
  ${DOCS_FEED_DEFAULT_TIMEOUT_SECONDS}s. On a slow link --full is the one that
  needs raising.
  --full and --index need NO API key. They read public files. Only
  "nexus docs search" authenticates.
  A feed answering 200 with HTML is a MISCONFIGURED BASE URL pointing at the
  dashboard, not at the API — this command refuses it rather than printing the
  web page as if it were documentation.`;
