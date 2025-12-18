/**
 * DynamoDB Helper for codec-converter
 * Provides utilities for DynamoDB operations for Job management
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Job, JobStatus } from './models/job';

/**
 * DynamoDB helper class for managing Job entities
 */
export class DynamoDBHelper {
  private client: DynamoDBClient;
  private tableName: string;

  constructor(tableName: string, region?: string) {
    this.client = new DynamoDBClient({
      region: region || process.env.AWS_REGION || 'us-east-1',
    });
    this.tableName = tableName;
  }

  /**
   * Get a job by its ID from DynamoDB
   * @param jobId - The unique job identifier
   * @returns The Job object if found, null otherwise
   */
  async getJob(jobId: string): Promise<Job | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ jobId }),
    });

    const response = await this.client.send(command);

    if (!response.Item) {
      return null;
    }

    return unmarshall(response.Item) as Job;
  }

  /**
   * Put (create or update) a job in DynamoDB
   * @param job - The Job object to persist
   * 
   * Note: expiresAt is automatically set to createdAt + 86400 (24 hours)
   * by the Job model's createJob function, ensuring TTL cleanup after 24 hours
   */
  async putJob(job: Job): Promise<void> {
    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(job),
    });

    await this.client.send(command);
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

    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ jobId }),
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        '#status': 'status', // Using alias because 'status' is a reserved word in DynamoDB
      },
      ExpressionAttributeValues: marshall(expressionAttributeValues),
    });

    await this.client.send(command);
  }

  /**
   * Update the output file path for a completed job
   * @param jobId - The unique job identifier
   * @param outputFile - The S3 path to the output file
   */
  async updateJobOutputFile(jobId: string, outputFile: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000); // epoch seconds

    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ jobId }),
      UpdateExpression: 'SET outputFile = :outputFile, updatedAt = :updatedAt',
      ExpressionAttributeValues: marshall({
        ':outputFile': outputFile,
        ':updatedAt': now,
      }),
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
   * Get the DynamoDB client instance
   * @returns DynamoDBClient instance
   */
  getClient(): DynamoDBClient {
    return this.client;
  }
}
