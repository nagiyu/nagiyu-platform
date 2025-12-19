/**
 * GET /api/jobs/{jobId} - Get job status
 * 
 * This endpoint retrieves the status and details of a video conversion job
 * from DynamoDB and returns it in JSON format.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBHelper } from '@nagiyu/codec-converter-common';

/**
 * UUID v4 validation regex
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Response interface for GET /api/jobs/{jobId}
 * 
 * Note: This is separate from the Job type in the common library
 * because the API response should only include fields specified
 * in the OpenAPI contract, excluding internal fields like expiresAt,
 * fileName, and fileSize.
 */
interface JobResponse {
  jobId: string;
  status: string;
  inputFile: string;
  outputCodec: string;
  createdAt: number;
  updatedAt: number;
  outputFile?: string;
  errorMessage?: string;
}

/**
 * Validate if a string is a valid UUID v4
 * @param jobId - The job ID to validate
 * @returns true if valid UUID v4, false otherwise
 */
function isValidUUID(jobId: string): boolean {
  return UUID_V4_REGEX.test(jobId);
}

/**
 * GET /api/jobs/{jobId}
 * Retrieves job status and details from DynamoDB
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    // Await the params as per Next.js 15+ requirements
    const { jobId } = await params;

    // Validate jobId format
    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json(
        { error: 'jobId is required and must be a string' },
        { status: 400 }
      );
    }

    if (!isValidUUID(jobId)) {
      return NextResponse.json(
        { error: 'jobId must be a valid UUID v4' },
        { status: 400 }
      );
    }

    // Get environment variables
    const dynamoTableName = process.env.DYNAMODB_TABLE;

    if (!dynamoTableName) {
      console.error('DYNAMODB_TABLE environment variable is not set');
      return NextResponse.json(
        { error: 'Server configuration error: DYNAMODB_TABLE not configured' },
        { status: 500 }
      );
    }

    // Initialize DynamoDB helper
    const dbHelper = new DynamoDBHelper(dynamoTableName);

    // Retrieve job from DynamoDB
    const job = await dbHelper.getJob(jobId);

    // Return 404 if job not found
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Return job data in JSON format as per OpenAPI spec
    // Only include fields specified in the API contract
    const response: JobResponse = {
      jobId: job.jobId,
      status: job.status,
      inputFile: job.inputFile,
      outputCodec: job.outputCodec,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      ...(job.outputFile && { outputFile: job.outputFile }),
      ...(job.errorMessage && { errorMessage: job.errorMessage }),
    };

    // Return success response
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in GET /api/jobs/{jobId}:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
