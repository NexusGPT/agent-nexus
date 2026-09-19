#!/usr/bin/env python3
"""Does the shipped skill bundle resolve a workspace mount the way this CLI writes one?

The CLI writes `~/.nexus-mcp/workspace-mounts.json` with COMPOSITE top-level keys
(`<kind>:<id>|<slug>`). A bundled reader that indexes that file by BARE SLUG resolves
nothing against it — and its failure mode is a wrong path or a null base URL, never an
error. That is the property this program answers.

── THE PROPERTY, STATED ONCE ───────────────────────────────────────────────────
  1. No reader resolves a mount by indexing the REGISTRY by bare slug.
  2. Every reader stays ORG-SCOPED: a row belonging to another tenant is never
     handed to the acting caller, and a row naming an owner is never handed to a
     caller with no resolvable identity.

── WHY THIS IS NOT A SUBSTRING SCAN ────────────────────────────────────────────
It used to be. The detector held a list of broken spellings and asserted none appeared
in the bundle, with `.get(slug)` deliberately RECEIVER-BLIND so a respelling that
dropped the receiver could not dodge it. The bet, in that file's own words, was that
"any literal occurrence in the bundle is a reader, with no case to argue".

That bet is false. `hooks/lib/automount.py` contains `rows.get(slug)` where

    rows = _rows_for(scope, mounts)          # iterates mounts.values(), keys on v["slug"],
                                             # and admits a row only for the acting scope

so the receiver is an org-scoped local and the registry's key format is irrelevant to
it. The scan reported a reader that reads correctly, and its prescribed remedy — "scan
the registry's VALUES and match on the record's own slug field" — was already
implemented, which is the signature of a gate that has misidentified the site.

A receiver-blind substring cannot tell `registry.get(slug)` from `scoped.get(slug)`.
So the receiver is now the question, and the check answers it two ways.

── ARM A — EXECUTABLE CONTRACT (behaviour) ─────────────────────────────────────
Materialise the bundle's reader modules, import them, and DRIVE every registry-taking
resolver against fixture registries. This does not inspect how a reader is written; it
observes what it resolves. Four fixtures per resolver, and each answers a different
question:

    composite     acting org's row under `org:<id>|<slug>`  -> MUST resolve
    legacy        THE SAME ROW under a bare-slug key        -> MUST resolve  (control)
    foreign       another tenant's row, composite key       -> MUST resolve NOTHING
    anonymous     owned row, caller with no identity        -> MUST resolve NOTHING

`legacy` is the CONTROL, and it is what stops this program passing vacuously: if the
driver were wired wrong — bad fixture shape, resolver imported but never reached —
every case would return None, and "resolves nothing" would read as success in three
cases out of four. A case that MUST return something is what makes the three refusals
mean anything.

It is also the arm that isolates the property. `legacy` differs from `composite` in
the top-level KEY and in nothing else — same slug, same owner, same path — so a
reader that answers them differently is answering on the key, which is exactly the
defect. Ownership is deliberately held fixed; see `fixtures()` for the false failure
that taught this, and for why ownerless rows are observed rather than asserted.

── ARM B — RECEIVER-AWARE STATIC CHECK (reach) ─────────────────────────────────
Arm A can only drive a resolver that takes the registry as an argument. Several
readers instead open `~/.nexus-mcp/workspace-mounts.json` themselves deep inside a
hook. Arm B covers those, using python3's `ast` — a real parser, not a regex:

  * a name is REGISTRY-DERIVED if it is bound from a `json.load` inside a `with open`
    whose target names the registry file, from a call to a local loader that does the
    same, or if it is a parameter named `mounts`/`registry` (the shape every canonical
    resolver takes);
  * a VIOLATION is a slug-keyed READ on such a name — `x[slug]` or `x.get(slug)` in
    Load context, with a slug-ish key;
  * `x[slug] = v` is a WRITE, and building a re-keyed scoped dict that way is the
    CORRECT pattern, so Store context is not a violation;
  * consuming via `.values()` / `.items()` is never a violation.

── WHAT THIS DOES NOT COVER, STATED RATHER THAN HIDDEN ─────────────────────────
Arm B is intraprocedural. A registry threaded through a chain of local helpers that
rename it past the taint sources above is not tracked, and would be reported by
neither arm. Nothing in the bundle does that today — Arm A's `coverage` block and
Arm B's `scanned` block are printed so the reach of each run is readable rather than
assumed — but it is an uncovered property, not a closed one.

Markdown is not scanned. Prose that describes a bare-slug lookup misleads a human but
resolves nothing at runtime; this program is about readers.

── SELF-TEST ───────────────────────────────────────────────────────────────────
`--self-test` scores BOTH arms, in both directions, against synthetic readers whose
correctness is known. A check that has never been seen to fail is an untested claim
about coverage.

It has to be both, because the two arms fail in ways the other cannot see, and an
earlier revision of this file got that wrong: its self-test ran `scan_source` only, so
Arm B was proven and Arm A was merely asserted — a `drive()` wired to the wrong
fixture, or one that resolved nothing at all, would have left every refusal trivially
satisfied and still printed a clean self-test. So `self_test_arm_a` drives the real
`drive()` over a deliberately broken `hook_core` and over a correct one, and
`self_test` parses synthetic sources — including a slug-keyed read whose receiver is a
SCOPED LOCAL rather than the registry, which is the exact shape the substring detector
this replaced got wrong.

Usage:
    registry-reader-contract.py <skills-content.generated.json>   # scan the bundle
    registry-reader-contract.py --self-test                       # prove it can fail
    ... --json                                                    # machine-readable
"""

