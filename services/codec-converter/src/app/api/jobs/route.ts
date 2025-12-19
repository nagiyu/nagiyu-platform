/**
 * POST /api/jobs - Create a new job and get upload presigned URL
 * 
 * This endpoint creates a new video conversion job in DynamoDB and returns
 * a presigned URL for uploading the input file to S3.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { DynamoDBHelper, S3Helper } from '@nagiyu/codec-converter-common';
import {
  createJob,
  isValidOutputCodec,
  JobValidation,
  OutputCodec,
} from '@/lib/models/job';

/**
 * Request body interface for POST /api/jobs
 */
interface CreateJobRequest {
  fileName: string;
  fileSize: number;
  contentType: string;
  outputCodec: string;
}

/**
 * Validation constants
 */
const ACCEPTED_CONTENT_TYPE = 'video/mp4';
const UPLOAD_URL_EXPIRATION_SECONDS = 3600; // 1 hour

/**
 * Validate the request body
 * @param body - The request body to validate
 * @returns Error message if validation fails, null otherwise
 */
function validateRequest(body: CreateJobRequest): string | null {
  // Validate fileName
  if (!body.fileName || typeof body.fileName !== 'string') {
    return 'fileName is required and must be a string';
  }

  if (body.fileName.trim().length === 0) {
    return 'fileName cannot be empty';
  }

  // Validate fileSize
  if (typeof body.fileSize !== 'number' || body.fileSize <= 0) {
    return 'fileSize is required and must be a positive number';
  }

  if (body.fileSize > JobValidation.MAX_FILE_SIZE) {
    return `fileSize must not exceed ${JobValidation.MAX_FILE_SIZE} bytes (500MB)`;
  }

  // Validate contentType
  if (!body.contentType || typeof body.contentType !== 'string') {
    return 'contentType is required and must be a string';
  }

  // Only accept MP4 files (Phase 1 requirement)
  if (!body.contentType.startsWith(ACCEPTED_CONTENT_TYPE)) {
    return `Only MP4 files (${ACCEPTED_CONTENT_TYPE}) are accepted in Phase 1`;
  }

  // Validate outputCodec
  if (!body.outputCodec || typeof body.outputCodec !== 'string') {
    return 'outputCodec is required and must be a string';
  }

  if (!isValidOutputCodec(body.outputCodec)) {
    return `outputCodec must be one of: ${JobValidation.VALID_CODECS.join(', ')}`;
  }

  return null;
}

/**
 * POST /api/jobs
 * Creates a new job and returns job ID with upload presigned URL
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: CreateJobRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Validate request
    const validationError = validateRequest(body);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    // Generate job ID
    const jobId = randomUUID();

    // S3 key for input file
    const inputFileKey = `uploads/${jobId}/input.mp4`;

    // Create job object
    const job = createJob({
      jobId,
      inputFile: inputFileKey,
      outputCodec: body.outputCodec as OutputCodec,
      fileName: body.fileName,
      fileSize: body.fileSize,
    });

    // Get environment variables
    const dynamoTableName = process.env.DYNAMODB_TABLE;
    const s3BucketName = process.env.S3_BUCKET;

    if (!dynamoTableName) {
      console.error('DYNAMODB_TABLE environment variable is not set');
      return NextResponse.json(
        { error: 'Server configuration error: DYNAMODB_TABLE not configured' },
        { status: 500 }
      );
    }

    if (!s3BucketName) {
      console.error('S3_BUCKET environment variable is not set');
      return NextResponse.json(
        { error: 'Server configuration error: S3_BUCKET not configured' },
        { status: 500 }
      );
    }

    // Initialize helpers
    const dbHelper = new DynamoDBHelper(dynamoTableName);
    const s3Helper = new S3Helper(s3BucketName);

    // Store job in DynamoDB
    try {
      await dbHelper.putJob(job);
    } catch (error) {
      console.error('Failed to create job in DynamoDB:', error);
      return NextResponse.json(
        { error: 'Failed to create job in database' },
        { status: 500 }
      );
    }

    // Generate presigned URL for upload
    let uploadUrl: string;
    try {
      uploadUrl = await s3Helper.getUploadPresignedUrl(inputFileKey, {
        contentType: body.contentType,
        expiresIn: UPLOAD_URL_EXPIRATION_SECONDS,
      });
    } catch (error) {
      console.error('Failed to generate upload presigned URL:', error);
      // Clean up the job record since we cannot provide an upload URL
      try {
        await dbHelper.deleteJob(jobId);
      } catch (deleteError) {
        console.error('Failed to clean up job after URL generation failure:', deleteError);
      }
      return NextResponse.json(
        { error: 'Failed to generate upload URL' },
        { status: 500 }
      );
    }

    // Return success response
    return NextResponse.json(
      {
        jobId,
        uploadUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/jobs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
