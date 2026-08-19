#!/usr/bin/env python3
"""Read one leaf's stdout. Say whether it is JSON, and whether it carries a secret.

WHY THIS EXISTS, AND WHY IT IS NOT A DENYLIST
=============================================

`vibe git-credentials` returns this organisation's git push token. It takes no
input, exits 0 and emits clean JSON, so every rule that decides which leaves the
sweep may execute says yes to it. `sweep.sh` prints the first 100 characters of a
leaf's output into the CI log on failure, and that log is readable by anyone with
repository access.

That leaf is already fenced. `probe-barrier.ts` gives it a `third-party` barrier
and `probe-barrier.test.ts` fails the build if a barrier'd leaf is classified
`safe` -- verified by mutation, it reds with the leaf named.

*** THAT GATE PROTECTS THE INSTANCE AND NOT THE CLASS, and a NEVER-SWEEP denylist
would have had exactly the same shape. Both are TABLES SOMEBODY HAS TO REMEMBER
TO EXTEND, and `probe-barrier.ts`'s own header already says it cannot demand an
entry for a new leaf, because whether an act reveals a secret is not derivable
from a commander tree. So three things walk straight past a table:

  1. A NEW credential-returning leaf whose author never adds an entry.
  2. A leaf whose RESPONSE gains a token field later. No CLI source changes at
     all, so no table anywhere moves, and no review ever sees it.
  3. A leaf whose secret arrives nested inside a list nobody reads by hand.

This scanner derives its answer from THE BYTES THE COMMAND ACTUALLY RETURNED, so
none of the three can slip past it. It is the floor under the table, never a
replacement for it: the table still says a leaf must not RUN, which is better
than catching it after it ran.

WHAT IT FLAGS, AND WHAT IT DELIBERATELY DOES NOT
================================================

A STRING of MIN_SECRET_LENGTH characters or more, under a key that names a
secret, whose key does not end in a word that makes it metadata. All three
conditions carry weight, and each is load-bearing against a leaf already swept:

  - `credential list` returns rows keyed `id`, `name`, `service`, `status`. It is
    already `safe`, it is swept on every PR, and it must stay clean here.
  - `auth whoami` returns `key` MASKED as eight characters, an ellipsis and four
    more, deliberately, by `auth.ts`. Masking is what keeps it under the length
    floor -- so shortening that floor below 17 turns a correct mask into a red.
  - `ticket create` redacts `password|secret|token|apiKey|...` inside its request
    and response bodies. This key list is deliberately close to that one, so the
    two agree about what the word "secret" means.

FALSE NEGATIVES IT CANNOT SEE, stated rather than implied: an opaque secret under
a key that names nothing (`value`, `data`, `blob`), and a secret inside a string
that is mostly not secret (a URL with a token in its userinfo). A scanner that
guessed at those would fire on `document list`. The table above is what covers
what this cannot.

EXIT CODES, AND WHY 1 IS NOT ENOUGH ON ITS OWN
  0  valid JSON, nothing secret-shaped
  1  not JSON            -- AND it prints the sentinel NOT-JSON on stdout
  2  a secret-shaped value  <- NEVER print the payload
  3  the scanner itself failed
  4  --require-non-empty was passed and the response holds no rows

*** THE SENTINEL IS THE WHOLE POINT OF EXIT 1, and leaving it out reopens the
hole this file exists to close. A python traceback ALSO exits 1. A missing
interpreter exits 127. Without a positive marker the caller cannot tell "this
output is not JSON, here is a harmless preview of it" from "the scanner never
ran, and the output it did not read may be a live credential" -- and the caller's
response to the first is to PRINT THE OUTPUT.

So the caller must require exit 1 AND `NOT-JSON` on stdout before it previews
anything, and must treat every other status as UNMEASURED: a failure, with no
preview. Bugbot caught exactly this on the first version of this gate, where the
caller's `*)` branch previewed the payload on any unexpected status.
"""