import argparse
import ast
import importlib
import json
import os
import sys
import tempfile

STANDARD = ("general-context", "tools", "systems", "use-cases")

ACTING_ORG = "org_ACME0000000000000000"
ACTING_PROFILE = "acme"
FOREIGN_ORG = "org_OTHER000000000000000"

# Parameter names that ARE the parsed registry. Every canonical resolver in the bundle
# takes it under one of these, which is what makes a bare-slug read inside one of them
# reachable by Arm B at all.
REGISTRY_PARAMS = {"mounts", "registry"}

# Key expressions that denote a bare slug.
SLUG_NAMES = {"slug", "s", "ws", "workspace"}

REGISTRY_FILE = "workspace-mounts.json"


# ─────────────────────────────── fixtures ───────────────────────────────────


def _row(slug, *, org=None, profile=None, engine="direct", path=None):
    row = {"slug": slug, "engine": engine,
           "mountPath": path or "/Users/probe/nexus/acme/%s" % slug}
    if org:
        row["orgId"] = org
    if profile:
        row["profile"] = profile
    return row


def fixtures():
    """Registries that differ in exactly ONE variable each.

    `legacy` is the control, and it carries the acting org on every row ON PURPOSE. An
    earlier revision made it ownerless as well as bare-keyed, which conflated two
    independent things — how a row is KEYED, and who OWNS it — and the conflation showed
    up as a false failure: `automount._rows_for` requires a positive org or profile match
    and has no ownerless tier, so it refused those rows for a reason that had nothing to
    do with the key format this program is about.

    Holding ownership fixed at "the acting org" leaves the top-level KEY as the only
    thing that differs between `composite` and `legacy`, which is what makes a
    difference in outcome between them attributable to the key at all.

    Ownerless rows are deliberately NOT asserted on: the three readers take three
    different and separately-documented positions on them, so a uniform expectation
    would encode a policy the bundle does not share. `--json` reports what each reader
    does with them under `observed`, as information rather than as a verdict.
    """
    composite, legacy, foreign, ownerless = {}, {}, {}, {}
    for slug in STANDARD:
        # Exactly the shape the CLI writes today.
        composite["org:%s|%s" % (ACTING_ORG, slug)] = _row(slug, org=ACTING_ORG)
        # THE CONTROL: pre-rekey bare-slug key, same owner as `composite`.
        legacy[slug] = _row(slug, org=ACTING_ORG)
        # Another tenant, keyed the new way. The slug is IDENTICAL on purpose.
        foreign["org:%s|%s" % (FOREIGN_ORG, slug)] = _row(slug, org=FOREIGN_ORG)
        # Observed, never asserted — see the docstring.
        ownerless[slug] = _row(slug)
    return {"composite": composite, "legacy": legacy, "foreign": foreign,
            "ownerless": ownerless}


