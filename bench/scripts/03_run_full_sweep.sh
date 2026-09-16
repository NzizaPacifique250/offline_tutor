#!/usr/bin/env bash
# Run the complete feasibility sweep on the tablet, in the order that produces the
# most useful result soonest if it has to be interrupted.
#
#   1. Throughput for every generation model         (~10 minutes)
#   2. All probes on the primary math model           (~95 minutes)
#   3. All probes on the comparison models            (~90 minutes each)
#
# Each probe result is written as it completes, so an interrupted run keeps
# everything finished so far. Re-running skips nothing; delete a model's raw
# file to redo it.
#
# Usage: bench/scripts/03_run_full_sweep.sh [--threads N] [--n-predict N]

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_device

THREADS=3         # measured optimum on the RK3562; 4 threads is slower
N_PREDICT=768     # Qwen-Math needs ~250 tokens for a basic probe; leave headroom
CTX=1536

while [ $# -gt 0 ]; do
  case "$1" in
    --threads)   THREADS="$2"; shift 2 ;;
    --n-predict) N_PREDICT="$2"; shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done

PRIMARY="qwen25-math-1.5b"
COMPARISON="qwen25-1.5b llama32-1b qwen3-1.7b"

LOG="$RESULTS_DIR/sweep.log"
mkdir -p "$RESULTS_DIR/raw"
exec > >(tee -a "$LOG") 2>&1

log "=== full sweep started $(date -u '+%Y-%m-%d %H:%M UTC') ==="
log "threads=$THREADS n_predict=$N_PREDICT ctx=$CTX"

log "--- stage 1: throughput, all models ---"
python tools/run_bench.py --throughput-only --threads "$THREADS" \
  || warn "throughput stage had errors; continuing"

log "--- stage 2: probes, primary model ($PRIMARY) ---"
python tools/run_bench.py --probes-only --models "$PRIMARY" \
  --threads "$THREADS" --n-predict "$N_PREDICT" --ctx "$CTX" \
  || warn "primary probe stage had errors; continuing"

log "--- stage 3: probes, comparison models ---"
for m in $COMPARISON; do
  log "  model: $m"
  python tools/run_bench.py --probes-only --models "$m" \
    --threads "$THREADS" --n-predict "$N_PREDICT" --ctx "$CTX" \
    || warn "probe stage for $m had errors; continuing"
done

log "--- stage 4: grading ---"
for f in "$RESULTS_DIR"/raw/*.jsonl; do
  [ -f "$f" ] || continue
  log "  grading $(basename "$f")"
  python tools/grade.py --responses "$f" || warn "grading failed for $f"
done

log "=== full sweep finished $(date -u '+%Y-%m-%d %H:%M UTC') ==="