import json
import re
import sys

SECRET_KEY = re.compile(
    r"(token|secret|password|passwd|apikey|api_key|privatekey|private_key"
    r"|credential|authorization|cookie|bearer|access_key|accesskey|clientsecret)",
    re.I,
)

# A key that NAMES a secret without carrying one. `tokenExpiresAt` is a date,
# `credentialId` is a uuid, `secretName` is a label.
METADATA_TAIL = re.compile(
    r"(id|ids|url|uri|name|type|at|count|status|state|reason|scope|source"
    r"|enabled|required|expiry|expiresat|createdat|updatedat|lastusedat)$",
    re.I,
)

# Short enough that it cannot be a live credential, long enough that `auth
# whoami`'s deliberate mask stays under it. See the docblock above before moving.
MIN_SECRET_LENGTH = 20

# Printed on stdout alongside exit 1. The caller previews a payload ONLY when it
# sees this, because a traceback exits 1 too.
NOT_JSON_SENTINEL = "NOT-JSON"

# Printed alongside exit 4, for the same reason the NOT-JSON marker exists: the
# caller must key its branch off a positive answer, never off a bare status.
EMPTY_SENTINEL = "EMPTY"


def findings(node, path=""):
    """Every secret-shaped (path, length) pair. Never the value itself."""
    found = []
    if isinstance(node, dict):
        for key, value in node.items():
            here = "{}.{}".format(path, key) if path else key
            if (
                isinstance(value, str)
                and len(value) >= MIN_SECRET_LENGTH
                and SECRET_KEY.search(key)
                and not METADATA_TAIL.search(key)
            ):
                found.append((here, len(value)))
            found.extend(findings(value, here))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            found.extend(findings(value, "{}[{}]".format(path, index)))
    return found


def is_empty(node):
    """Does this response carry no rows?

    A `safe-with-fixture` leaf exists because its route is real and its
    organisation holds nothing unless something seeded it. Emptiness is
    therefore the thing being asserted, and it has to be read off SHAPES the
    CLI actually returns rather than one canonical envelope:

        []                                  a bare list
        {"data": [], "meta": {...}}         the v1 envelope
        {"folders": [], "assignments": []}  two named collections

    RULE: a bare empty list is empty; an object is empty when it has at least
    one list-valued field and EVERY one of them is empty. An object with no list
    field at all is NOT empty — `role automation-settings` is scalars all the
    way down, and calling that empty would red a leaf with nothing wrong.
    """
    if isinstance(node, list):
        return len(node) == 0
    if isinstance(node, dict):
        lists = [value for value in node.values() if isinstance(value, list)]
        return len(lists) > 0 and all(len(value) == 0 for value in lists)
    return False


def scan(text, require_non_empty=False):
    try:
        parsed = json.loads(text)
    except Exception:
        return 1, []
    hits = findings(parsed)
    if hits:
        # A secret outranks an empty read. Both are failures; only one of them
        # must never have its payload quoted, so it has to win the branch.
        return 2, hits
    if require_non_empty and is_empty(parsed):
        return 4, []
    return 0, []


def _opaque(seed, length):
    """Build a fixture value without writing a credential-shaped literal.

    A literal that LOOKS like a real key is refused before it reaches disk, and
    correctly so. The detector reads the KEY NAME and the LENGTH, never the
    alphabet, so a repeated seed exercises it exactly as a real value would.
    """
    return (seed * length)[:length]


