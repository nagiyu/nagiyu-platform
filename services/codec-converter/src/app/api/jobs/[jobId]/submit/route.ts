/**
 * POST /api/jobs/{jobId}/submit - Submit job to AWS Batch
 * 
 * This endpoint validates the job status and submits it to AWS Batch for processing.
 * It includes guards against duplicate submissions and only allows PENDING jobs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBHelper, BatchHelper, JobStatus, getUnixTimestamp } from '@nagiyu/codec-converter-common';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

/**
 * UUID v4 validation regex
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate if a string is a valid UUID v4
 * @param jobId - The job ID to validate
 * @returns true if valid UUID v4, false otherwise
 */
function isValidUUID(jobId: string): boolean {
  return UUID_V4_REGEX.test(jobId);
}

/**
 * POST /api/jobs/{jobId}/submit
 * Submits a job to AWS Batch for processing
 */
export async function POST(
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
    const batchJobQueueName = process.env.BATCH_JOB_QUEUE;
    const batchJobDefinitionName = process.env.BATCH_JOB_DEFINITION;

    if (!dynamoTableName) {
      console.error('DYNAMODB_TABLE environment variable is not set');
      return NextResponse.json(
        { error: 'Server configuration error: DYNAMODB_TABLE not configured' },
        { status: 500 }
      );
    }

    if (!batchJobQueueName) {
      console.error('BATCH_JOB_QUEUE environment variable is not set');
      return NextResponse.json(
        { error: 'Server configuration error: BATCH_JOB_QUEUE not configured' },
        { status: 500 }
      );
    }

    if (!batchJobDefinitionName) {
      console.error('BATCH_JOB_DEFINITION environment variable is not set');
      return NextResponse.json(
        { error: 'Server configuration error: BATCH_JOB_DEFINITION not configured' },
        { status: 500 }
      );
    }

    // Initialize helpers
    const dbHelper = new DynamoDBHelper(dynamoTableName);
    const batchHelper = new BatchHelper(batchJobQueueName, batchJobDefinitionName);

    // Retrieve job from DynamoDB to verify it exists
    const job = await dbHelper.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check if job is in PENDING status
    // Only PENDING jobs can be submitted to Batch
    if (job.status !== JobStatus.PENDING) {
      return NextResponse.json(
        { 
          error: 'Job cannot be submitted', 
          message: `Job is in ${job.status} status. Only PENDING jobs can be submitted.`
        },
        { status: 400 }
      );
    }

    // Use conditional update to prevent duplicate submissions (concurrent execution guard)
    // This ensures that even if multiple requests come in simultaneously,
    // only one will successfully transition the job from PENDING to PROCESSING
    //
    // Note: We use a direct UpdateCommand here instead of dbHelper.updateJobStatus()
    // because we need the ConditionExpression to ensure atomicity. The condition
    // guarantees that the status is PENDING before updating to PROCESSING, which
    // prevents race conditions where multiple requests try to submit the same job.
    try {
      // Update job status to PROCESSING with a condition that it must be PENDING
      const updateCommand = new UpdateCommand({
        TableName: dynamoTableName,
        Key: { jobId },
        UpdateExpression: 'SET #status = :processing, updatedAt = :updatedAt',
        ConditionExpression: '#status = :pending',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':pending': JobStatus.PENDING,
          ':processing': JobStatus.PROCESSING,
          ':updatedAt': getUnixTimestamp(),
        },
      });

      await dbHelper.getClient().send(updateCommand);
    } catch (error) {
      // If the condition fails, it means the job is no longer PENDING
      // (either already submitted or status changed by another process)
      if (error instanceof ConditionalCheckFailedException || 
          (error instanceof Error && error.name === 'ConditionalCheckFailedException')) {
        console.log(`Job ${jobId} is no longer PENDING, likely already submitted`);
        return NextResponse.json(
          { 
            error: 'Job has already been submitted or status changed',
            message: 'This job is no longer in PENDING status and cannot be submitted again.'
          },
          { status: 409 } // 409 Conflict
        );
      }
      throw error; // Re-throw other errors
    }

    // Submit job to AWS Batch
    try {
      const batchJobId = await batchHelper.submitJob(jobId);
      
      console.log(`Successfully submitted job ${jobId} to AWS Batch. Batch job ID: ${batchJobId}`);

      // Return 202 Accepted - job has been accepted for processing
      return NextResponse.json(
        { 
          message: 'Job submitted successfully',
          jobId,
          batchJobId 
        },
        { status: 202 }
      );
    } catch (batchError) {
      console.error(`Failed to submit job ${jobId} to AWS Batch:`, batchError);
      
      // Rollback: attempt to set job status back to PENDING since Batch submission failed.
      // Use a conditional update so we only roll back if the job is still in PROCESSING.
      // This prevents overwriting a status that may have been updated by another process.
      try {
        const rollbackCommand = new UpdateCommand({
          TableName: dynamoTableName,
          Key: { jobId },
          UpdateExpression: 'SET #status = :pending, updatedAt = :updatedAt',
          ConditionExpression: '#status = :processing',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':pending': JobStatus.PENDING,
            ':processing': JobStatus.PROCESSING,
            ':updatedAt': getUnixTimestamp(),
          },
        });

        await dbHelper.getClient().send(rollbackCommand);
        console.log(`Rolled back job ${jobId} status to PENDING after Batch submission failure`);
      } catch (rollbackError) {
        if (
          rollbackError instanceof ConditionalCheckFailedException ||
          (rollbackError instanceof Error && rollbackError.name === 'ConditionalCheckFailedException')
        ) {
          // The job status was no longer PROCESSING, so another process has already updated it.
          // In this case, we intentionally skip the rollback to avoid overwriting a newer state.
          console.log(
            `Skipped rollback for job ${jobId} because status is no longer PROCESSING (likely updated concurrently)`
          );
        } else {
          console.error(`Failed to rollback job ${jobId} status:`, rollbackError);
        }
      }

      return NextResponse.json(
        { 
          error: 'Failed to submit job to processing queue',
          message: 'The job could not be submitted to AWS Batch. Please try again later.'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Unexpected error in POST /api/jobs/{jobId}/submit:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
