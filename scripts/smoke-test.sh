#!/usr/bin/env bash
# Smoke test a frontend deployment before it takes traffic.
#
#   scripts/smoke-test.sh https://sha-abc1234---ucd-production-frontend-xxxx.a.run.app
#
# Exercises the submission path against the real service account, bucket and
# IAM, which no unit test can: the Oct 2026 outage was a get-upload-url change
# that needed a bucket permission the frontend never had, and every photo
# upload 500'd for three days until a submitter reported it.
#
# Only signed URLs are requested; nothing is uploaded, so no submission is
# created and no processor runs. The requests carry no reCAPTCHA token, which
# the route currently accepts. If token checks are ever enforced, this script
# needs a bypass for it or it will fail every deploy — on purpose.
set -euo pipefail

BASE_URL="${1:?usage: smoke-test.sh <base-url>}"
BASE_URL="${BASE_URL%/}"
SUBMISSION_ID="smoke-test-$(date +%s)"
failures=0

check() {
  local name="$1" expected="$2" status body
  shift 2
  body=$(mktemp)
  status=$(curl -sS -o "$body" -w '%{http_code}' --max-time 30 "$@") || status="curl-error"
  if [[ "$status" == "$expected" ]]; then
    echo "ok   $name ($status)"
  else
    echo "FAIL $name: expected $expected, got $status"
    head -c 500 "$body"; echo
    failures=$((failures + 1))
  fi
  rm -f "$body"
}

upload_url() {
  local type="$1" filename="$2" content_type="$3" expected="$4"
  check "upload URL for $type" "$expected" \
    -X POST "$BASE_URL/api/awards/get-upload-url" \
    -H 'Content-Type: application/json' \
    -d "{\"filename\":\"$filename\",\"contentType\":\"$content_type\",\"size\":1024,\"submissionId\":\"$SUBMISSION_ID\",\"type\":\"$type\"}"
}

check "awards page" 200 "$BASE_URL/awards"
check "awards status" 200 "$BASE_URL/api/awards/status"

# Upload URLs are refused on purpose while no award year is open. Between
# competitions, check that the refusal is the clean 403 the form expects;
# signing (and the bucket permission behind it) is only exercised while a
# year is open.
status=$(curl -sS --max-time 30 "$BASE_URL/api/awards/status" || true)
if [[ "$status" == *'"accepting":true'* ]]; then
  expected=200
else
  expected=403
  echo "note: submissions are closed, so upload URLs should be refused ($status)"
fi
upload_url pdf smoke-test.pdf application/pdf "$expected"
upload_url photos smoke-test.jpg image/jpeg "$expected"

if (( failures > 0 )); then
  echo "$failures smoke check(s) failed"
  exit 1
fi
echo "All smoke checks passed"
