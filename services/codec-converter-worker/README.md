# Codec Converter Worker

AWS Batch worker for converting video codecs using FFmpeg.

## Overview

This worker is designed to run on AWS Batch (Fargate) and performs video codec conversion jobs. It downloads input videos from S3, converts them using FFmpeg, and uploads the results back to S3, while updating job status in DynamoDB.

## Supported Codecs

- **H.264** (MP4 container) - Using libx264 encoder
- **VP9** (WebM container) - Using libvpx-vp9 encoder
- **AV1** (WebM container) - Using libaom-av1 encoder

## Base Image

Uses `jrottenberg/ffmpeg:6.1-alpine` as the base FFmpeg image, which includes:
- FFmpeg 6.1
- H.264 support (libx264)
- VP9 support (libvpx-vp9)
- AV1 support (libaom-av1)

## Architecture

The worker follows this workflow:

1. **Validate** - Check all required environment variables are present
2. **Update Status** - Set job status to `PROCESSING` in DynamoDB
3. **Download** - Download input file from S3 (`uploads/{jobId}/input.mp4`)
4. **Convert** - Run FFmpeg with appropriate codec settings
5. **Upload** - Upload converted file to S3 (`outputs/{jobId}/output.{ext}`)
6. **Complete** - Update job status to `COMPLETED` in DynamoDB
7. **Error Handling** - On any failure, update status to `FAILED` with error message

## Environment Variables

### Required (Static - set in Job Definition)
- `S3_BUCKET` - S3 bucket name for uploads and outputs
- `DYNAMODB_TABLE` - DynamoDB table name for job tracking
- `AWS_REGION` - AWS region (e.g., `ap-northeast-1`)

### Required (Dynamic - passed via SubmitJob API)
- `JOB_ID` - Unique job identifier (UUID)
- `OUTPUT_CODEC` - Target codec: `h264`, `vp9`, or `av1`

## FFmpeg Encoding Settings

### H.264
```bash
ffmpeg -i input.mp4 -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k output.mp4
```
- Preset: medium (balanced speed/quality)
- CRF: 23 (visually transparent quality)
- Audio: AAC at 128kbps

### VP9
```bash
ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 -c:a libopus -b:a 128k output.webm
```
- CRF: 30 (equivalent to H.264 CRF 23)
- Quality-based mode (b:v 0)
- Audio: Opus at 128kbps

### AV1
```bash
ffmpeg -i input.mp4 -c:v libaom-av1 -crf 30 -b:v 0 -cpu-used 4 -c:a libopus -b:a 128k output.webm
```
- CRF: 30 (quality target)
- CPU-used: 4 (balanced speed/quality)
- Audio: Opus at 128kbps

## Security

- Runs as non-root user (`worker:1001`)
- Uses Python virtual environment for dependency isolation
- Minimal Alpine-based image for reduced attack surface
- No secrets stored in the container image

## Building

```bash
docker build -t codec-converter-worker .
```

## Local Testing

```bash
# Set required environment variables
export AWS_REGION=ap-northeast-1
export S3_BUCKET=codec-converter-dev-123456789012
export DYNAMODB_TABLE=codec-converter-jobs-dev
export JOB_ID=550e8400-e29b-41d4-a716-446655440000
export OUTPUT_CODEC=h264

# Run the worker (requires AWS credentials)
docker run --rm \
  -e AWS_REGION \
  -e S3_BUCKET \
  -e DYNAMODB_TABLE \
  -e JOB_ID \
  -e OUTPUT_CODEC \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  codec-converter-worker
```

## AWS Batch Integration

### Job Definition

The worker is designed to be used with AWS Batch Fargate. Example Job Definition:

```yaml
Type: CONTAINER
Platform: Fargate
Image: {account-id}.dkr.ecr.{region}.amazonaws.com/codec-converter-worker:latest
ResourceRequirements:
  - Type: VCPU
    Value: 2
  - Type: MEMORY
    Value: 4096
JobRoleArn: arn:aws:iam::{account-id}:role/codec-converter-batch-job-role
ExecutionRoleArn: arn:aws:iam::{account-id}:role/codec-converter-batch-execution-role
Environment:
  - Name: S3_BUCKET
    Value: codec-converter-{env}-{account-id}
  - Name: DYNAMODB_TABLE
    Value: codec-converter-jobs-{env}
  - Name: AWS_REGION
    Value: ap-northeast-1
Timeout:
  AttemptDurationSeconds: 7200
```

### Submitting Jobs

Jobs are submitted via Lambda using the AWS Batch `SubmitJob` API with container overrides:

```python
batch.submit_job(
    jobName=f"codec-convert-{job_id}",
    jobQueue="codec-converter-queue",
    jobDefinition="codec-converter-job-definition",
    containerOverrides={
        "environment": [
            {"name": "JOB_ID", "value": job_id},
            {"name": "OUTPUT_CODEC", "value": output_codec}
        ]
    }
)
```

## Error Handling

The worker handles the following error scenarios:

1. **Missing Environment Variables** - Fails immediately with clear error message
2. **Invalid Codec** - Fails with error about unsupported codec
3. **S3 Download Failure** - Updates job status to FAILED with error message
4. **FFmpeg Conversion Failure** - Updates job status to FAILED with error message
5. **S3 Upload Failure** - Updates job status to FAILED with error message
6. **DynamoDB Update Failure** - Logs error and exits with non-zero code

All errors are logged to stdout/stderr and sent to CloudWatch Logs.

## Monitoring

- **CloudWatch Logs**: All output is sent to `/aws/batch/job`
- **Job Status**: Tracked in DynamoDB with timestamps
- **Metrics**: AWS Batch provides metrics on job duration, failures, etc.

## Resource Requirements

- **vCPU**: 2 (minimum for reasonable encoding speed)
- **Memory**: 4096 MB (4 GB)
- **Timeout**: 7200 seconds (2 hours)
- **Disk**: Ephemeral storage for /tmp (input/output files)

## Dependencies

- Python 3.12
- boto3 1.35.76 (AWS SDK for Python)
- FFmpeg 6.1 (from jrottenberg/ffmpeg:6.1-alpine)

## Related Documentation

- [Architecture](../../docs/apps/codec-converter/architecture.md)
- [Requirements](../../docs/apps/codec-converter/requirements.md)
- [Infrastructure](../../docs/apps/codec-converter/infra/README.md)
- [Spec](../../specs/002-add-codec-converter/spec.md)
