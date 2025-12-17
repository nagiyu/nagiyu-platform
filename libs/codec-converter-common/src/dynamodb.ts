/**
 * DynamoDB Helper for codec-converter
 * Provides utilities for DynamoDB operations including Job management
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

/**
 * Job status enum
 */
export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * Job interface representing a codec conversion job
 */
export interface Job {
  jobId: string;
  status: JobStatus;
  inputFile: string;
  outputFile?: string;
  outputCodec: 'h264' | 'vp9' | 'av1';
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  fileName: string;
  fileSize: number;
  errorMessage?: string;
}

/**
 * DynamoDBHelper class for managing DynamoDB operations
 */
export class DynamoDBHelper {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName: string, region?: string) {
    const ddbClient = new DynamoDBClient({ region: region || process.env.AWS_REGION || 'us-east-1' });
    this.client = DynamoDBDocumentClient.from(ddbClient);
    this.tableName = tableName;
  }

  /**
   * Get a job by jobId
   * @param jobId - UUID of the job
   * @returns Job object or null if not found
   */
  async getJob(jobId: string): Promise<Job | null> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: { jobId },
    });

    const result = await this.client.send(command);
    return (result.Item as Job) || null;
  }

  /**
   * Create or update a job
   * @param job - Job object to store
   */
  async putJob(job: Job): Promise<void> {
    const command = new PutCommand({
      TableName: this.tableName,
      Item: job,
    });

    await this.client.send(command);
  }

  /**
   * Update job status
   * @param jobId - UUID of the job
   * @param status - New status
   * @param errorMessage - Optional error message (for FAILED status)
   */
  async updateJobStatus(jobId: string, status: JobStatus, errorMessage?: string): Promise<void> {
    const updateExpression = errorMessage
      ? 'SET #status = :status, updatedAt = :updatedAt, errorMessage = :errorMessage'
      : 'SET #status = :status, updatedAt = :updatedAt';

    const expressionAttributeValues: Record<string, any> = {
      ':status': status,
      ':updatedAt': Math.floor(Date.now() / 1000),
    };

    if (errorMessage) {
      expressionAttributeValues[':errorMessage'] = errorMessage;
    }

    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: { jobId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: expressionAttributeValues,
    });

    await this.client.send(command);
  }

  /**
   * Delete a job
   * @param jobId - UUID of the job
   */
  async deleteJob(jobId: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: { jobId },
    });

    await this.client.send(command);
  }

  /**
   * Get the DynamoDB table name
   * @returns DynamoDB table name
   */
  getTableName(): string {
    return this.tableName;
  }

  /**
   * Get the DynamoDB Document client instance
   * @returns DynamoDBDocumentClient instance
   */
  getClient(): DynamoDBDocumentClient {
    return this.client;
  }
}
