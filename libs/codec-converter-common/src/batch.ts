/**
 * AWS Batch Helper for codec-converter
 * Provides utilities for submitting jobs to AWS Batch
 */

import { BatchClient, SubmitJobCommand } from "@aws-sdk/client-batch";

/**
 * BatchHelper class for managing AWS Batch operations
 */
export class BatchHelper {
  private client: BatchClient;
  private jobQueueName: string;
  private jobDefinitionName: string;

  constructor(jobQueueName: string, jobDefinitionName: string, region?: string) {
    this.client = new BatchClient({
      region: region || process.env.AWS_REGION || "us-east-1",
    });
    this.jobQueueName = jobQueueName;
    this.jobDefinitionName = jobDefinitionName;
  }

  /**
   * Submit a job to AWS Batch
   * @param jobId - UUID of the job (used as Batch job name)
   * @param parameters - Optional job parameters to pass to the Batch job.
   *                     These parameters are key-value pairs that will be passed
   *                     to the container as environment variables or command-line arguments,
   *                     depending on how the job definition is configured.
   *                     Example: { "inputFormat": "mp4", "outputFormat": "webm" }
   * @returns The Batch job ID
   */
  async submitJob(
    jobId: string,
    parameters?: Record<string, string>,
  ): Promise<string> {
    const command = new SubmitJobCommand({
      jobName: `codec-converter-${jobId}`,
      jobQueue: this.jobQueueName,
      jobDefinition: this.jobDefinitionName,
      parameters: parameters || {},
      containerOverrides: {
        environment: [
          {
            name: "JOB_ID",
            value: jobId,
          },
        ],
      },
    });

    const result = await this.client.send(command);

    if (!result.jobId) {
      throw new Error("Failed to submit job to AWS Batch: no jobId returned");
    }

    return result.jobId;
  }

  /**
   * Get the AWS Batch client instance
   * @returns BatchClient instance
   */
  getClient(): BatchClient {
    return this.client;
  }

  /**
   * Get the job queue name
   * @returns Job queue name
   */
  getJobQueueName(): string {
    return this.jobQueueName;
  }

  /**
   * Get the job definition name
   * @returns Job definition name
   */
  getJobDefinitionName(): string {
    return this.jobDefinitionName;
  }
}
