/**
 * WHAT A FAILURE LOOKS LIKE — the exit-code taxonomy, as published.
 *
 * 🚨 THIS TEXT IS A CHECKED CLAIM ABOUT THE CODE, NOT A DESCRIPTION OF IT. It
 * said "EVERY failure exits 1" while three other maps in the same binary
 * produced 2, 3, 5, 6 and 130; a published promise nothing checks is how that
 * survived. `exit-code-taxonomy.test.ts` now reads the composed epilogue and
 * refuses a category whose number this block does not name, so adding an exit
 * code without a line here is a red build.
 */
export const ROOT_EPILOGUE_FAILURE = `  FAILURE
    EVERY failure exits NON-ZERO, and the value NAMES THE CATEGORY:
      1  failed — no more specific category applies
      2  not authenticated      3  permission denied      4  not found
      5  invalid input          6  the server failed      7  could not connect
      8  timed out              9  a local operation failed
      10 the operation ran and the outcome did not happen (retrying is the trap)
      11 the operation ran and the result COULD NOT BE MEASURED
      130 interrupted (128 + 2 — the shell's number, not ours). ONLY
          "apps logs --follow" emits it, and only on the SECOND signal;
          the first Ctrl-C ends that follow at 0.
    Under --json an error is a JSON document on STDOUT:
    {"error":{"message","hint","code"}}, all three keys ALWAYS present, hint null
    when there is none. Without --json the code is printed dim in brackets after
    the message.
    THE EXIT CODE IS THE CATEGORY; THE CODE FIELD IS THE CONDITION. Branch on $?
    to decide whether to RETRY, on the code to decide WHAT to say. An API
    refusal's own name comes through unchanged (NODE_IS_TRIGGER,
    WORKFLOW_ALREADY_PUBLISHED, …); a refusal the API sent without one falls
    back to HTTP_<status>; and a CLI_ prefix means the
    failure never reached the server at all. Match on the code, never on the
    message, which is prose and gets rewritten.
    --timeout IS CLIENT-SIDE. Hitting it means this CLI stopped waiting; THE
    SERVER MAY STILL BE COMPLETING THE REQUEST. Never retry a write on a timeout
    without checking whether the first one landed.
    A 2xx IS NOT ALWAYS THE THING HAPPENING. Several commands accept and discard
    input, or file a request instead of acting. Where that is true the command's
    own Notes say so and name the verification step — run it.`;
