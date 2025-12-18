/**
 * DynamoDB Helper for codec-converter
 * Provides utilities for DynamoDB operations for Job management
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { Job, JobStatus } from './models/job';

/**
 * DynamoDB helper class for managing Job entities
 */
export class DynamoDBHelper {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName: string, region?: string) {
    const client = new DynamoDBClient({
      region: region || process.env.AWS_REGION || 'us-east-1',
    });
    // Use DocumentClient for automatic marshalling/unmarshalling
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = tableName;
  }

  /**
   * Get a job by its ID from DynamoDB
   * @param jobId - The unique job identifier
   * @returns The Job object if found, null otherwise
   */
  async getJob(jobId: string): Promise<Job | null> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: { jobId },
    });

    const response = await this.docClient.send(command);

    if (!response.Item) {
      return null;
    }

    return response.Item as Job;
  }

  /**
   * Put (create or update) a job in DynamoDB
   * @param job - The Job object to persist
   * 
   * Note: expiresAt is automatically set to createdAt + 86400 (24 hours)
   * by the Job model's createJob function, ensuring TTL cleanup after 24 hours
   */
  async putJob(job: Job): Promise<void> {
    const command = new PutCommand({
      TableName: this.tableName,
      Item: job,
    });

    await this.docClient.send(command);
  }

  /**
   * Delete a job from DynamoDB
   * @param jobId - The unique job identifier
   */
  async deleteJob(jobId: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: { jobId },
    });

    await this.docClient.send(command);
  }

  /**
   * Update the status of a job
   * @param jobId - The unique job identifier
   * @param status - The new status
   * @param errorMessage - Optional error message (for FAILED status)
   */
  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    errorMessage?: string
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000); // epoch seconds
    
    const updateExpression = errorMessage
      ? 'SET #status = :status, updatedAt = :updatedAt, errorMessage = :errorMessage'
      : 'SET #status = :status, updatedAt = :updatedAt';

    const expressionAttributeValues: Record<string, unknown> = {
      ':status': status,
      ':updatedAt': now,
    };

    if (errorMessage) {
      expressionAttributeValues[':errorMessage'] = errorMessage;
    }

    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: { jobId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        '#status': 'status', // Using alias because 'status' is a reserved word in DynamoDB
      },
      ExpressionAttributeValues: expressionAttributeValues,
    });

    await this.docClient.send(command);
  }

  /**
   * Update the output file path for a completed job
   * @param jobId - The unique job identifier
   * @param outputFile - The S3 path to the output file
   */
  async updateJobOutputFile(jobId: string, outputFile: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000); // epoch seconds

    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: { jobId },
      UpdateExpression: 'SET outputFile = :outputFile, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':outputFile': outputFile,
        ':updatedAt': now,
      },
    });

    await this.docClient.send(command);
  }

  /**
   * Get the DynamoDB table name
   * @returns DynamoDB table name
   */
  getTableName(): string {
    return this.tableName;
  }

  /**
   * Get the DynamoDB document client instance
   * @returns DynamoDBDocumentClient instance
   */
  getDocClient(): DynamoDBDocumentClient {
    return this.docClient;
  }
}
