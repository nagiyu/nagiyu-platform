#!/bin/bash
set -euo pipefail

# Codec Converter Worker - Entrypoint Script
# This script runs in AWS Batch to convert video files using FFmpeg

# Required environment variables:
# - JOB_ID: Job ID (UUID)
# - OUTPUT_CODEC: Output codec (h264, vp9, or av1)
# - S3_BUCKET: S3 bucket name
# - DYNAMODB_TABLE: DynamoDB table name
# - AWS_REGION: AWS region (usually set by AWS Batch)

echo "=== Codec Converter Worker Starting ==="
echo "Job ID: ${JOB_ID}"
echo "Output Codec: ${OUTPUT_CODEC}"
echo "S3 Bucket: ${S3_BUCKET}"
echo "DynamoDB Table: ${DYNAMODB_TABLE}"
echo "AWS Region: ${AWS_REGION}"

# Export environment variables for Python scripts
export JOB_ID
export OUTPUT_CODEC
export S3_BUCKET
export DYNAMODB_TABLE
export AWS_REGION

# Working directory
WORKDIR="/tmp/job-${JOB_ID}"
mkdir -p "${WORKDIR}"
cd "${WORKDIR}"

# File paths
INPUT_FILE="${WORKDIR}/input.mp4"
OUTPUT_FILE=""
S3_INPUT_KEY="uploads/${JOB_ID}/input.mp4"
S3_OUTPUT_KEY=""

# Export file paths for Python scripts
export INPUT_FILE
export S3_INPUT_KEY

# Determine output file extension and S3 key based on codec
case "${OUTPUT_CODEC}" in
  h264)
    OUTPUT_FILE="${WORKDIR}/output.mp4"
    S3_OUTPUT_KEY="outputs/${JOB_ID}/output.mp4"
    ;;
  vp9|av1)
    OUTPUT_FILE="${WORKDIR}/output.webm"
    S3_OUTPUT_KEY="outputs/${JOB_ID}/output.webm"
    ;;
  *)
    echo "ERROR: Unsupported output codec: ${OUTPUT_CODEC}"
    exit 1
    ;;
esac

# Export output file paths for Python scripts
export OUTPUT_FILE
export S3_OUTPUT_KEY

echo "Input S3 Key: ${S3_INPUT_KEY}"
echo "Output S3 Key: ${S3_OUTPUT_KEY}"

# Python script for DynamoDB updates
update_status() {
  local status="$1"
  local error_message="${2:-}"
  
  # Export variables for Python to access via environment
  export UPDATE_STATUS="$status"
  export UPDATE_ERROR_MESSAGE="$error_message"
  
  python3 - <<'EOF'
import boto3
import sys
import os
from datetime import datetime

dynamodb = boto3.resource('dynamodb', region_name=os.environ['AWS_REGION'])
table = dynamodb.Table(os.environ['DYNAMODB_TABLE'])

status = os.environ['UPDATE_STATUS']
error_message = os.environ.get('UPDATE_ERROR_MESSAGE', '')

update_expr = 'SET #status = :status, #updated = :updated'
expr_attr_names = {
    '#status': 'status',
    '#updated': 'updatedAt'
}
expr_attr_values = {
    ':status': status,
    ':updated': int(datetime.utcnow().timestamp())
}

if error_message:
    update_expr += ', #error = :error'
    expr_attr_names['#error'] = 'errorMessage'
    expr_attr_values[':error'] = error_message

try:
    table.update_item(
        Key={'jobId': os.environ['JOB_ID']},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_attr_names,
        ExpressionAttributeValues=expr_attr_values
    )
    print(f"Updated status to {status}")
except Exception as e:
    print(f"ERROR: Failed to update DynamoDB: {e}", file=sys.stderr)
    sys.exit(1)
EOF
}

# Error handler
handle_error() {
  local error_message="$1"
  echo "ERROR: ${error_message}"
  update_status "FAILED" "${error_message}"
  exit 1
}

# Update status to PROCESSING
echo "=== Updating status to PROCESSING ==="
update_status "PROCESSING" || handle_error "Failed to update status to PROCESSING"

