import { ANALYTICS_PUBLIC_VIEWS } from "./_shared/fold-list";

/**
 * `nexus analytics metrics --help`, the hand-written half.
 *
 * A module-level const rather than a template literal inside the registrar —
 * this package's own pattern for a multi-kilobyte help block, so the registrar
 * reads as wiring and the prose is editable without scrolling through a command
 * tree. `auth/`, `tracks/` and `document.ts` were written this way from the
 * start.
 */
export const ANALYTICS_METRICS_HELP = `
Examples:
  $ nexus analytics metrics conversations -m count -g agentId --period last_7_days
  $ nexus analytics metrics node_runs -m count -g nodeType -f status:eq:ERROR --json
  $ nexus analytics metrics generations -m sum:costUsd -g modelName --granularity day --order-by bucket

Views:
  ${ANALYTICS_PUBLIC_VIEWS}.

Notes:
  NOTHING HERE LISTS A VIEW'S COLUMNS, SO THE FIRST -m/-g IS A GUESS. Two ways
  to stop guessing. Run "nexus analytics query 'SELECT * FROM analytics_traces
  LIMIT 1' --json" — the response's "fields" array names every column of that
  view. Or pass --show-sql on any working call: the compiled statement names the
  physical table and each column it selected.

  --show-sql GOES TO STDERR, NOT STDOUT. So "--show-sql --json > out.json"
  leaves the SQL on your terminal and out.json a pure document. Redirect stderr
  (2>sql.txt) when you want to keep it.

  A WRONG COLUMN IS REFUSED BY NAME AND THE REFUSAL LISTS NOTHING. You get
  "<x> is not a dimension on view <v>" for -g, "<x> is not a measure on view
  <v>" for -m, or "<x> is not a column on view <v>" for a -f field — never the
  accepted set. Read it out of the view with the SELECT above.

  THE SAME EIGHT VIEWS ANSWER TO "analytics query" AS analytics_<view>. This
  command takes traces; that one takes analytics_traces, and each refuses the
  other's spelling.`;
