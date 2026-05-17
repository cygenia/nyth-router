#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${NYTH_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
ENV_FILE="${NYTH_ENV_FILE:-$APP_DIR/.env}"
TMP_ENV=""

secure_remove() {
  local f="${1:-}"
  if [[ -n "$f" && -e "$f" ]]; then
    shred -u "$f" 2>/dev/null || rm -f "$f"
  fi
}

cleanup() {
  secure_remove "$TMP_ENV"
}
trap cleanup EXIT INT TERM

cd "$APP_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
elif [[ -f "$ENV_FILE.gpg" ]]; then
  if ! command -v gpg >/dev/null 2>&1; then
    echo "ERROR: gpg not found; cannot decrypt $ENV_FILE.gpg" >&2
    exit 1
  fi
  TMP_ENV="/dev/shm/nyth_env_${USER}_$$"
  umask 077
  passfile="${DHERMES_PASSPHRASE_FILE:-$HOME/.hermes/data/dhermes_gpg.passphrase}"
  gpg_cmd=(gpg --batch --quiet)
  if [[ -f "$passfile" ]]; then
    gpg_cmd+=(--pinentry-mode loopback --passphrase-file "$passfile")
  fi
  "${gpg_cmd[@]}" --decrypt --output "$TMP_ENV" "$ENV_FILE.gpg"
  chmod 600 "$TMP_ENV"
  set -a
  # shellcheck disable=SC1090
  source "$TMP_ENV"
  set +a
  secure_remove "$TMP_ENV"
  TMP_ENV=""
else
  echo "WARNING: env file not found: $ENV_FILE or $ENV_FILE.gpg" >&2
fi

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
exec npm run start -w server
