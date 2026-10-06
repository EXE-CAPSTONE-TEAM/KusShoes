#!/usr/bin/env bash
# openclaw-harness-generated v2 — do not edit.
# Project-specific steps belong in harness/verify.local.sh, which the engine
# sources at the end of the run (it can call run_step / skip_step directly).
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="/home/tak/openclaw/harness/verify.sh"

if [ ! -x "$ENGINE" ]; then
    echo "❌ OpenClaw harness engine missing or not executable: $ENGINE" >&2
    exit 64
fi

exec "$ENGINE" "$PROJECT_ROOT" "$@"
