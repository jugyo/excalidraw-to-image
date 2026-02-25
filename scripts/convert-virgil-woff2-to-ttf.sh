#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INPUT_PATH="${ROOT_DIR}/fonts/virgil/Virgil.woff2"
OUTPUT_PATH="${ROOT_DIR}/fonts/virgil/Virgil.ttf"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --in)
      INPUT_PATH="$2"
      shift 2
      ;;
    --out)
      OUTPUT_PATH="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Usage:
  scripts/convert-virgil-woff2-to-ttf.sh [--in <Virgil.woff2>] [--out <Virgil.ttf>]

Default:
  --in  fonts/virgil/Virgil.woff2
  --out fonts/virgil/Virgil.ttf
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "${INPUT_PATH}" ]]; then
  echo "Input file not found: ${INPUT_PATH}" >&2
  exit 1
fi

if ! command -v woff2_decompress >/dev/null 2>&1; then
  cat >&2 <<'EOF'
woff2_decompress is required.

Install examples:
  macOS (Homebrew): brew install woff2
  Ubuntu/Debian:    sudo apt-get install woff2
EOF
  exit 1
fi

mkdir -p "$(dirname "${OUTPUT_PATH}")"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

cp "${INPUT_PATH}" "${TMP_DIR}/Virgil.woff2"
woff2_decompress "${TMP_DIR}/Virgil.woff2" >/dev/null

if [[ ! -f "${TMP_DIR}/Virgil.ttf" ]]; then
  echo "Failed to generate TTF from WOFF2." >&2
  exit 1
fi

mv "${TMP_DIR}/Virgil.ttf" "${OUTPUT_PATH}"
echo "Generated ${OUTPUT_PATH}"
