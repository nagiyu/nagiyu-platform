#!/bin/bash

set -euo pipefail

# Environment variables (provided by AWS Batch Job Definition or Container Overrides)
# Static (from Job Definition):
# - S3_BUCKET: S3 bucket name
# - DYNAMODB_TABLE: DynamoDB table name
# - AWS_REGION: AWS region
# Dynamic (from Container Overrides):
# - JOB_ID: Job ID (UUID)
# - OUTPUT_CODEC: Output codec (h264, vp9, av1)

echo "Starting codec conversion worker..."
echo "Job ID: ${JOB_ID}"
echo "Output Codec: ${OUTPUT_CODEC}"
echo "S3 Bucket: ${S3_BUCKET}"
echo "DynamoDB Table: ${DYNAMODB_TABLE}"
echo "AWS Region: ${AWS_REGION}"

# Function to update job status in DynamoDB
update_job_status() {
    local status=$1
    local error_message=${2:-}
    
    echo "Updating job status to: ${status}"
    
    local update_expr="SET #status = :status, updatedAt = :updated"
    local expr_attr_values
    
    if [ -n "${error_message}" ]; then
        update_expr="${update_expr}, errorMessage = :error"
        # Escape double quotes in error message for JSON
        local escaped_error="${error_message//\"/\\\"}"
        expr_attr_values="{\":status\": {\"S\": \"${status}\"}, \":updated\": {\"N\": \"$(date +%s)\"}, \":error\": {\"S\": \"${escaped_error}\"}}"
    else
        expr_attr_values="{\":status\": {\"S\": \"${status}\"}, \":updated\": {\"N\": \"$(date +%s)\"}}"
    fi
    
    aws dynamodb update-item \
        --region "${AWS_REGION}" \
        --table-name "${DYNAMODB_TABLE}" \
        --key "{\"jobId\": {\"S\": \"${JOB_ID}\"}}" \
        --update-expression "${update_expr}" \
        --expression-attribute-values "${expr_attr_values}" \
        --expression-attribute-names '{"#status": "status"}' \
        || echo "Warning: Failed to update DynamoDB status"
}

# Function to handle errors
handle_error() {
    local error_msg=$1
    echo "ERROR: ${error_msg}"
    update_job_status "FAILED" "${error_msg}"
    exit 1
}

# Trap errors
trap 'handle_error "Unexpected error occurred"' ERR

# Update status to PROCESSING
update_job_status "PROCESSING"

# Define file paths
INPUT_S3_PATH="s3://${S3_BUCKET}/uploads/${JOB_ID}/input.mp4"
OUTPUT_LOCAL_PATH="/tmp/output"
INPUT_LOCAL_PATH="/tmp/input.mp4"

# Determine output extension and FFmpeg parameters based on codec
case "${OUTPUT_CODEC}" in
    h264)
        OUTPUT_EXT="mp4"
        FFMPEG_PARAMS=(-c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k)
        ;;
    vp9)
        OUTPUT_EXT="webm"
        FFMPEG_PARAMS=(-c:v libvpx-vp9 -crf 30 -b:v 0 -c:a libopus -b:a 128k)
        ;;
    av1)
        OUTPUT_EXT="webm"
        FFMPEG_PARAMS=(-c:v libaom-av1 -crf 30 -b:v 0 -cpu-used 4 -c:a libopus -b:a 128k)
        ;;
    *)
        handle_error "Unsupported output codec: ${OUTPUT_CODEC}"
        ;;
esac

OUTPUT_LOCAL_FILE="${OUTPUT_LOCAL_PATH}.${OUTPUT_EXT}"
OUTPUT_S3_PATH="s3://${S3_BUCKET}/outputs/${JOB_ID}/output.${OUTPUT_EXT}"

echo "Input: ${INPUT_S3_PATH}"
echo "Output: ${OUTPUT_S3_PATH}"
echo "FFmpeg parameters: ${FFMPEG_PARAMS[*]}"

# Download input file from S3
echo "Downloading input file from S3..."
aws s3 cp "${INPUT_S3_PATH}" "${INPUT_LOCAL_PATH}" || handle_error "Failed to download input file from S3"

# Verify input file exists and is readable
if [ ! -f "${INPUT_LOCAL_PATH}" ]; then
    handle_error "Input file not found after download"
fi

echo "Input file downloaded successfully ($(du -h ${INPUT_LOCAL_PATH} | cut -f1))"

# Run FFmpeg conversion
echo "Starting FFmpeg conversion..."
ffmpeg -i "${INPUT_LOCAL_PATH}" "${FFMPEG_PARAMS[@]}" "${OUTPUT_LOCAL_FILE}" -y 2>&1 | tee /tmp/ffmpeg.log || handle_error "FFmpeg conversion failed"

# Verify output file was created
if [ ! -f "${OUTPUT_LOCAL_FILE}" ]; then
    handle_error "Output file not found after conversion"
fi

echo "Conversion completed successfully ($(du -h ${OUTPUT_LOCAL_FILE} | cut -f1))"

# Upload output file to S3
echo "Uploading output file to S3..."
aws s3 cp "${OUTPUT_LOCAL_FILE}" "${OUTPUT_S3_PATH}" || handle_error "Failed to upload output file to S3"

# Update output file path in DynamoDB and set status to COMPLETED
echo "Updating job status to COMPLETED..."
aws dynamodb update-item \
    --region "${AWS_REGION}" \
    --table-name "${DYNAMODB_TABLE}" \
    --key "{\"jobId\": {\"S\": \"${JOB_ID}\"}}" \
    --update-expression "SET #status = :status, updatedAt = :updated, outputFile = :output" \
    --expression-attribute-values "{\":status\": {\"S\": \"COMPLETED\"}, \":updated\": {\"N\": \"$(date +%s)\"}, \":output\": {\"S\": \"outputs/${JOB_ID}/output.${OUTPUT_EXT}\"}}" \
    --expression-attribute-names '{"#status": "status"}' \
    || handle_error "Failed to update job status to COMPLETED"

# Cleanup
echo "Cleaning up temporary files..."
rm -f "${INPUT_LOCAL_PATH}" "${OUTPUT_LOCAL_FILE}"

echo "Job completed successfully!"