# Download input file from S3
echo "=== Downloading input file from S3 ==="
python3 - <<'EOF' || handle_error "Failed to download input file from S3"
import boto3
import sys
import os

s3 = boto3.client('s3', region_name=os.environ['AWS_REGION'])

try:
    s3.download_file(
        Bucket=os.environ['S3_BUCKET'],
        Key=os.environ['S3_INPUT_KEY'],
        Filename=os.environ['INPUT_FILE']
    )
    print(f"Downloaded: {os.environ['S3_INPUT_KEY']}")
except Exception as e:
    print(f"ERROR: Failed to download from S3: {e}", file=sys.stderr)
    sys.exit(1)
EOF

echo "Input file downloaded successfully"
ls -lh "${INPUT_FILE}"

# Run FFmpeg conversion
echo "=== Running FFmpeg conversion ==="
echo "Codec: ${OUTPUT_CODEC}"

# FFmpeg command based on codec
case "${OUTPUT_CODEC}" in
  h264)
    echo "Converting to H.264 (MP4)..."
    ffmpeg -i "${INPUT_FILE}" \
      -c:v libx264 -preset medium -crf 23 \
      -c:a aac -b:a 128k \
      -y "${OUTPUT_FILE}" || handle_error "FFmpeg conversion failed for H.264"
    ;;
  vp9)
    echo "Converting to VP9 (WebM)..."
    ffmpeg -i "${INPUT_FILE}" \
      -c:v libvpx-vp9 -crf 30 -b:v 0 \
      -c:a libopus -b:a 128k \
      -y "${OUTPUT_FILE}" || handle_error "FFmpeg conversion failed for VP9"
    ;;
  av1)
    echo "Converting to AV1 (WebM)..."
    ffmpeg -i "${INPUT_FILE}" \
      -c:v libaom-av1 -crf 30 -b:v 0 -cpu-used 4 \
      -c:a libopus -b:a 128k \
      -y "${OUTPUT_FILE}" || handle_error "FFmpeg conversion failed for AV1"
    ;;
esac

echo "Conversion completed successfully"
ls -lh "${OUTPUT_FILE}"

# Upload output file to S3
echo "=== Uploading output file to S3 ==="
python3 - <<'EOF' || handle_error "Failed to upload output file to S3"
import boto3
import sys
import os

s3 = boto3.client('s3', region_name=os.environ['AWS_REGION'])

try:
    s3.upload_file(
        Filename=os.environ['OUTPUT_FILE'],
        Bucket=os.environ['S3_BUCKET'],
        Key=os.environ['S3_OUTPUT_KEY']
    )
    print(f"Uploaded: {os.environ['S3_OUTPUT_KEY']}")
except Exception as e:
    print(f"ERROR: Failed to upload to S3: {e}", file=sys.stderr)
    sys.exit(1)
EOF

echo "Output file uploaded successfully"

# Update DynamoDB with output file path
echo "=== Updating job status to COMPLETED ==="
python3 - <<'EOF' || handle_error "Failed to update status to COMPLETED"
import boto3
import os
from datetime import datetime

dynamodb = boto3.resource('dynamodb', region_name=os.environ['AWS_REGION'])
table = dynamodb.Table(os.environ['DYNAMODB_TABLE'])

try:
    table.update_item(
        Key={'jobId': os.environ['JOB_ID']},
        UpdateExpression='SET #status = :status, #updated = :updated, #output = :output',
        ExpressionAttributeNames={
            '#status': 'status',
            '#updated': 'updatedAt',
            '#output': 'outputFile'
        },
        ExpressionAttributeValues={
            ':status': 'COMPLETED',
            ':updated': int(datetime.utcnow().timestamp()),
            ':output': os.environ['S3_OUTPUT_KEY']
        }
    )
    print("Status updated to COMPLETED")
except Exception as e:
    print(f"ERROR: Failed to update DynamoDB: {e}", file=sys.stderr)
    sys.exit(1)
EOF

echo "=== Job completed successfully ==="
echo "Output file: ${S3_OUTPUT_KEY}"

# Cleanup
cd /
rm -rf "${WORKDIR}"
echo "Cleanup completed"

exit 0
