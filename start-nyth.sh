#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${NYTH_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
ENV_FILE="${NYTH_ENV_FILE:-$APP_DIR/.env}"

cd "$APP_DIR"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
exec npm run start -w server
