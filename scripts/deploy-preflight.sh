#!/usr/bin/env bash
set -euo pipefail

# SHARED-PROD-01: Build & Deployment Resource Preflight + Concurrent Guard
# Usage: ./scripts/deploy-preflight.sh [COMMAND...]

LOCK_FILE="/tmp/neo-avo-deploy.lock"

# 1. Concurrent Deploy Protection (Phase 5) - Native Linux flock lock
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "DEPLOYMENT_ALREADY_IN_PROGRESS: Another build/deployment is currently executing." >&2
  exit 1
fi

# 2. Deployment Resource Preflight Check (Phase 4) - Dynamic Linux capacity check
VCPU_COUNT=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)
LOAD_1MIN=$(uptime | awk -F'load average: |load averages?: ' '{print $2}' | awk '{print $1}' | tr -d ',')

# Distinguish temporary spike from sustained pressure: Load 1-min > 1.8 * vCPU count
LOAD_CRITICAL=$(python3 -c "print(float('$LOAD_1MIN') > $VCPU_COUNT * 1.8)" 2>/dev/null || echo "False")

if [ "$LOAD_CRITICAL" = "True" ]; then
  echo "BUILD_ABORTED: Sustained CPU/load pressure too high (Load: $LOAD_1MIN, vCPUs: $VCPU_COUNT)." >&2
  exit 2
fi

echo "Preflight check passed. Proceeding with deployment/build..."

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

