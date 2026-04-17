#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="${DIST_DIR:-dist}"
S3_BUCKET_NAME="${S3_BUCKET_NAME:?S3_BUCKET_NAME is required}"
CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:?CLOUDFRONT_DISTRIBUTION_ID is required}"
S3_PREFIX="${S3_PREFIX:-}"

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "Build output directory '${DIST_DIR}' does not exist." >&2
  exit 1
fi

if [[ -n "${S3_PREFIX}" ]]; then
  S3_PREFIX="${S3_PREFIX#/}"
  S3_PREFIX="${S3_PREFIX%/}"
  S3_URI="s3://${S3_BUCKET_NAME}/${S3_PREFIX}"
else
  S3_URI="s3://${S3_BUCKET_NAME}"
fi

echo "Deploying '${DIST_DIR}' to '${S3_URI}'"

aws s3 sync "${DIST_DIR}/" "${S3_URI}/" \
  --delete \
  --exclude "assets/*" \
  --exclude "index.html" \
  --cache-control "no-store, no-cache, must-revalidate" \
  --only-show-errors

if [[ -d "${DIST_DIR}/assets" ]]; then
  aws s3 sync "${DIST_DIR}/assets/" "${S3_URI}/assets/" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --only-show-errors
fi

aws s3 cp "${DIST_DIR}/index.html" "${S3_URI}/index.html" \
  --cache-control "no-store, no-cache, must-revalidate" \
  --content-type "text/html; charset=utf-8" \
  --only-show-errors

aws cloudfront create-invalidation \
  --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
  --paths "/" "/index.html" \
  --no-cli-pager
