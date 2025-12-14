#!/bin/sh
set -e

# Entrypoint script for codec-converter-worker
# This script performs the following workflow:
# 1. Update DynamoDB status to PROCESSING
# 2. Download input file from S3
# 3. Run FFmpeg conversion
# 4. Upload output file to S3
# 5. Update DynamoDB status to COMPLETED or FAILED

# Validate required environment variables
if [ -z "$JOB_ID" ]; then
  echo "ERROR: JOB_ID environment variable is required"
  exit 1
fi

if [ -z "$OUTPUT_CODEC" ]; then
  echo "ERROR: OUTPUT_CODEC environment variable is required"
  exit 1
fi

if [ -z "$S3_BUCKET" ]; then
  echo "ERROR: S3_BUCKET environment variable is required"
  exit 1
fi

if [ -z "$DYNAMODB_TABLE" ]; then
  echo "ERROR: DYNAMODB_TABLE environment variable is required"
  exit 1
fi

if [ -z "$AWS_REGION" ]; then
  echo "ERROR: AWS_REGION environment variable is required"
  exit 1
fi

# Configuration
INPUT_FILE="/tmp/input.mp4"
OUTPUT_FILE="/tmp/output"
S3_INPUT_KEY="uploads/${JOB_ID}/input.mp4"
S3_OUTPUT_KEY_PREFIX="outputs/${JOB_ID}/output"

# Determine output format and extension based on codec
case "$OUTPUT_CODEC" in
  h264)
    OUTPUT_EXT="mp4"
    VIDEO_CODEC="libx264"
    VIDEO_OPTS="-preset medium -crf 23"
    AUDIO_CODEC="aac"
    AUDIO_OPTS="-b:a 128k"
    ;;
  vp9)
    OUTPUT_EXT="webm"
    VIDEO_CODEC="libvpx-vp9"
    VIDEO_OPTS="-crf 30 -b:v 0"
    AUDIO_CODEC="libopus"
    AUDIO_OPTS="-b:a 128k"
    ;;
  av1)
    OUTPUT_EXT="webm"
    VIDEO_CODEC="libaom-av1"
    VIDEO_OPTS="-crf 30 -b:v 0 -cpu-used 4"
    AUDIO_CODEC="libopus"
    AUDIO_OPTS="-b:a 128k"
    ;;
  *)
    echo "ERROR: Invalid OUTPUT_CODEC: $OUTPUT_CODEC (must be h264, vp9, or av1)"
    exit 1
    ;;
esac

OUTPUT_FILE="${OUTPUT_FILE}.${OUTPUT_EXT}"
S3_OUTPUT_KEY="${S3_OUTPUT_KEY_PREFIX}.${OUTPUT_EXT}"

echo "Starting job $JOB_ID with codec $OUTPUT_CODEC"
echo "Input: s3://${S3_BUCKET}/${S3_INPUT_KEY}"
echo "Output: s3://${S3_BUCKET}/${S3_OUTPUT_KEY}"

# Step 1: Update DynamoDB status to PROCESSING
echo "Updating job status to PROCESSING..."
/app/venv/bin/python3 <<EOF
import boto3
import sys
from datetime import datetime

try:
    dynamodb = boto3.resource('dynamodb', region_name='${AWS_REGION}')
    table = dynamodb.Table('${DYNAMODB_TABLE}')
    
    response = table.update_item(
        Key={'jobId': '${JOB_ID}'},
        UpdateExpression='SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames={'#status': 'status'},
        ExpressionAttributeValues={
            ':status': 'PROCESSING',
            ':updatedAt': int(datetime.utcnow().timestamp())
        }
    )
    print("Status updated to PROCESSING")
except Exception as e:
    print(f"ERROR: Failed to update status to PROCESSING: {e}", file=sys.stderr)
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to update status to PROCESSING"
  exit 1
fi

# Step 2: Download input file from S3
echo "Downloading input file from S3..."
/app/venv/bin/python3 <<EOF
import boto3
import sys

try:
    s3 = boto3.client('s3', region_name='${AWS_REGION}')
    s3.download_file('${S3_BUCKET}', '${S3_INPUT_KEY}', '${INPUT_FILE}')
    print("Downloaded input file successfully")
except Exception as e:
    print(f"ERROR: Failed to download input file: {e}", file=sys.stderr)
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to download input file"
  # Update status to FAILED
  /app/venv/bin/python3 <<EOF