def _cases():
    long_value = _opaque("a1b2c3d4", 40)
    return [
        ("the known leak - a push token",
         json.dumps({"username": "u", "pushToken": long_value}), 2, "pushToken"),
        ("a secret under a DIFFERENT key name",
         json.dumps({"data": [{"id": "x", "apiKey": long_value}]}), 2, "apiKey"),
        ("a secret nested three levels down",
         json.dumps({"conn": {"auth": {"clientSecret": long_value}}}), 2, "clientSecret"),
        ("a secret inside a list of rows",
         json.dumps({"rows": [{"a": 1}, {"authorization": "Bearer " + long_value}]}), 2, "authorization"),
        ("credential list - metadata only, must stay clean",
         json.dumps({"data": [{"id": "1", "name": "n", "service": "s",
                               "status": "ACTIVE", "lastUsedAt": "2026-01-01"}]}), 0, ""),
        ("auth whoami - the key is masked, must stay clean",
         json.dumps({"key": "nxs_u_83...ecf8", "user": "a@b.c"}), 0, ""),
        ("metadata that NAMES a secret, must stay clean",
         json.dumps({"tokenExpiresAt": "2026-01-01T00:00:00.000Z",
                     "credentialId": "11111111-1111-4111-8111-111111111111",
                     "secretName": "MY_KEY"}), 0, ""),
        ("a short value under a secret key, must stay clean",
         json.dumps({"token": "abc"}), 0, ""),
        ("not JSON at all", "Usage: nexus [options]", 1, ""),
        ("empty output - not JSON, and the caller must not read it as clean", "", 1, ""),
        ("an empty list - valid and clean", json.dumps({"data": []}), 0, ""),
    ]


def self_test():
    """Both directions. A scanner tested only on what it catches is not tested."""
    failures = []
    cases = _cases()
    for label, payload, want_code, want_key in cases:
        code, hits = scan(payload)
        keys = ",".join(path for path, _ in hits)
        ok = code == want_code and (want_key in keys if want_key else True)
        print("  {} {} -> exit {} {}".format("ok  " if ok else "FAIL", label, code, keys))
        if not ok:
            failures.append(
                "{}: wanted exit {} key~{!r}, got exit {} keys={!r}".format(
                    label, want_code, want_key, code, keys))
    # The sentinel is what separates "not JSON" from "the scanner died", and the
    # caller previews a payload on the strength of it. A self-test that checked
    # only exit codes would stay green with the marker deleted.
    import subprocess

    probe = subprocess.run(
        [sys.executable, __file__],
        input="definitely not json",
        capture_output=True,
        text=True,
    )
    if probe.returncode != 1 or probe.stdout.strip() != NOT_JSON_SENTINEL:
        failures.append(
            "the NOT-JSON marker is missing: exit {} stdout {!r}".format(
                probe.returncode, probe.stdout))
    else:
        print("  ok   the NOT-JSON marker is printed alongside exit 1")

    caught = sum(1 for _, _, code, _ in cases if code == 2)
    clean = sum(1 for _, _, code, _ in cases if code == 0)
    if caught == 0 or clean == 0:
        failures.append(
            "the case table tests one direction only: {} catching, {} clean".format(caught, clean))
    if failures:
        print("\nself-test FAILED:")
        for line in failures:
            print("  - {}".format(line))
        return 1
    print("\nself-test ok - {} cases, {} catching, {} clean".format(len(cases), caught, clean))
    return 0


def main():
    if "--self-test" in sys.argv[1:]:
        sys.exit(self_test())
    require_non_empty = "--require-non-empty" in sys.argv[1:]
    try:
        code, hits = scan(sys.stdin.read(), require_non_empty=require_non_empty)
    except Exception as error:  # noqa: BLE001 - the caller must never guess
        # Say the TYPE, never the message. An exception message can quote the
        # value that caused it, and the value is what must not reach a log.
        print("SCANNER-ERROR {}".format(type(error).__name__))
        sys.exit(3)
    if code == 2:
        # The KEY and the LENGTH. Never the value -- this text reaches a CI log.
        for path, length in hits:
            print("{} (len {})".format(path, length))
    elif code == 1:
        # The positive marker. See the exit-code block at the top of this file.
        print(NOT_JSON_SENTINEL)
    elif code == 4:
        print(EMPTY_SENTINEL)
    sys.exit(code)


if __name__ == "__main__":
    main()