# ──────────────────────── arm A: executable contract ────────────────────────


def _materialise(bundle_path, dest):
    """Write the bundle's python readers to disk so they can be imported."""
    with open(bundle_path, encoding="utf-8") as fh:
        payload = json.load(fh)
    written = []
    libdir = os.path.join(dest, "lib")
    os.makedirs(libdir, exist_ok=True)
    for entry in payload.get("HOOK_FILES", []):
        path, content = entry.get("path", ""), entry.get("content", "")
        if not path.endswith(".py"):
            continue
        target = os.path.join(dest, path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as fh:
            fh.write(content)
        written.append(("hooks", path))
    for entry in payload.get("SHARED_FILES", []):
        path, content = entry.get("path", ""), entry.get("content", "")
        if not path.endswith(".py"):
            continue
        target = os.path.join(dest, "shared", path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as fh:
            fh.write(content)
        written.append(("shared", path))
    return payload, written


def _expect(results, resolver, case, got, want, detail=""):
    ok = (got == want)
    results.append({"resolver": resolver, "case": case, "ok": ok,
                    "want": want, "got": got, "detail": detail})
    return ok


def drive(modroot):
    """Import each registry-taking resolver and observe what it resolves.

    Returns (results, coverage). A resolver that cannot be imported is recorded as an
    ERROR rather than skipped — a resolver that silently vanished from the bundle must
    not read as a pass.
    """
    # Import by NAME from a directory that changes between calls, so a module cached
    # from an earlier call would be silently reused — which would make the Arm A
    # self-test below score the real bundle instead of its own synthetic reader, and
    # report a pass it never earned.
    libdir = os.path.join(modroot, "lib")
    for name in ("hook_core", "automount", "drives_check"):
        sys.modules.pop(name, None)
    sys.path.insert(0, libdir)
    importlib.invalidate_caches()
    fx = fixtures()
    results, coverage = [], []
    acting = (ACTING_ORG, ACTING_PROFILE)
    anon = ("", "")

    def load(name):
        try:
            return importlib.import_module(name), None
        except Exception as exc:                      # noqa: BLE001 - reported, not raised
            return None, "%s: %s" % (type(exc).__name__, exc)

    # ---- hook_core: the canonical resolver every hook delegates to ----
    hc, err = load("hook_core")
    if err:
        results.append({"resolver": "hook_core", "case": "import", "ok": False,
                        "want": "importable", "got": err, "detail": ""})
    else:
        for fn_name in ("mount_record", "mount_path"):
            fn = getattr(hc, fn_name, None)
            if fn is None:
                results.append({"resolver": "hook_core.%s" % fn_name, "case": "present",
                                "ok": False, "want": "present", "got": "MISSING",
                                "detail": "the canonical resolver left the bundle"})
                continue
            coverage.append("hook_core.%s" % fn_name)
            r = "hook_core.%s" % fn_name
            # composite keys MUST resolve for the acting org
            got = fn(fx["composite"], "tools", acting)
            _expect(results, r, "composite-resolves", got is not None, True,
                    "acting org's row under `org:<id>|tools`")
            # legacy ownerless keys MUST resolve — the control that proves we got here
            got = fn(fx["legacy"], "tools", acting)
            _expect(results, r, "legacy-resolves-CONTROL", got is not None, True,
                    "same row, bare-slug KEY. If this is None the driver never reached "
                    "the resolver and every refusal below is vacuous")
            # another tenant's row MUST NOT resolve
            got = fn(fx["foreign"], "tools", acting)
            _expect(results, r, "foreign-org-refused", got is None, True,
                    "row owned by %s must never reach %s" % (FOREIGN_ORG, ACTING_ORG))
            # an owned row MUST NOT reach a caller with no identity
            got = fn(fx["composite"], "tools", anon)
            _expect(results, r, "anonymous-refused", got is None, True,
                    "uniqueness is not ownership")

        fn = getattr(hc, "mount_roots_by_engine", None)
        if fn is not None:
            coverage.append("hook_core.mount_roots_by_engine")
            roots = fn(fx["composite"])
            flat = [p for v in (roots or {}).values() for p in (v or [])]
            _expect(results, "hook_core.mount_roots_by_engine", "composite-yields-roots",
                    len(flat) > 0, True, "composite keys must still yield mount roots")

    # ---- automount.plan ----
    am, err = load("automount")
    if err:
        results.append({"resolver": "automount", "case": "import", "ok": False,
                        "want": "importable", "got": err, "detail": ""})
    elif hasattr(am, "plan"):
        coverage.append("automount.plan")
        r = "automount.plan"

        def resolved(mounts, scope):
            return sorted(a["slug"] for a in am.plan(scope, "Acme", mounts=mounts)
                          if a.get("action") != "mount")

        _expect(results, r, "composite-resolves",
                resolved(fx["composite"], acting), list(STANDARD and sorted(STANDARD)),
                "every standard slug recognised under composite keys")
        _expect(results, r, "legacy-resolves-CONTROL",
                resolved(fx["legacy"], acting), sorted(STANDARD),
                "same rows, bare-slug KEYS: the key format must not change the answer")
        _expect(results, r, "foreign-org-refused",
                resolved(fx["foreign"], acting), [],
                "another tenant's rows must all read as absent")

    # ---- drives_check ----
    dc, err = load("drives_check")
    if err:
        results.append({"resolver": "drives_check", "case": "import", "ok": False,
                        "want": "importable", "got": err, "detail": ""})
    elif hasattr(dc, "_rows_for_scope"):
        coverage.append("drives_check._rows_for_scope")
        r = "drives_check._rows_for_scope"
        _expect(results, r, "composite-resolves",
                sorted(dc._rows_for_scope(fx["composite"], acting)), sorted(STANDARD),
                "scoped rows keyed by the record's own slug")
        _expect(results, r, "legacy-resolves-CONTROL",
                sorted(dc._rows_for_scope(fx["legacy"], acting)), sorted(STANDARD),
                "same rows, bare-slug KEYS: the key format must not change the answer")
        _expect(results, r, "foreign-org-refused",
                sorted(dc._rows_for_scope(fx["foreign"], acting)), [],
                "another tenant's rows must not appear")

    # Observed, never asserted: the three readers take three separately-documented
    # positions on an ownerless row, so a uniform expectation would encode a policy the
    # bundle does not share. Reported so a future divergence is at least visible.
    observed = {}
    if hc and hasattr(hc, "mount_record"):
        observed["hook_core.mount_record"] = (
            hc.mount_record(fx["ownerless"], "tools", acting) is not None)
    if am and hasattr(am, "plan"):
        observed["automount.plan"] = any(
            a.get("action") != "mount" for a in am.plan(acting, "Acme",
                                                        mounts=fx["ownerless"]))
    if dc and hasattr(dc, "_rows_for_scope"):
        observed["drives_check._rows_for_scope"] = bool(
            dc._rows_for_scope(fx["ownerless"], acting))

    try:
        sys.path.remove(libdir)
    except ValueError:
        pass
    return results, coverage, observed


# ───────────────────── arm B: receiver-aware static check ───────────────────


def _names_the_registry(node):
    """Does this expression mention the registry file by name?"""
    for sub in ast.walk(node):
        if isinstance(sub, ast.Constant) and isinstance(sub.value, str):
            if REGISTRY_FILE in sub.value:
                return True
    return False


def _slug_key(node):
    """The key expression, if it denotes a bare slug."""
    if isinstance(node, ast.Name) and node.id in SLUG_NAMES:
        return node.id
    if isinstance(node, ast.Constant) and node.value in STANDARD:
        return repr(node.value)
    return None


class _FunctionScan(ast.NodeVisitor):
    """Find slug-keyed READS whose receiver is registry-derived, within one function."""

    def __init__(self, loaders):
        self.loaders = loaders          # local zero-arg functions returning the registry
        self.tainted = set()
        self.violations = []

    def seed_params(self, fn):
        for arg in list(fn.args.args) + list(fn.args.kwonlyargs):
            if arg.arg in REGISTRY_PARAMS:
                self.tainted.add(arg.arg)

    def visit_With(self, node):
        # `with open(<...workspace-mounts.json...>) as fh:` arms json.load inside.
        if any(_names_the_registry(item.context_expr) for item in node.items):
            for sub in ast.walk(node):
                if isinstance(sub, ast.Assign) and isinstance(sub.value, ast.Call):
                    fnode = sub.value.func
                    if isinstance(fnode, ast.Attribute) and fnode.attr in ("load", "loads"):
                        for tgt in sub.targets:
                            if isinstance(tgt, ast.Name):
                                self.tainted.add(tgt.id)
        self.generic_visit(node)

    def visit_Assign(self, node):
        # `m = _registry()` / `rows = read_registry()` — a local loader's return.
        if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name):
            if node.value.func.id in self.loaders:
                for tgt in node.targets:
                    if isinstance(tgt, ast.Name):
                        self.tainted.add(tgt.id)
        # `a = b` propagation where b is already tainted.
        if isinstance(node.value, ast.Name) and node.value.id in self.tainted:
            for tgt in node.targets:
                if isinstance(tgt, ast.Name):
                    self.tainted.add(tgt.id)
        self.generic_visit(node)

    def check(self, tree):
        for n in ast.walk(tree):
            # x[slug] — a READ only. Store context is building a re-keyed dict.
            if isinstance(n, ast.Subscript) and isinstance(n.ctx, ast.Load):
                if isinstance(n.value, ast.Name) and n.value.id in self.tainted:
                    key = _slug_key(n.slice)
                    if key:
                        self.violations.append((n.lineno, n.value.id, "[%s]" % key))
            # x.get(slug)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) \
                    and n.func.attr == "get" and n.args:
                recv = n.func.value
                if isinstance(recv, ast.Name) and recv.id in self.tainted:
                    key = _slug_key(n.args[0])
                    if key:
                        self.violations.append((n.lineno, recv.id, ".get(%s)" % key))


def _local_loaders(tree):
    """Zero-arg local functions whose body opens the registry file."""
    out = set()
    for n in ast.walk(tree):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if len(n.args.args) == 0 and _names_the_registry(n):
                out.add(n.name)
    return out


def scan_source(src, label):
    """Every registry-derived slug-keyed read in one python source."""
    tree = ast.parse(src)
    loaders = _local_loaders(tree)
    found = []
    for n in ast.walk(tree):
        if not isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        scan = _FunctionScan(loaders)
        scan.seed_params(n)
        for sub in n.body:
            scan.visit(sub)
        scan.check(n)
        for lineno, recv, op in scan.violations:
            found.append({"file": label, "line": lineno, "receiver": recv, "op": op,
                          "function": n.name})
    # module level
    scan = _FunctionScan(loaders)
    for sub in tree.body:
        if not isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
            scan.visit(sub)
    scan.check(ast.Module(body=[b for b in tree.body
                                if not isinstance(b, (ast.FunctionDef,
                                                      ast.AsyncFunctionDef))],
                          type_ignores=[]))
    for lineno, recv, op in scan.violations:
        found.append({"file": label, "line": lineno, "receiver": recv, "op": op,
                      "function": "<module>"})
    return found


def static_scan(modroot, written):
    violations, scanned, unparsed = [], [], []
    for bundle, path in written:
        # The one pre-existing skip: upstream's own test harness inside the hooks
        # bundle. It ships, but it is a harness, not a reader.
        if bundle == "hooks" and os.path.basename(path).startswith("test_"):
            continue
        disk = os.path.join(modroot, path) if bundle == "hooks" \
            else os.path.join(modroot, "shared", path)
        try:
            with open(disk, encoding="utf-8") as fh:
                src = fh.read()
        except OSError as exc:
            unparsed.append("%s/%s: %s" % (bundle, path, exc))
            continue
        if REGISTRY_FILE not in src:
            continue
        label = "%s/%s" % (bundle, path)
        scanned.append(label)
        try:
            violations.extend(scan_source(src, label))
        except SyntaxError as exc:
            unparsed.append("%s: %s" % (label, exc))
    return violations, scanned, unparsed


# ──────────────────────────────── self-test ─────────────────────────────────

_OFFENDER = '''
import json, os
def resolve(slug):
    with open(os.path.expanduser("~/.nexus-mcp/workspace-mounts.json")) as fh:
        mounts = json.load(fh)
    return mounts.get(slug)
'''

_OFFENDER_PARAM = '''
def mount_path(mounts, slug, scope=None):
    row = mounts[slug]
    return row.get("mountPath")
'''

_CORRECT = '''
def mount_record(mounts, slug, scope=None):
    for v in mounts.values():
        if v.get("slug") == slug and v.get("orgId") == (scope or (None, None))[0]:
            return v
    return None
'''

_CORRECT_SCOPED_LOCAL = '''
def _rows_for(scope, mounts):
    out = {}
    for v in mounts.values():
        out[v.get("slug")] = v
    return out

def plan(scope, mounts):
    rows = _rows_for(scope, mounts)
    for slug in ("tools",):
        row = rows.get(slug)
    return row
'''



# Synthetic readers for the ARM A self-test. `_SANE_*` are correct by construction;
# `_BROKEN_HOOK_CORE` indexes the registry by bare slug, which is the defect Arm A
# exists to observe. Only hook_core differs between the two module sets, so a failure
# is attributable to it and not to the harness.

_SANE_HOOK_CORE = '''
def mount_record(mounts, slug, scope=None):
    org, prof = (scope or (None, None))
    for v in mounts.values():
        if not isinstance(v, dict) or v.get("slug") != slug:
            continue
        owner = v.get("orgId")
        if owner:
            if owner == org:
                return v
            continue
        return v
    return None

def mount_path(mounts, slug, scope=None):
    row = mount_record(mounts, slug, scope)
    return row.get("mountPath") if row else None

def mount_roots_by_engine(mounts):
    out = {}
    for v in mounts.values():
        out.setdefault(v.get("engine"), []).append(v.get("mountPath"))
    return out
'''

_BROKEN_HOOK_CORE = '''
def mount_record(mounts, slug, scope=None):
    return mounts.get(slug)          # BROKEN: indexes the registry by bare slug

def mount_path(mounts, slug, scope=None):
    row = mount_record(mounts, slug, scope)
    return row.get("mountPath") if row else None

def mount_roots_by_engine(mounts):
    out = {}
    for v in mounts.values():
        out.setdefault(v.get("engine"), []).append(v.get("mountPath"))
    return out
'''

_SANE_AUTOMOUNT = '''
import hook_core
STANDARD = ("general-context", "tools", "systems", "use-cases")

def plan(scope, org_name, mounts=None):
    acts = []
    for slug in STANDARD:
        row = hook_core.mount_record(mounts or {}, slug, scope)
        acts.append({"slug": slug, "action": "none" if row else "mount"})
    return acts
'''

_SANE_DRIVES_CHECK = '''
import hook_core
STANDARD = ("general-context", "tools", "systems", "use-cases")

def _rows_for_scope(registry, scope):
    out = {}
    for slug in STANDARD:
        row = hook_core.mount_record(registry or {}, slug, scope)
        if row:
            out[slug] = row
    return out
'''


def _write_modroot(dest, hook_core_src):
    libdir = os.path.join(dest, "lib")
    os.makedirs(libdir, exist_ok=True)
    for name, src in (("hook_core", hook_core_src),
                      ("automount", _SANE_AUTOMOUNT),
                      ("drives_check", _SANE_DRIVES_CHECK)):
        with open(os.path.join(libdir, name + ".py"), "w", encoding="utf-8") as fh:
            fh.write(src)
    return dest


def self_test_arm_a():
    """Drive ARM A against readers whose correctness is known, both directions.

    Arm B's self-test below scores a PARSER against source text. This one scores the
    DRIVER against behaviour, and the two cannot stand in for each other: a `drive()`
    wired to the wrong fixture, or one that silently resolved nothing, would leave
    every refusal trivially satisfied while Arm B stayed green. Without this, the
    claim "the self-test proves both arms can fail" would be false about Arm A.
    """
    print("self-test — proving arm A can fail, and can stay quiet\n")
    ok = True
    for label, src, want_failure in (
        ("broken: hook_core indexes the registry by bare slug", _BROKEN_HOOK_CORE, True),
        ("correct: values-scan with the acting-org ladder", _SANE_HOOK_CORE, False)
    ):
        with tempfile.TemporaryDirectory(prefix="arm-a-self-") as tmp:
            _write_modroot(tmp, src)
            results, coverage, _ = drive(tmp)
        failures = [r for r in results if not r["ok"]]
        got = len(failures) > 0
        if got != want_failure or not coverage:
            ok = False
        print("  %-4s %-54s failures=%d (want %s), resolvers driven=%d"
              % ("PASS" if got == want_failure and coverage else "FAIL",
                 label, len(failures), "some" if want_failure else "none", len(coverage)))
        for f in failures:
            print("         %s / %s  want=%s got=%s"
                  % (f["resolver"], f["case"], f["want"], f["got"]))
    return ok


def self_test():
    cases = [
        ("offender: registry loaded then indexed by slug", _OFFENDER, True),
        ("offender: registry parameter indexed by slug", _OFFENDER_PARAM, True),
        ("correct: values-scan with org match", _CORRECT, False),
        ("correct: slug-keyed read on a SCOPED LOCAL, not the registry",
         _CORRECT_SCOPED_LOCAL, False),
    ]
    print("\nself-test — proving arm B can fail, and can stay quiet\n")
    ok = True
    for label, src, want_violation in cases:
        hits = scan_source(src, "<self-test>")
        got = len(hits) > 0
        mark = "PASS" if got == want_violation else "FAIL"
        if got != want_violation:
            ok = False
        print("  %-4s %-58s violations=%d (want %s)"
              % (mark, label, len(hits), "some" if want_violation else "none"))
        for h in hits:
            print("         L%s %s%s in %s" % (h["line"], h["receiver"], h["op"],
                                               h["function"]))
    print("\n  %d/%d self-test cases behaved as specified" % (
        sum(1 for lbl, s, w in cases if (len(scan_source(s, "x")) > 0) == w), len(cases)))
    return ok


# ─────────────────────────────────── main ───────────────────────────────────


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("bundle", nargs="?", help="path to skills-content.generated.json")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        # BOTH arms, because each is blind to the other's failure mode.
        a_ok = self_test_arm_a()
        b_ok = self_test()
        print("\nself-test verdict: arm A %s, arm B %s"
              % ("PASS" if a_ok else "FAIL", "PASS" if b_ok else "FAIL"))
        return 0 if (a_ok and b_ok) else 1

    if not args.bundle:
        ap.error("a bundle path is required unless --self-test is given")

    with tempfile.TemporaryDirectory(prefix="registry-reader-contract-") as tmp:
        payload, written = _materialise(args.bundle, tmp)
        contract, coverage, observed = drive(tmp)
        violations, scanned, unparsed = static_scan(tmp, written)

    failures = [c for c in contract if not c["ok"]]
    report = {
        "sha": payload.get("sha"),
        "armA": {"coverage": coverage, "results": contract,
                 "failures": len(failures),
                 "observed_ownerless_not_asserted": observed},
        "armB": {"scanned": scanned, "violations": violations,
                 "unparsed": unparsed},
        "ok": not failures and not violations and not unparsed,
    }

    if args.json:
        json.dump(report, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        print("bundle sha: %s\n" % report["sha"])
        print("ARM A — executable contract, %d resolver(s) driven:" % len(coverage))
        for c in coverage:
            print("    %s" % c)
        for c in contract:
            print("  %-4s %-38s %-26s want=%s got=%s"
                  % ("ok" if c["ok"] else "FAIL", c["resolver"], c["case"],
                     c["want"], c["got"]))
            if not c["ok"] and c["detail"]:
                print("       %s" % c["detail"])
        print("\nARM B — receiver-aware static scan, %d file(s) that read the registry:"
              % len(scanned))
        for s in scanned:
            print("    %s" % s)
        if violations:
            print("\n  BARE-SLUG READS OF THE REGISTRY:")
            for v in violations:
                print("    %s:%s  %s%s  in %s()"
                      % (v["file"], v["line"], v["receiver"], v["op"], v["function"]))
        else:
            print("  no registry-derived value is read by bare slug")
        if unparsed:
            print("\n  NOT PARSED (counts as a failure — an unread file is not a clean one):")
            for u in unparsed:
                print("    %s" % u)
        print("\n%s" % ("CLEAN" if report["ok"] else "REFUSED"))

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
