/**
 * Appended to `nexus role coverage`: which inputs actually produce the figure.
 *
 * `job-model-does-not-move-coverage.ts` carries the two-cost-model background
 * this note is the positive half of.
 */

/**
 * Appended to `nexus role coverage`.
 *
 * The Notes block already there is correct and stays — it explains how to read
 * the discriminant and that the permission is necessary and not sufficient. It
 * is simply silent on which inputs produce the figure, which is the one thing
 * the reporter needed and the one thing no surface told him.
 *
 * The absence of the two writes is stated as a REFUSAL with its reason, not as
 * a gap. A caller who reads "not supported yet" retries next release; a caller
 * who reads why it will not be there goes to the dashboard.
 */
export const COVERAGE_INPUTS_NOTE = `
  THREE ROWS PRODUCE THIS FIGURE. The Role's WORKLOAD, which is the
  person-hours it works in a year and is the denominator. Each held system's
  IMPACT model, which is the person-hours that system gives back and is one
  term of the numerator. And the organization's AUTOMATION SETTINGS —
  hours a day, days a week, weeks a year, currency.

  ONE MORE THING MOVES IT, AND IT IS NOT A MODEL: each system's LIFECYCLE.
  Only a system that is LIVE is summed into the numerator and into the money
  totals. A system that is BUILDING or RETIRED still reports its own hours on
  its own row — what it will save, or used to — and is outside every total.
  So "coverage" here means LIVE coverage: work that is being saved today, not
  work that has been modelled. Every system starts LIVE unless the Role's
  system policy sets startPaused.

  THE LIFECYCLE IS WRITABLE THROUGH THIS API, unlike the two models above, with
  "nexus role set-system-lifecycle". It moves this figure in both directions and
  touches no model: into LIVE adds the system's hours and money to the totals,
  out of LIVE removes them. Re-read this command afterwards — nothing in the
  write's own output reports what it did to the figure.

  ONLY THE LAST OF THE THREE IS WRITABLE THROUGH THIS API, with
  "nexus role set-automation-settings". The workload and the per-system impact
  are authored in the dashboard, on the Role's General tab. Their routes are
  absent from the public API deliberately and not by omission: they are the only
  writes that move a published labour-cost figure, and they are not shipped over
  a contract no client has ever sent.

  So the Scope, the job types, the variables and the working year do NOT move
  this figure. They are the second cost model, and they are evaluated in the
  browser.`;