import boto3
from datetime import datetime
dynamodb = boto3.resource('dynamodb', region_name='${AWS_REGION}')
table = dynamodb.Table('${DYNAMODB_TABLE}')
table.update_item(
    Key={'jobId': '${JOB_ID}'},
    UpdateExpression='SET #status = :status, updatedAt = :updatedAt, errorMessage = :errorMessage',
    ExpressionAttributeNames={'#status': 'status'},
    ExpressionAttributeValues={
        ':status': 'FAILED',
        ':updatedAt': int(datetime.utcnow().timestamp()),
        ':errorMessage': 'Failed to download input file from S3'
    }
)
EOF
  exit 1
fi

# Step 3: Run FFmpeg conversion
# Note: VIDEO_OPTS and AUDIO_OPTS are intentionally not quoted because they contain
# multiple space-separated arguments that need to be word-split by the shell.
# These values are controlled by the case statement above and don't come from user input.
echo "Running FFmpeg conversion..."
echo "Command: ffmpeg -i \"$INPUT_FILE\" -c:v \"$VIDEO_CODEC\" $VIDEO_OPTS -c:a \"$AUDIO_CODEC\" $AUDIO_OPTS \"$OUTPUT_FILE\""

# shellcheck disable=SC2086
if ! ffmpeg -i "$INPUT_FILE" -c:v "$VIDEO_CODEC" $VIDEO_OPTS -c:a "$AUDIO_CODEC" $AUDIO_OPTS "$OUTPUT_FILE" -y; then
  echo "ERROR: FFmpeg conversion failed"
  # Update status to FAILED
  /app/venv/bin/python3 <<EOF
import boto3
from datetime import datetime
dynamodb = boto3.resource('dynamodb', region_name='${AWS_REGION}')
table = dynamodb.Table('${DYNAMODB_TABLE}')
table.update_item(
    Key={'jobId': '${JOB_ID}'},
    UpdateExpression='SET #status = :status, updatedAt = :updatedAt, errorMessage = :errorMessage',
    ExpressionAttributeNames={'#status': 'status'},
    ExpressionAttributeValues={
        ':status': 'FAILED',
        ':updatedAt': int(datetime.utcnow().timestamp()),
        ':errorMessage': 'FFmpeg conversion failed'
    }
)
EOF
  exit 1
fi

echo "FFmpeg conversion completed successfully"

# Step 4: Upload output file to S3
echo "Uploading output file to S3..."
/app/venv/bin/python3 <<EOF
import boto3
import sys

try:
    s3 = boto3.client('s3', region_name='${AWS_REGION}')
    s3.upload_file('${OUTPUT_FILE}', '${S3_BUCKET}', '${S3_OUTPUT_KEY}')
    print("Uploaded output file successfully")
except Exception as e:
    print(f"ERROR: Failed to upload output file: {e}", file=sys.stderr)
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to upload output file"
  # Update status to FAILED
  /app/venv/bin/python3 <<EOF
import boto3
from datetime import datetime
dynamodb = boto3.resource('dynamodb', region_name='${AWS_REGION}')
table = dynamodb.Table('${DYNAMODB_TABLE}')
table.update_item(
    Key={'jobId': '${JOB_ID}'},
    UpdateExpression='SET #status = :status, updatedAt = :updatedAt, errorMessage = :errorMessage',
    ExpressionAttributeNames={'#status': 'status'},
    ExpressionAttributeValues={
        ':status': 'FAILED',
        ':updatedAt': int(datetime.utcnow().timestamp()),
        ':errorMessage': 'Failed to upload output file to S3'
    }
)
EOF
  exit 1
fi

# Step 5: Update DynamoDB status to COMPLETED
echo "Updating job status to COMPLETED..."
/app/venv/bin/python3 <<EOF
import boto3
import sys
from datetime import datetime

try:
    dynamodb = boto3.resource('dynamodb', region_name='${AWS_REGION}')
    table = dynamodb.Table('${DYNAMODB_TABLE}')
    
    response = table.update_item(
        Key={'jobId': '${JOB_ID}'},
        UpdateExpression='SET #status = :status, updatedAt = :updatedAt, outputFile = :outputFile',
        ExpressionAttributeNames={'#status': 'status'},
        ExpressionAttributeValues={
            ':status': 'COMPLETED',
            ':updatedAt': int(datetime.utcnow().timestamp()),
            ':outputFile': '${S3_OUTPUT_KEY}'
        }
    )
    print("Status updated to COMPLETED")
except Exception as e:
    print(f"ERROR: Failed to update status to COMPLETED: {e}", file=sys.stderr)
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to update status to COMPLETED"
  exit 1
fi

echo "Job $JOB_ID completed successfully"

# Cleanup
rm -f "$INPUT_FILE" "$OUTPUT_FILE"

exit 0
