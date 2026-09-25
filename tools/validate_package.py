#!/usr/bin/env python3
"""Validate a curriculum package before it is released or imported.

The format is described in docs/CURRICULUM_PACKAGE_FORMAT.md. This checks the
structural rules and, more importantly, proves every exercise's answer key with
the same checkers that graded the candidate models in tools/grade.py: the
expected answer must grade as correct, every accepted alternative must grade as
correct, and a deliberately wrong answer must be rejected.

Usage:
    ./.venv/bin/python tools/validate_package.py curriculum/rw_s6_mathematics/packages/u1
    ./.venv/bin/python tools/validate_package.py <dir> --quiet     # only problems and the verdict
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import grade  # noqa: E402

ID_RULES = {
    "package": re.compile(r"^rw-s6-am\.u(\d+)$"),
    "lesson": re.compile(r"^rw-s6-am\.u(\d+)\.l(\d{2})$"),
    "example": re.compile(r"^rw-s6-am\.u(\d+)\.ex\.(\d{2})$"),
    "exercise": re.compile(r"^rw-s6-am\.u(\d+)\.q\.(\d{3})$"),
}
REVIEW_RANK = {"developer-test": 0, "teacher-reviewed": 1}
DIFFICULTIES = {"basic", "intermediate", "advanced"}
INPUTS = {"expression", "number", "pair", "choice"}
BLOCK_KINDS = {"p", "math", "example"}
REQUIRED_ARGS = {
    "symbolic_equal": (),
    "numeric": (),
    "root_set": ("equation",),
    "modulus_argument": ("z",),
    "antiderivative": ("integrand",),
    "ode_solution": ("ode",),
}


class Report:
    def __init__(self) -> None:
        self.problems: list[str] = []
        self.counts: dict[str, int] = {"lessons": 0, "examples": 0, "exercises": 0, "hints": 0, "keys_proven": 0}

    def fail(self, where: str, what: str) -> None:
        self.problems.append(f"{where}: {what}")

    @property
    def ok(self) -> bool:
        return not self.problems


# ---------------------------------------------------------------------------
# Field checks
# ---------------------------------------------------------------------------

def check_tex(rep: Report, where: str, tex: Any) -> None:
    if not isinstance(tex, str) or not tex.strip():
        rep.fail(where, "tex is empty")
        return
    if "$" in tex:
        rep.fail(where, "tex contains '$'; delimiters are not used")
    depth = 0
    for ch in tex:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        if depth < 0:
            break
    if depth != 0:
        rep.fail(where, "tex has unbalanced braces")


def check_rich(rep: Report, where: str, node: Any, tex_required: bool = False) -> None:
    if not isinstance(node, dict):
        rep.fail(where, "expected an object with text and/or tex")
        return
    text, tex = node.get("text"), node.get("tex")
    if text is None and tex is None:
        rep.fail(where, "has neither text nor tex")
    if text is not None and (not isinstance(text, str) or not text.strip()):
        rep.fail(where, "text is empty")
    if tex is not None or tex_required:
        check_tex(rep, where, tex)


def check_id(rep: Report, where: str, kind: str, value: Any, unit: int) -> bool:
    m = ID_RULES[kind].match(str(value))
    if not m:
        rep.fail(where, f"{kind} id {value!r} does not match {ID_RULES[kind].pattern}")
        return False
    if int(m.group(1)) != unit:
        rep.fail(where, f"id {value} belongs to unit {m.group(1)}, package is unit {unit}")
        return False
    return True


def check_pages(rep: Report, where: str, pages: Any, span: tuple[int, int]) -> None:
    if not (isinstance(pages, list) and len(pages) in (1, 2) and all(isinstance(p, int) for p in pages)):
        rep.fail(where, "pages must be [page] or [first, last]")
        return
    lo, hi = pages[0], pages[-1]
    if lo > hi or lo < span[0] or hi > span[1]:
        rep.fail(where, f"pages {pages} outside the unit's range {list(span)}")


def check_review(rep: Report, where: str, review: Any) -> int:
    if not isinstance(review, dict) or review.get("status") not in REVIEW_RANK:
        rep.fail(where, "review.status must be developer-test or teacher-reviewed")
        return 0
    if review["status"] == "teacher-reviewed" and not (review.get("reviewed_by") and review.get("date")):
        rep.fail(where, "teacher-reviewed requires reviewed_by and date")
    return REVIEW_RANK[review["status"]]


# ---------------------------------------------------------------------------
# Answer keys, proven with the grader
# ---------------------------------------------------------------------------

def _probe(ex_id: str, answer: dict) -> dict:
    return {
        "id": ex_id,
        "check": answer["check"],
        "expected": answer["expected"],
        "check_args": answer.get("check_args", {}),
    }


def _grades(probe: dict, text: str) -> tuple[bool, str]:
    res = grade.grade_one(probe, f"<answer>{text}</answer>")
    return bool(res["passed"]), str(res["detail"])


def check_answer(rep: Report, where: str, answer: Any) -> None:
    if not isinstance(answer, dict):
        rep.fail(where, "answer must be an object")
        return
    check = answer.get("check")
    if check not in grade.CHECKERS:
        rep.fail(where, f"unknown check {check!r}; one of {sorted(grade.CHECKERS)}")
        return
    for arg in REQUIRED_ARGS[check]:
        if arg not in answer.get("check_args", {}):
            rep.fail(where, f"check {check} needs check_args.{arg}")
            return
    expected = answer.get("expected")
    if not isinstance(expected, str) or not expected.strip():
        rep.fail(where, "expected is empty")
        return
    if grade.parse(expected) is None:
        rep.fail(where, f"expected {expected!r} does not parse")
        return
    if answer.get("input", "expression") not in INPUTS:
        rep.fail(where, f"input must be one of {sorted(INPUTS)}")
    check_tex(rep, f"{where}.display_tex", answer.get("display_tex"))

    probe = _probe(where, answer)
    ok, detail = _grades(probe, expected)
    if not ok:
        rep.fail(where, f"expected answer does not grade as correct: {detail}")
        return
    for alt in answer.get("accepted", []) or []:
        ok, detail = _grades(probe, alt)
        if not ok:
            rep.fail(where, f"accepted form {alt!r} does not grade as correct: {detail}")

    # A key that accepts everything is worse than no key. For the two checkers
    # where a wrong answer is easy to construct, prove one is rejected.
    if check in ("symbolic_equal", "numeric"):
        wrong = f"({expected}) + 1"
        ok, _ = _grades(probe, wrong)
        if ok:
            rep.fail(where, f"key accepted a wrong answer {wrong!r}")
            return
    rep.counts["keys_proven"] += 1


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

def load(rep: Report, path: Path, expect: type) -> Any:
    if not path.exists():
        rep.fail(path.name, "missing")
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        rep.fail(path.name, f"invalid JSON: {exc}")
        return None
    if not isinstance(data, expect):
        rep.fail(path.name, f"top level must be a {expect.__name__}")
        return None
    return data


def validate(pkg_dir: Path) -> Report:
    rep = Report()
    manifest = load(rep, pkg_dir / "package.json", dict)
    if manifest is None:
        return rep

    for field in ("id", "version", "curriculum", "unit", "unit_title", "source", "attribution", "review", "files"):
        if field not in manifest:
            rep.fail("package.json", f"missing {field}")
    if rep.problems:
        return rep

    unit = manifest["unit"]
    if not isinstance(unit, int):
        rep.fail("package.json", "unit must be an integer")
        return rep
    check_id(rep, "package.json", "package", manifest["id"], unit)
    if not re.fullmatch(r"\d+\.\d+\.\d+", str(manifest["version"])):
        rep.fail("package.json", f"version {manifest['version']!r} is not major.minor.patch")
    src = manifest["source"]
    span = tuple(src.get("pages", [])) if isinstance(src, dict) else ()
    if len(span) != 2 or not all(isinstance(p, int) for p in span) or span[0] > span[1]:
        rep.fail("package.json", "source.pages must be [first, last]")
        return rep
    for field in ("student_book", "teacher_guide"):
        if not src.get(field):
            rep.fail("package.json", f"source.{field} is empty")
    if not str(manifest["attribution"]).strip():
        rep.fail("package.json", "attribution is empty")
    pkg_rank = check_review(rep, "package.json", manifest["review"])

    files = manifest["files"]
    lessons = load(rep, pkg_dir / files.get("lessons", "lessons.json"), list) or []
    examples = load(rep, pkg_dir / files.get("examples", "examples.json"), list) or []
    exercises = load(rep, pkg_dir / files.get("exercises", "exercises.json"), list) or []

    seen: dict[str, str] = {}
    lowest_rank = 1

    def register(where: str, kind: str, item: dict) -> str | None:
        value = item.get("id")
        if not check_id(rep, where, kind, value, unit):
            return None
        if value in seen:
            rep.fail(where, f"duplicate id {value} (also in {seen[value]})")
            return None
        seen[value] = where
        return value

    example_ids: set[str] = set()
    for i, ex in enumerate(examples):
        where = f"examples[{i}]"
        if not isinstance(ex, dict):
            rep.fail(where, "must be an object")
            continue
        eid = register(where, "example", ex)
        if eid:
            example_ids.add(eid)
            where = eid
        check_pages(rep, where, ex.get("pages"), span)
        if not str(ex.get("source_label", "")).strip():
            rep.fail(where, "source_label is empty")
        check_rich(rep, f"{where}.question", ex.get("question"))
        steps = ex.get("steps")
        if not isinstance(steps, list) or not steps:
            rep.fail(where, "steps must be a non-empty list")
        else:
            for k, step in enumerate(steps):
                check_rich(rep, f"{where}.steps[{k}]", step)
        check_tex(rep, f"{where}.answer_tex", ex.get("answer_tex"))
        lowest_rank = min(lowest_rank, check_review(rep, where, ex.get("review", manifest["review"])))
        rep.counts["examples"] += 1

    exercise_ids: set[str] = set()
    for i, q in enumerate(exercises):
        where = f"exercises[{i}]"
        if not isinstance(q, dict):
            rep.fail(where, "must be an object")
            continue
        qid = register(where, "exercise", q)
        if qid:
            exercise_ids.add(qid)
            where = qid
        check_pages(rep, where, q.get("pages"), span)
        if not str(q.get("source_label", "")).strip():
            rep.fail(where, "source_label is empty")
        if q.get("difficulty") not in DIFFICULTIES:
            rep.fail(where, f"difficulty must be one of {sorted(DIFFICULTIES)}")
        check_rich(rep, f"{where}.prompt", q.get("prompt"))
        hints = q.get("hints")
        if not isinstance(hints, list) or len(hints) < 2 or not all(isinstance(h, str) and h.strip() for h in hints):
            rep.fail(where, "hints must be a list of at least two non-empty strings")
        else:
            rep.counts["hints"] += len(hints)
        solution = q.get("solution")
        if not isinstance(solution, list) or not solution:
            rep.fail(where, "solution must be a non-empty list of steps")
        else:
            for k, step in enumerate(solution):
                check_rich(rep, f"{where}.solution[{k}]", step)
        check_answer(rep, f"{where}.answer", q.get("answer"))
        lowest_rank = min(lowest_rank, check_review(rep, where, q.get("review", manifest["review"])))
        rep.counts["exercises"] += 1

    for i, lesson in enumerate(lessons):
        where = f"lessons[{i}]"
        if not isinstance(lesson, dict):
            rep.fail(where, "must be an object")
            continue
        lid = register(where, "lesson", lesson)
        if lid:
            where = lid
        for field in ("title", "objective"):
            if not str(lesson.get(field, "")).strip():
                rep.fail(where, f"{field} is empty")
        tg = lesson.get("tg_lessons")
        if not isinstance(tg, list) or not tg or not all(re.fullmatch(r"\d+\.\d+", str(t)) for t in tg):
            rep.fail(where, "tg_lessons must list Teacher's Guide lesson numbers like \"1.7\"")
        check_pages(rep, where, lesson.get("pages"), span)
        blocks = lesson.get("blocks")
        if not isinstance(blocks, list) or not blocks:
            rep.fail(where, "blocks must be a non-empty list")
        else:
            for k, b in enumerate(blocks):
                bw = f"{where}.blocks[{k}]"
                kind = b.get("kind") if isinstance(b, dict) else None
                if kind not in BLOCK_KINDS:
                    rep.fail(bw, f"kind must be one of {sorted(BLOCK_KINDS)}")
                elif kind == "p":
                    check_rich(rep, bw, {"text": b.get("text")})
                    tags = b.get("topics")
                    if tags is not None:
                        if not isinstance(tags, list) or not tags or not all(isinstance(t, str) and t.strip() for t in tags):
                            rep.fail(bw, "topics must be a non-empty list of strings when present")
                        else:
                            for t in tags:
                                if t not in (lesson.get("topics") or []):
                                    rep.fail(bw, f"paragraph topic {t!r} is not one of the lesson's topics")
                elif kind == "math":
                    check_tex(rep, bw, b.get("tex"))
                elif b.get("ref") not in example_ids:
                    rep.fail(bw, f"example ref {b.get('ref')!r} does not exist")
        for k, ref in enumerate(lesson.get("exercises", []) or []):
            if ref not in exercise_ids:
                rep.fail(f"{where}.exercises[{k}]", f"exercise {ref!r} does not exist")
        topics = lesson.get("topics")
        if not isinstance(topics, list) or not topics:
            rep.fail(where, "topics must list at least one keyword for the topic router")
        lowest_rank = min(lowest_rank, check_review(rep, where, lesson.get("review", manifest["review"])))
        rep.counts["lessons"] += 1

    # Every exercise and example should belong to a lesson that exists.
    lesson_ids = {l.get("id") for l in lessons if isinstance(l, dict)}
    for item in [*examples, *exercises]:
        if isinstance(item, dict) and item.get("lesson") not in lesson_ids:
            rep.fail(str(item.get("id")), f"lesson {item.get('lesson')!r} does not exist")

    if pkg_rank > lowest_rank:
        rep.fail("package.json", "review.status is higher than at least one item's status")
    return rep


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("package_dir", type=Path)
    ap.add_argument("--quiet", action="store_true", help="print only problems and the verdict")
    args = ap.parse_args(argv)

    rep = validate(args.package_dir)
    for line in rep.problems:
        print(f"[fail ] {line}")
    if not args.quiet:
        c = rep.counts
        print(f"        {c['lessons']} lesson(s), {c['examples']} worked example(s), "
              f"{c['exercises']} exercise(s) with {c['hints']} hint(s); {c['keys_proven']} answer key(s) proven")
    if rep.ok:
        print(f"[ok   ] {args.package_dir} is valid")
        return 0
    print(f"[fail ] {len(rep.problems)} problem(s) in {args.package_dir}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
