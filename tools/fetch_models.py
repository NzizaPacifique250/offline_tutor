#!/usr/bin/env python3
"""Download candidate GGUF models listed in bench/models.json.

Filenames are resolved from the Hugging Face API instead of being hardcoded,
because quantization filenames differ between uploaders and change when a repo is
re-uploaded. Downloads resume, so an interrupted fetch over a slow link is cheap
to retry.

Usage:
    python tools/fetch_models.py --tier A
    python tools/fetch_models.py --id qwen25-math-1.5b
    python tools/fetch_models.py --tier A --kind embedding
    python tools/fetch_models.py --tier A --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = PROJECT_ROOT / "bench" / "models.json"
MODELS_DIR = PROJECT_ROOT / "bench" / "models"

HF_API = "https://huggingface.co/api/models/{repo}"
HF_FILE = "https://huggingface.co/{repo}/resolve/main/{filename}"

# A repo can hold many quantizations. Prefer an exact single-file match and skip
# multi-part shards, which llama.cpp can load but which complicate pushing to a
# device.
SHARD_MARKERS = ("-00001-of-", "-of-0000")


def die(msg: str) -> "None":
    print(f"[fail ] {msg}", file=sys.stderr)
    raise SystemExit(1)


def log(msg: str) -> None:
    print(f"[fetch] {msg}", flush=True)


def http_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "capstone-bench/1.0"})
    token = os.environ.get("HF_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def list_repo_files(repo: str) -> list[str]:
    """Return every filename in a repo, or an empty list if it is unreachable."""
    try:
        data = http_json(HF_API.format(repo=repo))
    except urllib.error.HTTPError as exc:
        print(f"[warn ] {repo}: HTTP {exc.code} {exc.reason}", file=sys.stderr)
        return []
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"[warn ] {repo}: {exc}", file=sys.stderr)
        return []
    return [s["rfilename"] for s in data.get("siblings", [])]


def pick_file(files: list[str], quant: str) -> str | None:
    """Choose the GGUF file matching the requested quantization.

    Matching is case-insensitive because uploaders are inconsistent about
    Q4_K_M versus q4_k_m. Shards are rejected outright.
    """
    ggufs = [f for f in files if f.lower().endswith(".gguf")]
    ggufs = [f for f in ggufs if not any(m in f for m in SHARD_MARKERS)]
    if not ggufs:
        return None

    want = quant.lower()
    exact = [f for f in ggufs if want in f.lower()]
    if exact:
        # Shortest name is the plain quantization, not a variant such as
        # "Q4_K_M-imat" or a subdirectory copy.
        return min(exact, key=lambda f: (f.count("/"), len(f)))

    # The requested quantization is absent. Fall back to any Q4 variant so the
    # benchmark can still run, and say so loudly.
    q4 = [f for f in ggufs if "q4" in f.lower()]
    if q4:
        choice = min(q4, key=lambda f: (f.count("/"), len(f)))
        print(f"[warn ] {quant} not found; falling back to {choice}", file=sys.stderr)
        return choice
    return None


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(n) < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def download(repo: str, filename: str, dest: Path) -> bool:
    """Download with resume. Returns True if the file is complete afterwards."""
    url = HF_FILE.format(repo=repo, filename=filename)
    tmp = dest.with_suffix(dest.suffix + ".part")
    have = tmp.stat().st_size if tmp.exists() else 0

    headers = {"User-Agent": "capstone-bench/1.0"}
    token = os.environ.get("HF_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if have:
        headers["Range"] = f"bytes={have}-"
        log(f"  resuming at {human(have)}")

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            # A 200 in response to a Range request means the server ignored it,
            # so the partial file must be discarded to avoid a corrupt result.
            if have and resp.status == 200:
                have = 0
                tmp.unlink(missing_ok=True)

            total = int(resp.headers.get("Content-Length", 0)) + have
            mode = "ab" if have else "wb"
            done = have
            last_pct = -1
            with open(tmp, mode) as fh:
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    fh.write(chunk)
                    done += len(chunk)
                    if total:
                        pct = int(done * 100 / total)
                        if pct != last_pct and pct % 5 == 0:
                            print(
                                f"\r  {human(done)} / {human(total)}  {pct:3d}%",
                                end="",
                                flush=True,
                            )
                            last_pct = pct
            print()
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        print(f"[warn ] download failed: {exc}", file=sys.stderr)
        return False

    tmp.rename(dest)
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--tier", default="A", choices=["A", "B", "all"])
    ap.add_argument("--kind", default="all", choices=["generation", "embedding", "all"])
    ap.add_argument("--id", action="append", default=[], help="fetch one model by id")
    ap.add_argument("--dry-run", action="store_true", help="resolve filenames only")
    args = ap.parse_args()

    if not MANIFEST.exists():
        die(f"manifest not found: {MANIFEST}")
    manifest = json.loads(MANIFEST.read_text())

    kinds = ["generation", "embedding"] if args.kind == "all" else [args.kind]
    wanted = []
    for kind in kinds:
        for entry in manifest.get(kind, []):
            if args.id:
                if entry["id"] in args.id:
                    wanted.append((kind, entry))
            elif args.tier == "all" or entry.get("tier") == args.tier:
                wanted.append((kind, entry))

    if not wanted:
        die("nothing matched the selection")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    resolved, failed, skipped = [], [], []

    for kind, entry in wanted:
        repo, quant, mid = entry["repo"], entry["quant"], entry["id"]
        log(f"{mid}  ({kind}, tier {entry.get('tier')}, ~{entry.get('approx_gb')} GB)")
        log(f"  repo {repo}")

        files = list_repo_files(repo)
        if not files:
            failed.append((mid, "repo unreachable or empty"))
            continue

        chosen = pick_file(files, quant)
        if not chosen:
            failed.append((mid, f"no GGUF matching {quant}"))
            continue

        # Flat local naming keeps the push script and the results table simple.
        dest = MODELS_DIR / f"{mid}-{Path(chosen).name}"
        log(f"  file {chosen}")
        resolved.append((mid, repo, chosen, dest))

        if args.dry_run:
            continue
        if dest.exists() and dest.stat().st_size > 0:
            log(f"  already downloaded ({human(dest.stat().st_size)}), skipped")
            skipped.append(mid)
            continue
        if download(repo, chosen, dest):
            log(f"  saved {dest.name} ({human(dest.stat().st_size)})")
        else:
            failed.append((mid, "download failed"))

    print()
    log(f"resolved {len(resolved)}, skipped {len(skipped)}, failed {len(failed)}")
    for mid, reason in failed:
        print(f"  FAILED  {mid}: {reason}", file=sys.stderr)

    # Record what was resolved so the benchmark runner knows the chat template
    # and dimensions for each file without re-reading the manifest.
    if not args.dry_run and resolved:
        index = {
            mid: {
                "repo": repo,
                "remote_file": remote,
                "local_file": dest.name,
                "exists": dest.exists(),
                "bytes": dest.stat().st_size if dest.exists() else 0,
            }
            for mid, repo, remote, dest in resolved
        }
        out = MODELS_DIR / "downloaded.json"
        out.write_text(json.dumps(index, indent=2) + "\n")
        log(f"wrote {out.relative_to(PROJECT_ROOT)}")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
