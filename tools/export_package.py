#!/usr/bin/env python3
"""Export a curriculum package as one release file for the admin portal.

The tablets load lessons from packages. A new or corrected unit reaches
them as a release: the admin uploads the file this tool writes on the
portal's Content page, and connected tablets offer to install it (offline
tablets import the same file from Teacher tools). The tool first runs
tools/validate_package.py, which proves every answer key with SymPy, and
writes nothing if the package is not valid.

The file holds the package exactly as the app bundles it (manifest,
lessons, worked examples, exercises) under a format marker:

    {"format": "offline-tutor-package", "format_version": 1,
     "manifest": {...}, "lessons": [...], "examples": [...], "exercises": [...]}

Usage:
    ./.venv/bin/python tools/export_package.py curriculum/rw_s6_mathematics/packages/u4
    ./.venv/bin/python tools/export_package.py <package dir> --out <folder>   # default: dist/content
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_package  # noqa: E402

FORMAT = "offline-tutor-package"
FORMAT_VERSION = 1
ROOT = Path(__file__).resolve().parent.parent


def export(pkg_dir: Path, out_dir: Path) -> Path:
    rep = validate_package.validate(pkg_dir)
    if not rep.ok:
        for line in rep.problems:
            print(f"[fail ] {line}")
        raise SystemExit(f"[fail ] {pkg_dir} is not valid; nothing was written")

    manifest = json.loads((pkg_dir / "package.json").read_text(encoding="utf-8"))
    files = manifest["files"]
    release = {
        "format": FORMAT,
        "format_version": FORMAT_VERSION,
        "manifest": manifest,
        "lessons": json.loads((pkg_dir / files["lessons"]).read_text(encoding="utf-8")),
        "examples": json.loads((pkg_dir / files["examples"]).read_text(encoding="utf-8")),
        "exercises": json.loads((pkg_dir / files["exercises"]).read_text(encoding="utf-8")),
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{manifest['id']}-{manifest['version']}.json"
    text = json.dumps(release, ensure_ascii=False, indent=1) + "\n"
    out.write_text(text, encoding="utf-8")
    c = rep.counts
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    print(f"[ok   ] {out} ({len(text.encode('utf-8'))} bytes): {manifest['unit_title']} v{manifest['version']}, "
          f"{c['lessons']} lesson(s), {c['exercises']} exercise(s), {c['keys_proven']} key(s) proven")
    print(f"        sha256 {digest}")
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("package_dir", type=Path)
    ap.add_argument("--out", type=Path, default=ROOT / "dist" / "content", help="folder for the release file")
    args = ap.parse_args(argv)
    export(args.package_dir, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
