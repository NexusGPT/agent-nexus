/**
 * THE TWO RESPONSE HEADERS THAT SAY A ROUTE IS GOING AWAY.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A SEPARATE MODULE AND NOT TWO LINES IN `http-client.ts`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The same reason `retry-policy.ts` sits beside the transport: the DECISIONS are
 * pure and the transport is not. Reading two headers and turning them into dates
 * needs no client, no credential and no network, so it is testable on its own and
 * the transport keeps one job — noticing, and handing the record on.
 *
 * ── THE TWO VALUES ARE TWO DIFFERENT SYNTAXES. THIS IS THE TRAP ─────────────
 *
 * They look like a pair and parse like strangers:
 *
 *   Deprecation: @1788048000                       RFC 9745 §2 — an RFC 8941
 *                                                  structured-field Date: `@`
 *                                                  then Unix SECONDS.
 *   Sunset: Sat, 28 Nov 2026 00:00:00 GMT          RFC 8594 — an RFC 7231
 *                                                  IMF-fixdate.
 *
 * `new Date("@1788048000")` is `Invalid Date`, so a single parser handling "the
 * date headers" gets one of the two wrong on every real response — and gets it
 * wrong SILENTLY, because an unparseable value degrades to "no date" rather than
 * to an error. Hence two named parsers and a raw value kept beside each date.
 *
 * 🚨 `Deprecation: true` IS THE OBSOLETE SPELLING FROM THE EXPIRED DRAFT AND IS
 * NOT ACCEPTED AS A DATE. It is still a deprecation signal — the header is
 * PRESENT — so the notice fires and carries the raw string with no date beside
 * it. Reporting the raw value is what keeps a server that speaks the old draft
 * visible instead of unparseable-and-therefore-silent.
 *
 * ── THE SIGNAL IS ONE-DIRECTIONAL. NEVER CACHE AN ABSENCE ───────────────────
 *
 * 🔴 A RESPONSE WITHOUT THESE HEADERS IS NOT EVIDENCE THAT ITS ROUTE IS FINE.
 * Nest resolves guards BEFORE it writes a handler's `@Header()` values
 * (`@nestjs/core/router/router-execution-context.js` — `fnCanActivate` is
 * awaited ahead of `responseController.setHeaders`), so a 401 from an expired
 * key and a 429 from the throttler answer with NEITHER header while the route
 * behind them is deprecated. So nothing here records a negative, and no consumer
 * should: "no notice" means "this response said nothing", never "this route is
 * current".
 */

/**
 * The header name, as RFC 9745 spells it.
 *
 * Looked up through a WHATWG `Headers`, whose `get` is case-INSENSITIVE, so the
 * casing here is documentation rather than a protocol requirement — the same
 * reason `res.headers.get("Retry-After")` works against servers that send
 * `retry-after`.
 */
export const DEPRECATION_HEADER = "Deprecation";

/** The header name, as RFC 8594 spells it. Case-insensitive on the wire. */
export const SUNSET_HEADER = "Sunset";

/**
 * What one response said about its own route's retirement, handed to
 * {@link HttpClientOptions.onDeprecation}.
 *
 * A record rather than a formatted string, for the same reason {@link RetryNotice}
 * is one: this SDK must not decide where the notice goes. The CLI renders it on
 * stderr — never stdout, where it would corrupt the single JSON document
 * `--json` promises — and a library consumer may want a metric, a log line, or a
 * banner in their own UI.
 *
 * Both raw values are carried VERBATIM beside their parsed forms. The parse can
 * fail — a server speaking the expired draft, a malformed date, a future
 * structured-field type — and when it does the raw string is the only thing left
 * that is true, so it is the thing a consumer can still show a human.
 */
export interface DeprecationNotice {
  /** HTTP method of the request whose response carried the signal. */
  method: string;
  /** Absolute URL of that request, query string included. */
  url: string;
  /** The `Deprecation` value verbatim (trimmed), or `undefined` when absent. */
  deprecation: string | undefined;
  /** The `Sunset` value verbatim (trimmed), or `undefined` when absent. */
  sunset: string | undefined;
  /** `Deprecation` parsed, or `undefined` when absent or unparseable. */
  deprecatedAt: Date | undefined;
  /** `Sunset` parsed, or `undefined` when absent or unparseable. */
  sunsetAt: Date | undefined;
}

/**
 * An RFC 8941 structured-field Date: `@` then a bare integer of Unix SECONDS.
 *
 * `-?` because the grammar permits a negative integer. A fractional value is
 * refused rather than truncated: `@1788048000.5` is not an sf-date, and
 * accepting it would report a date the server did not state.
 */
const SF_DATE = /^@(-?\d+)$/;

/** A header value with nothing in it, which is not a signal. */
function presentValue(raw: string | null | undefined): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Parse a `Deprecation` value as the structured-field Date it is supposed to be.
 *
 * Returns `undefined` for anything else — `true`, an IMF-fixdate, an sf-date
 * with a type this does not know. Never throws: an observer that can throw is an
 * observer that can fail the request it is observing.
 */
export function parseDeprecationHeader(raw: string | null | undefined): Date | undefined {
  const value = presentValue(raw);
  if (value === undefined) return undefined;

  const match = SF_DATE.exec(value);
  if (match === null) return undefined;

  const seconds = Number(match[1]);
  // `Number` on a long digit run loses precision rather than failing, and
  // `new Date` on a value past ±8.64e15 ms yields `Invalid Date`. Refuse both
  // here so the caller never receives a `Date` whose `getTime()` is `NaN`.
  if (!Number.isSafeInteger(seconds)) return undefined;

  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Parse a `Sunset` value as the RFC 7231 IMF-fixdate it is supposed to be.
 *
 * Delegates to `Date`, which accepts IMF-fixdate and a good deal more. Being
 * lenient is the right direction here: the value is shown to a human and used to
 * say how long they have, so a date this recognises is strictly better than the
 * raw string, and anything it does not recognise falls back to that raw string.
 */
export function parseSunsetHeader(raw: string | null | undefined): Date | undefined {
  const value = presentValue(raw);
  if (value === undefined) return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Read one response's retirement signal, or `undefined` when it carries none.
 *
 * `undefined` on NEITHER header, a notice on EITHER. The two are announced
 * independently — a route may be marked deprecated long before a sunset date is
 * chosen, and RFC 8594 permits a `Sunset` with no `Deprecation` beside it — so
 * requiring both would drop exactly the half-announced case a client most needs
 * to surface.
 *
 * Takes the `get` of a WHATWG `Headers` rather than the whole object, so the
 * dependency is one method and a test can hand it a real `Headers` built from
 * literal header names.
 */
export function readDeprecationNotice(
  method: string,
  url: string,
  headers: Pick<Headers, "get">
): DeprecationNotice | undefined {
  const deprecation = presentValue(headers.get(DEPRECATION_HEADER));
  const sunset = presentValue(headers.get(SUNSET_HEADER));

  if (deprecation === undefined && sunset === undefined) return undefined;

  return {
    method: method.toUpperCase(),
    url,
    deprecation,
    sunset,
    deprecatedAt: parseDeprecationHeader(deprecation),
    sunsetAt: parseSunsetHeader(sunset)
  };
}
