#!/usr/bin/env bash
set -euo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
manifest="$repository_root/test/fixtures/compatibility/manifest.tsv"
default_surge_cli="/Applications/Surge.app/Contents/Applications/surge-cli"

if (($# > 1)); then
  printf 'Usage: %s [path-to-surge-cli]\n' "$0" >&2
  exit 2
fi

surge_cli=${1:-${SURGE_CLI:-$default_surge_cli}}

if [[ ! -x "$surge_cli" ]]; then
  printf 'Surge CLI is not executable: %s\n' "$surge_cli" >&2
  exit 1
fi

checked=0
skipped=0
failures=0

while IFS=$'\t' read -r fixture _parser_expectation surge_expectation _top_level _source; do
  if [[ -z "$fixture" || "$fixture" == \#* ]]; then
    continue
  fi

  case "$surge_expectation" in
    not-applicable)
      skipped=$((skipped + 1))
      continue
      ;;
    accepted | rejected) ;;
    *)
      printf '%s: unknown Surge expectation %q\n' "$fixture" "$surge_expectation" >&2
      failures=$((failures + 1))
      continue
      ;;
  esac

  fixture_path="$repository_root/test/fixtures/compatibility/$fixture"
  if output=$("$surge_cli" --check "$fixture_path" 2>&1); then
    observed=accepted
  else
    observed=rejected
  fi
  checked=$((checked + 1))

  if [[ "$observed" == "$surge_expectation" ]]; then
    printf 'ok: %s (%s)\n' "$fixture" "$observed"
  else
    printf 'mismatch: %s (expected %s, observed %s)\n' \
      "$fixture" "$surge_expectation" "$observed" >&2
    printf '%s\n' "$output" >&2
    failures=$((failures + 1))
  fi
done < "$manifest"

printf 'Checked %d fixtures; skipped %d non-applicable fixtures.\n' "$checked" "$skipped"

if ((failures > 0)); then
  printf '%d compatibility checks failed.\n' "$failures" >&2
  exit 1
fi
