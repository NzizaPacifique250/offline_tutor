#!/usr/bin/env python3
"""Deterministic grader for the S6 Advanced Mathematics probe set.

The evaluation plan calls for computational validation wherever an answer can be
checked, rather than relying only on a human rubric. This module is that checker.

Design notes
------------
Grading a language model's free prose is unreliable, so the tutor prompt asks for
the final answer inside ``<answer>`` tags using plain ASCII mathematics. Whether a
model complies with that instruction is itself a reported metric, because a model
that cannot follow a format instruction cannot be wired into an application.

A fallback extractor handles ``\\boxed{}``, "the answer is", and a trailing
equation, so a non-compliant model is still graded on its mathematics rather than
scored zero for formatting.

Every check is symbolic or numeric. None of them compares strings, because
``e^x(x-1)`` and ``x*e^x - e^x`` are the same antiderivative and a string check
would mark one of them wrong.

Self-test
---------
Running with ``--self-test`` grades each probe's own ``expected`` value. Every row
must pass. This guards against a checker that silently accepts or rejects
everything, which would invalidate the whole benchmark.

Usage:
    python tools/grade.py --self-test
    python tools/grade.py --responses bench/results/raw/qwen25-math-1.5b.jsonl
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROBE_FILE = PROJECT_ROOT / "bench" / "eval" / "s6_math_probe.jsonl"

TRANSFORMS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)

# Symbols that may legitimately appear as arbitrary constants in a general
# solution. They are declared up front so parsing does not invent them with the
# wrong assumptions.
ARBITRARY = {name: sp.Symbol(name) for name in
             ("A", "B", "C", "C1", "C2", "K", "C_1", "C_2", "K_1", "K_2")}
LOCALS: dict[str, Any] = {
    "I": sp.I,
    "i": sp.I,
    "e": sp.E,
    "pi": sp.pi,
    "E": sp.E,
    "log": sp.log,
    "ln": sp.log,
    "Abs": sp.Abs,
    "abs": sp.Abs,
    "sqrt": sp.sqrt,
    "exp": sp.exp,
    **ARBITRARY,
}

# ---------------------------------------------------------------------------
# Answer extraction
# ---------------------------------------------------------------------------

# Unicode a model may emit instead of ASCII. Folded before anything else so the
# LaTeX rules and the parser only ever see ASCII.
_UNICODE_FOLD: list[tuple[str, str]] = [
    ("\u2212", "-"), ("\u2013", "-"), ("\u2014", "-"),   # minus, en dash, em dash
    ("\u00d7", "*"), ("\u22c5", "*"), ("\u00f7", "/"),   # times, cdot, divide
    ("\u2248", "="), ("\u2245", "="), ("\u2261", "="),   # approx, congruent, identical
    ("\u221a", "sqrt"), ("\u03c0", "pi"), ("\u221e", "oo"),
    ("\u2223", "|"), ("\u2225", "|"),
    ("\u2044", "/"),
    ("\u00b7", "*"),
]

# Superscript digits become explicit powers: x\u00b3 -> x**3.
_SUPERSCRIPTS = {
    "\u2070": "0", "\u00b9": "1", "\u00b2": "2", "\u00b3": "3", "\u2074": "4",
    "\u2075": "5", "\u2076": "6", "\u2077": "7", "\u2078": "8", "\u2079": "9",
    "\u207a": "+", "\u207b": "-",
}

_LATEX_CLEANUP: list[tuple[str, str]] = [
    (r"\\left|\\right", ""),
    (r"\\!|\\,|\\;|\\quad|\\qquad", " "),
    (r"\\dfrac|\\tfrac", r"\\frac"),
    (r"\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}", r"(\1)/(\2)"),
    (r"\\sqrt\s*\{([^{}]+)\}", r" sqrt(\1)"),
    (r"\\sqrt\s*(\w)", r" sqrt(\1)"),
    (r"\\operatorname\{([^{}]+)\}", r"\1"),
    (r"\\text\{([^{}]+)\}", r"\1"),
    (r"\\mathrm\{([^{}]+)\}", r"\1"),
    (r"\\cdot|\\times", "*"),
    (r"\\div", "/"),
    (r"\\ln\b", " log"),
    (r"\\log\b", " log"),
    (r"\\exp\b", " exp"),
    (r"\\pi\b", " pi"),
    (r"\\infty", " oo"),
    (r"\\(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|arcsin|arccos|arctan)\b", r" \1"),
]


def _strip_emphasis(s: str, marker: str) -> str:
    """Remove markdown emphasis without touching ``**`` used as a power.

    An opening marker must sit at the start or after a space or bracket, and the
    closing marker must be followed by the end or by punctuation. That leaves
    ``x**3*log(x)/3 - x**3/9`` untouched while still stripping ``**0.2048**``.
    """
    pattern = re.compile(
        r"(?:^|(?<=[\s(\[,]))" + marker + r"(\S.*?\S|\S)" + marker + r"(?=$|[\s.,;:)\]])",
        re.DOTALL,
    )
    for _ in range(4):
        new = pattern.sub(r"\1", s)
        if new == s:
            break
        s = new
    return s


def _fold_unicode(s: str) -> str:
    for src, dst in _UNICODE_FOLD:
        s = s.replace(src, dst)
    return s


def _fold_superscripts(s: str) -> str:
    """Turn a run of superscript digits into an exponent: x\u00b3 -> x**(3).

    Applied after markdown emphasis has been stripped, because the ``**`` this
    produces would otherwise be mistaken for bold and deleted.
    """
    def sup(m: re.Match) -> str:
        return "**(" + "".join(_SUPERSCRIPTS[c] for c in m.group(0)) + ")"
    return re.sub("[" + "".join(_SUPERSCRIPTS) + "]+", sup, s)


def _bars_to_abs(s: str) -> str:
    """Turn |u| into Abs(u).

    Textbook and LaTeX answers write log|u|. Sympy has no pipe syntax, so an
    unconverted bar makes the whole answer unparseable and a correct
    antiderivative is scored wrong. Innermost pairs are converted first so
    nested bars survive.
    """
    for _ in range(6):
        new = re.sub(r"\|([^|]+)\|", r" Abs(\1)", s)
        if new == s:
            break
        s = new
    return s.replace("|", "")


def _toplevel_equals(s: str) -> list[int]:
    """Positions of ``=`` outside any bracket.

    ``P(X = 2) = 0.2240`` has one real equals sign; the other belongs to the
    label. Splitting on the wrong one leaves an unbalanced bracket that cannot
    be parsed.
    """
    depth = 0
    out: list[int] = []
    for k, ch in enumerate(s):
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        elif ch == "=" and depth == 0:
            out.append(k)
    return out


def _strip_answer_prefix(s: str) -> str:
    """Remove a leading label such as ``y =``, ``y(x) =`` or ``\\int f dx =``.

    Only applied when no further ``=`` remains, so a multi-root answer like
    ``z = 2 + 3i or z = -2 - 3i`` keeps both roots.
    """
    s = re.sub(r"^\s*int\b.*?\bd\s*[a-zA-Z]\b\s*=\s*", "", s)
    tops = _toplevel_equals(s)
    # Exactly one top-level "=" means "label = answer". Two or more usually means
    # several roots ("z = 2 + 3i or z = -2 - 3i"), which must be kept whole.
    if len(tops) == 1 and s[tops[0] + 1:].strip():
        s = s[tops[0] + 1:]
    return s


def _strip_labels(s: str) -> str:
    """Drop ``Modulus:`` style labels from a comma-separated answer.

    A model that writes "Modulus: 2, Principal Argument: pi/3" has answered
    correctly; only the labels stop it parsing.
    """
    if ":" not in s:
        return s
    parts = [re.sub(r"^\s*[A-Za-z][A-Za-z \t]*:\s*", "", p) for p in s.split(",")]
    return ",".join(parts)


def normalise(text: str) -> str:
    """Turn a mixture of LaTeX and plain text into something sympy can parse."""
    s = _fold_unicode(text.strip())

    # Markdown emphasis. The delimiters must be told apart from the ``**`` that
    # sympy uses for a power, so an opening marker is only recognised at a word
    # boundary: "**0.2048**" is bold, but the ``**`` in "x**3" is not.
    s = _strip_emphasis(s, "\\*\\*")
    s = _strip_emphasis(s, "__")
    s = _fold_superscripts(s)

    # Math-mode delimiters \[ \] \( \) and $, which are not commands.
    s = re.sub(r"\\[\[\]()]", " ", s)
    s = s.replace("$", " ")

    for pattern, repl in _LATEX_CLEANUP:
        s = re.sub(pattern, repl, s)

    # Braced exponents and subscripts must be rewritten *before* stray braces are
    # dropped. Otherwise e^{3x} becomes e**3x, which parses silently as
    # (e**3)*x and marks a correct answer wrong.
    for _ in range(4):
        new = re.sub(r"\^\s*\{([^{}]*)\}", r"**(\1)", s)
        new = re.sub(r"_\s*\{([^{}]*)\}", r"_\1", new)
        if new == s:
            break
        s = new

    s = _bars_to_abs(s)

    if not s.lstrip().startswith("["):
        s = s.replace("[", "(").replace("]", ")")

    s = re.sub(r"\\[a-zA-Z]+", "", s)   # drop any remaining LaTeX command
    s = re.sub(r"[\{\}]", "", s)        # drop leftover braces
    s = s.replace("^", "**")

    # A lone "i" is the imaginary unit; "i" inside a word is not.
    s = re.sub(r"(?<![A-Za-z0-9_])i(?![A-Za-z0-9_])", "I", s)

    # "2i" and "3I" are products, which implicit multiplication handles, but
    # "e^x" has to become exp(x) before parsing or E**x is built with E as a
    # plain symbol under some locals dictionaries.
    s = re.sub(r"(?<![A-Za-z0-9_])e\*\*", "exp**", s)
    s = s.replace("exp**", "E**")

    # Drop a trailing constant of integration. The antiderivative check
    # differentiates, so the constant is irrelevant, and "+ C" trips the parser
    # when C collides with a declared symbol in a list answer.
    s = re.sub(r"\s*\+\s*C\s*$", "", s)
    s = re.sub(r"\s*\+\s*constant\s*$", "", s, flags=re.IGNORECASE)

    # Strip a leading "y =", "y(x) =" or "\int f dx =" so the answer is an
    # expression, and drop "Modulus:" style labels from a paired answer.
    # "2 + 3i or -2 - 3i" is a root set written in prose; the parser splits on
    # commas, so give it commas.
    s = re.sub(r"\s+(?:or|and)\s+", ",", s, flags=re.IGNORECASE)
    # Each root may carry its own "z =" label once the list is split.
    s = ",".join(_strip_answer_prefix(part) for part in s.split(","))
    s = _strip_labels(s)

    # A trailing constant may now be exposed that the earlier rule could not see,
    # for example after "y = x e^x - e^x + C" lost its prefix.
    s = re.sub(r"\s*\+\s*C\s*$", "", s)

    return s.strip().rstrip(".").strip()


# A model's concluding cue. The answer may follow on the same line or, very
# often, on the next line inside a display block.
_CUE = re.compile(
    r"(?:final answer(?:\s+is)?|the answer is|answer\s*:|therefore|hence|thus)"
    r"\s*[,:=]?\s*",
    re.IGNORECASE,
)

_DISPLAY = re.compile(r"\\\[(.+?)\\\]", re.DOTALL)


def _is_answerlike(text: str) -> bool:
    """Reject a lead-in such as "the final answer is:" that carries no answer.

    The original extractor captured only to the end of the cue's own line, so a
    model that put its answer in a display block on the next line was scored as
    unparseable. This test is what decides to look further on.
    """
    s = text.strip().rstrip(".").strip()
    if not s or s.endswith(":"):
        return False
    if not re.search(r"[0-9]|\\frac|\\sqrt|\\pi|[a-zA-Z]\s*[\^_]", s):
        return False
    # Prose with no mathematical operator at all, e.g. "my integral is correct".
    return bool(re.search(r"[0-9\^_=+\-*/\\]", s))


def _clean_candidate(text: str) -> str:
    return text.strip().strip("$").replace("\\[", " ").replace("\\]", " ").strip()


def extract_answer(response: str) -> tuple[str, str]:
    """Pull the final answer out of a model response.

    Returns the raw answer text and the name of the strategy that found it, so the
    report can show how many models complied with the requested format.
    """
    if not response or not response.strip():
        return "", "empty"

    m = re.search(r"<answer>(.*?)</answer>", response, re.DOTALL | re.IGNORECASE)
    if m and m.group(1).strip():
        return m.group(1).strip(), "answer_tag"

    boxes = re.findall(r"\\boxed\s*\{(.+?)\}\s*(?:\$|\\\)|\\\]|\n|$)", response, re.DOTALL)
    if boxes:
        return boxes[-1].strip(), "boxed"

    # Work backwards from the model's last concluding cue. The last one is the
    # model's actual conclusion; an earlier "therefore" is usually mid-working.
    cues = list(_CUE.finditer(response))
    for cue in reversed(cues):
        tail = response[cue.end():]
        same_line = tail.split("\n", 1)[0]
        if _is_answerlike(same_line):
            return _clean_candidate(same_line), "phrase"
        # The answer is on a following line, commonly as \[ ... \].
        disp = _DISPLAY.search(tail)
        if disp and _is_answerlike(disp.group(1)):
            return _clean_candidate(disp.group(1)), "phrase_display"
        for line in tail.split("\n")[1:4]:
            if _is_answerlike(line):
                return _clean_candidate(line), "phrase_nextline"

    # A display block anywhere, last one first.
    displays = _DISPLAY.findall(response)
    for block in reversed(displays):
        if _is_answerlike(block):
            return _clean_candidate(block), "display"

    # The right-hand side of the last equation in the response, splitting only on
    # an equals sign that is not inside brackets.
    for line in reversed([l for l in response.splitlines() if l.strip()]):
        tops = _toplevel_equals(line)
        if tops and line[tops[-1] + 1:].strip():
            return line[tops[-1] + 1:].strip(), "last_equation"
    for line in reversed([l for l in response.splitlines() if l.strip()]):
        if _is_answerlike(line):
            return _clean_candidate(line), "last_equation"

    return response.strip().splitlines()[-1].strip(), "last_line"


def parse(text: str) -> sp.Expr | list[sp.Expr] | None:
    """Parse normalised text into a sympy expression, or a list of them."""
    s = normalise(text)
    if not s:
        return None

    # A bracketed or comma-separated answer is a set of roots or a pair.
    inner = s
    if s.startswith(("[", "(")) and s.endswith(("]", ")")) and "," in s:
        inner = s[1:-1]
    if "," in inner and not re.search(r"\w\(", inner.split(",")[0]):
        parts = [p.strip() for p in inner.split(",") if p.strip()]
        out = []
        for p in parts:
            e = _parse_one(p)
            if e is None:
                return None
            out.append(e)
        return out

    return _parse_one(s)


def _parse_one(s: str) -> sp.Expr | None:
    try:
        return parse_expr(s, local_dict=LOCALS, transformations=TRANSFORMS, evaluate=True)
    except Exception:
        return None


class _Timeout(Exception):
    pass


def _call_with_timeout(fn, seconds: int):
    """Run fn under a wall-clock limit.

    sympy's simplify has no internal bound and can run for minutes on an
    expression containing Abs or an unevaluated Derivative. A grader that hangs is
    worse than one that falls back to a numeric decision, so every symbolic call
    is capped.
    """
    import signal

    def handler(_signum, _frame):
        raise _Timeout()

    old = signal.signal(signal.SIGALRM, handler)
    signal.alarm(seconds)
    try:
        return fn()
    except _Timeout:
        return None
    except Exception:
        return None
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)


def _strip_abs(expr: sp.Expr) -> sp.Expr:
    """Replace Abs(u) with u.

    Textbook antiderivatives write log|u|, and the absolute value is a domain
    convention rather than part of the derivative relationship. Differentiating
    Abs symbolically produces sign() and unevaluated Derivative terms that make
    simplify diverge, so it is removed before any comparison.
    """
    try:
        return expr.replace(sp.Abs, lambda arg: arg)
    except Exception:
        return expr


# Probe points chosen to sit away from the poles of the probe set's expressions
# (0, 1, -1, +-2) while staying in the positive real region where log is defined.
_PROBE_POINTS = (sp.Rational(37, 20), sp.Rational(53, 20), sp.Rational(71, 20),
                 sp.Rational(117, 20), sp.Rational(19, 40))


def _numeric_zero(expr: sp.Expr) -> bool | None:
    """Test numerically whether an expression vanishes identically.

    Returns True if it vanished at every usable point, False if it was clearly
    non-zero at a usable point, and None if no point could be evaluated.
    """
    syms = sorted(expr.free_symbols, key=str)
    if not syms:
        try:
            return abs(complex(sp.N(expr))) < 1e-9
        except Exception:
            return None

    usable = 0
    for k, point in enumerate(_PROBE_POINTS):
        val = expr
        # Offset each symbol so A, B and C take different values, which catches
        # an answer that only works when the arbitrary constants coincide.
        for j, sym in enumerate(syms):
            val = val.subs(sym, point + sp.Rational(j * 7 + k, 23))
        try:
            c = complex(sp.N(val, 30))
        except Exception:
            continue
        if c != c or abs(c) == float("inf"):   # NaN or infinity at a pole
            continue
        usable += 1
        if abs(c) > 1e-8:
            return False
    return True if usable >= 2 else None


def zero(expr: sp.Expr) -> bool:
    """Decide whether an expression is identically zero.

    Numeric probing runs first because it is fast and, when it finds a non-zero
    value at a regular point, conclusive. Symbolic simplification only has to
    settle the cases numeric probing cannot reach.
    """
    try:
        expr = sp.sympify(expr)
    except Exception:
        return False
    if expr == 0:
        return True

    verdict = _numeric_zero(expr)
    if verdict is False:
        return False

    simplified = _call_with_timeout(lambda: sp.simplify(expr), 5)
    if simplified is not None and simplified == 0:
        return True
    expanded = _call_with_timeout(lambda: sp.expand(sp.trigsimp(sp.expand(expr))), 5)
    if expanded is not None and expanded == 0:
        return True

    # Numeric probing said zero at every point it could evaluate and symbolic
    # simplification did not contradict it. Accept, because a residual that
    # vanishes at five independent points is not plausibly non-zero.
    return verdict is True


# ---------------------------------------------------------------------------
# Checkers
# ---------------------------------------------------------------------------


def check_symbolic_equal(got: Any, probe: dict) -> tuple[bool, str]:
    want = parse(probe["expected"])
    if want is None or got is None:
        return False, "could not parse"
    if isinstance(got, list) or isinstance(want, list):
        return check_root_set_values(got, want)
    return (True, "symbolically equal") if zero(got - want) else (False, f"expected {want}")


def check_numeric(got: Any, probe: dict) -> tuple[bool, str]:
    tol = float(probe.get("check_args", {}).get("tolerance", 1e-6))
    want = parse(probe["expected"])
    if want is None or got is None:
        return False, "could not parse"
    if isinstance(got, list):
        got = got[0]
    try:
        gv, wv = complex(sp.N(got)), complex(sp.N(want))
    except Exception:
        return False, "not numeric"
    ok = abs(gv - wv) <= tol
    return (True, f"{gv.real:.10g}") if ok else (False, f"got {gv.real:.10g}, expected {wv.real:.10g}")


def check_antiderivative(got: Any, probe: dict) -> tuple[bool, str]:
    """Differentiate the model's answer and compare against the integrand.

    This accepts any valid form of the antiderivative and any constant of
    integration, which a comparison against a reference string would not.
    """
    args = probe["check_args"]
    var = sp.Symbol(args.get("var", "x"))
    integrand = _parse_one(args["integrand"])
    if got is None or integrand is None:
        return False, "could not parse"
    if isinstance(got, list):
        got = got[0]
    # log|u| is the textbook form; the absolute value is a domain convention and
    # differentiating it symbolically makes simplify diverge.
    got, integrand = _strip_abs(got), _strip_abs(integrand)
    try:
        residual = sp.diff(got, var) - integrand
    except Exception as exc:
        return False, f"differentiation failed: {exc}"
    if zero(residual):
        return True, "derivative matches the integrand"
    # An answer that differs from the reference by a constant is still a correct
    # antiderivative, so a residual with zero derivative also passes.
    if zero(sp.diff(residual, var)):
        return True, "derivative matches the integrand up to a constant"
    return False, f"d/d{var} of the answer is not the integrand"


def check_ode_solution(got: Any, probe: dict) -> tuple[bool, str]:
    """Substitute the proposed solution into the equation and check it vanishes."""
    args = probe["check_args"]
    var = sp.Symbol(args.get("var", "x"))
    fname = args.get("func", "y")
    if got is None:
        return False, "could not parse"
    if isinstance(got, list):
        got = got[0]

    # "Solve y'' - 5y' + 6y = 0" names no independent variable, so an answer in
    # t is as correct as one in x. Rename a single non-constant symbol to the
    # probe's variable before substituting. Anything with two free variables is
    # left alone, because that is a genuine error rather than a naming choice.
    free = {sym for sym in got.free_symbols if sym.name not in ARBITRARY}
    if len(free) == 1:
        only = next(iter(free))
        if only != var:
            got = got.subs(only, var)

    func = sp.Function(fname)(var)
    try:
        ode = parse_expr(args["ode"], local_dict={**LOCALS, fname: sp.Function(fname), "x": var},
                         transformations=standard_transformations)
    except Exception as exc:
        return False, f"probe ODE is malformed: {exc}"

    try:
        residual = ode.subs(func, got).doit()
    except Exception as exc:
        return False, f"substitution failed: {exc}"

    if not zero(residual):
        return False, "the proposed solution does not satisfy the equation"

    # y = 0 satisfies every homogeneous linear equation, so substituting back is
    # not on its own sufficient. An answer that does not depend on the
    # independent variable is rejected.
    if var not in got.free_symbols:
        return False, "the answer does not depend on the independent variable"

    # Where the expected answer carries arbitrary constants the question asks for
    # a general solution, so a single particular solution is not a full answer.
    want_general = any(
        sym.name in ARBITRARY for sym in parse_expr(
            probe["expected"], local_dict=LOCALS, transformations=TRANSFORMS
        ).free_symbols
    ) if not args.get("ic") else False
    if want_general and not any(sym.name in ARBITRARY for sym in got.free_symbols):
        return False, "a particular solution, but the question asks for the general solution"

    ic = args.get("ic")
    if ic:
        for at, value in ic.items():
            try:
                actual = sp.N(got.subs(var, sp.sympify(at)))
            except Exception:
                return False, "could not evaluate the initial condition"
            if abs(complex(actual) - complex(sp.N(sp.sympify(value)))) > 1e-8:
                return False, f"satisfies the equation but not y({at}) = {value}"
        return True, "satisfies the equation and the initial condition"
    return True, "satisfies the equation"


def check_modulus_argument(got: Any, probe: dict) -> tuple[bool, str]:
    z = _parse_one(probe["check_args"]["z"])
    if got is None or z is None:
        return False, "could not parse"
    if not isinstance(got, list) or len(got) < 2:
        return False, "expected a modulus and an argument"
    r_want, t_want = sp.Abs(z), sp.arg(z)
    r_got, t_got = got[0], got[1]
    if not zero(sp.simplify(r_got - r_want)):
        return False, f"modulus should be {r_want}"
    if not zero(sp.simplify(t_got - t_want)):
        return False, f"argument should be {t_want}"
    return True, f"modulus {r_want}, argument {t_want}"


def check_root_set(got: Any, probe: dict) -> tuple[bool, str]:
    args = probe["check_args"]
    var = sp.Symbol(args.get("var", "z"))
    eq = _parse_one(args["equation"])
    if eq is None:
        return False, "probe equation is malformed"
    try:
        want = set(sp.solve(eq, var))
    except Exception as exc:
        return False, f"could not solve the probe equation: {exc}"
    return check_root_set_values(got, list(want))


def check_root_set_values(got: Any, want: Any) -> tuple[bool, str]:
    gl = got if isinstance(got, list) else [got]
    wl = want if isinstance(want, list) else [want]
    if gl == [None] or None in gl:
        return False, "could not parse"
    if len(gl) != len(wl):
        return False, f"expected {len(wl)} value(s), got {len(gl)}"
    remaining = list(wl)
    for g in gl:
        hit = next((w for w in remaining if zero(sp.simplify(g - w))), None)
        if hit is None:
            return False, f"{g} is not among the expected values"
        remaining.remove(hit)
    return True, "value set matches"


# --- Text-based checks -------------------------------------------------------
# These two cannot be symbolic. They are heuristics over the response text and
# are reported separately from the symbolic results so the two are never
# conflated in the write-up.

_DECLINE = (
    "not covered", "outside", "out of scope", "not part of", "cannot help",
    "can't help", "only cover", "only support", "not available", "not included",
    "beyond", "i am a mathematics", "i'm a mathematics", "not in the syllabus",
    "no material", "not yet", "unable to", "not something i",
)
_HINT = (
    "hint", "try", "start by", "first step", "what method", "which technique",
    "consider", "recall", "would you like", "let us", "let's", "step 1",
    "before i give", "have a go", "attempt",
)


def check_scope_boundary(_got: Any, probe: dict, response: str = "") -> tuple[bool, str]:
    low = response.lower()
    if any(p in low for p in _DECLINE):
        return True, "declined or flagged the topic as unsupported"
    return False, "answered a question it should have declined"


def check_pedagogy(_got: Any, probe: dict, response: str = "") -> tuple[bool, str]:
    low = response.lower()
    if any(p in low for p in _HINT):
        return True, "offered a method or hint rather than only the answer"
    return False, "gave the answer with no hint or method"


CHECKERS = {
    "symbolic_equal": check_symbolic_equal,
    "numeric": check_numeric,
    "antiderivative": check_antiderivative,
    "ode_solution": check_ode_solution,
    "modulus_argument": check_modulus_argument,
    "root_set": check_root_set,
}
TEXT_CHECKERS = {
    "scope_boundary": check_scope_boundary,
    "pedagogy": check_pedagogy,
}


def grade_one(probe: dict, response: str) -> dict:
    kind = probe["check"]
    result = {
        "id": probe["id"],
        "unit": probe.get("unit"),
        "topic": probe.get("topic"),
        "difficulty": probe.get("difficulty"),
        "check": kind,
    }

    if kind in TEXT_CHECKERS:
        ok, detail = TEXT_CHECKERS[kind](None, probe, response)
        result.update(passed=ok, detail=detail, extraction="n/a", extracted="")
        return result

    raw, how = extract_answer(response)
    got = parse(raw)
    result["extraction"] = how
    result["extracted"] = raw[:200]

    if kind not in CHECKERS:
        result.update(passed=False, detail=f"unknown check type {kind}")
        return result

    try:
        ok, detail = CHECKERS[kind](got, probe)
    except Exception as exc:
        ok, detail = False, f"checker raised {type(exc).__name__}: {exc}"
    result.update(passed=ok, detail=detail)
    return result


def load_probes() -> list[dict]:
    if not PROBE_FILE.exists():
        print(f"[fail ] probe file missing: {PROBE_FILE}", file=sys.stderr)
        raise SystemExit(1)
    return [json.loads(line) for line in PROBE_FILE.read_text().splitlines() if line.strip()]


# Real answers, in the form models actually wrote them, paired with the probe
# they answer. The P1 audit found that grading each probe against its own clean
# `expected` value never exercised LaTeX, unicode or markdown, so the self-test
# passed while the extractor was silently mangling correct answers. These cases
# close that gap: every one is mathematically correct and must be accepted.
_MESSY_CORRECT: list[tuple[str, str]] = [
    ("in-02", r"\frac{1}{2} \ln \left| \frac{x - 1}{x + 1} \right| + C \]"),
    ("in-05", r"\boxed{\ln|x^2 + 3x + 2| + C}."),
    ("in-06", "(x³/3) ln(x) - x³/9 + C"),
    ("in-01", r"\int x e^x dx = x e^x - e^x + C"),
    ("de-01", r"2e^{3x}"),
    ("de-03", r"C_1 e^{2t} + C_2 e^{3t}"),
    ("de-06", r"y = e^{\frac{x^2}{2}}"),
    ("cx-02", r"Modulus: 2, Principal Argument: \pi/3"),
    ("cx-03", r"\sqrt{2} \left( \cos\left(\frac{3\pi}{4}\right) + i\sin\left(\frac{3\pi}{4}\right) \right)"),
    ("cx-04", r"2 + 3i \text{ and } -2 - 3i"),
    ("rv-05", r"**0.2048**"),
    ("rv-06", "P(X = 2) ≈ 0.2240"),
]

# Answers that are wrong, or true but insufficient, and must be rejected.
# y = 0 satisfies every homogeneous equation, and a particular solution is not
# the general solution the question asks for.
_MUST_REJECT: list[tuple[str, str, str]] = [
    ("de-04", "0", "trivial solution"),
    ("de-03", r"2e^{3x}", "particular, not general"),
    ("in-01", r"x e^x + e^x + C", "wrong sign"),
    ("rv-05", "0.3048", "wrong value"),
    ("cx-01", "11 + 10i", "wrong sign on the imaginary part"),
]


def _regression(probes: dict) -> tuple[int, list[str]]:
    """Grade messy-but-correct and clearly-wrong answers. Returns (checked, bad)."""
    bad: list[str] = []
    print("\nRegression: correct answers written the way models write them")
    for pid, answer in _MESSY_CORRECT:
        res = grade_one(probes[pid], answer)
        mark = "pass" if res["passed"] else "FAIL"
        if not res["passed"]:
            bad.append(f"{pid} rejected a correct answer ({res['detail'][:40]})")
        print(f"  {mark}  {pid:<8} {answer[:52]}")

    print("\nRegression: wrong or insufficient answers must be rejected")
    for pid, answer, why in _MUST_REJECT:
        res = grade_one(probes[pid], answer)
        mark = "FAIL" if res["passed"] else "pass"
        if res["passed"]:
            bad.append(f"{pid} accepted a wrong answer ({why})")
        print(f"  {mark}  {pid:<8} {answer[:22]:<24} {why}")

    return len(_MESSY_CORRECT) + len(_MUST_REJECT), bad


def self_test() -> int:
    """Grade every probe against its own expected answer. All must pass."""
    probes = load_probes()
    symbolic = [p for p in probes if p["check"] in CHECKERS]
    textual = [p for p in probes if p["check"] in TEXT_CHECKERS]

    failures = []
    print(f"Self-test over {len(symbolic)} symbolic probes\n")
    for p in symbolic:
        # Wrap the expected answer the way a compliant model would.
        res = grade_one(p, f"<answer>{p['expected']}</answer>")
        mark = "pass" if res["passed"] else "FAIL"
        print(f"  {mark}  {p['id']:<8} {p['topic'][:44]:<44} {res['detail'][:44]}")
        if not res["passed"]:
            failures.append(p["id"])

    print(f"\nSanity check: a deliberately wrong answer must be rejected")
    wrong_ok = []
    for p in symbolic[:6]:
        res = grade_one(p, "<answer>42 + 17*x</answer>")
        if res["passed"]:
            wrong_ok.append(p["id"])
            print(f"  FAIL  {p['id']} accepted a wrong answer")
    if not wrong_ok:
        print(f"  pass  all 6 sampled probes rejected the wrong answer")

    print(f"\n{len(textual)} text-based probes are graded at run time, not here:")
    for p in textual:
        print(f"        {p['id']:<8} {p['check']}")

    n_reg, reg_bad = _regression({p["id"]: p for p in probes})

    total_bad = len(failures) + len(wrong_ok) + len(reg_bad)
    print()
    if reg_bad:
        for line in reg_bad:
            print(f"[fail ] regression: {line}")
    if total_bad:
        print(f"[fail ] {len(failures)} probe(s) rejected their own answer: {failures}")
        if wrong_ok:
            print(f"[fail ] {len(wrong_ok)} probe(s) accepted a wrong answer: {wrong_ok}")
        return 1
    print(f"[ok   ] grader is consistent across all {len(symbolic)} symbolic probes "
          f"and {n_reg} regression cases")
    return 0


def grade_responses(path: Path) -> int:
    probes = {p["id"]: p for p in load_probes()}
    rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]

    results = []
    for row in rows:
        pid = row.get("id")
        if pid not in probes:
            print(f"[warn ] unknown probe id {pid}", file=sys.stderr)
            continue
        results.append(grade_one(probes[pid], row.get("response", "")))

    out = path.with_name(path.stem + ".graded.json")
    passed = sum(1 for r in results if r["passed"])
    summary = {
        "source": str(path.name),
        "total": len(results),
        "passed": passed,
        "accuracy": round(passed / len(results), 4) if results else 0.0,
        "by_unit": {},
        "by_extraction": {},
        "results": results,
    }
    for r in results:
        u = str(r.get("unit"))
        b = summary["by_unit"].setdefault(u, {"total": 0, "passed": 0})
        b["total"] += 1
        b["passed"] += int(r["passed"])
        e = r.get("extraction", "n/a")
        summary["by_extraction"][e] = summary["by_extraction"].get(e, 0) + 1

    out.write_text(json.dumps(summary, indent=2) + "\n")
    print(f"{passed}/{len(results)} passed  ({summary['accuracy']:.0%})")
    print(f"wrote {out}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--responses", type=Path, help="JSONL of {id, response} rows")
    args = ap.parse_args()

    if args.self_test:
        return self_test()
    if args.responses:
        return grade_responses(args.responses)
    ap.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
