import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { BatchStage, Job } from '../types.js';
import type { JobRepository } from './job.repository.interface.js';

type JobItem = {
  PK: string;
  SK: string;
  Type: 'JOB';
  jobId: string;
  batchJobId?: string;
  batchStage?: string;
  originalFileName: string;
  fileSize: number;
  createdAt: number;
  expiresAt: number;
  errorMessage?: string;
};

export class DynamoDBJobRepository implements JobRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async getById(jobId: string): Promise<Job | null> {
    const key = this.buildKeys(jobId);
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key,
      })
    );
    if (!response.Item) {
      return null;
    }
    return this.mapToEntity(response.Item as JobItem);
  }

  public async create(job: Job): Promise<Job> {
    const item = this.mapToItem(job);
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    );
    return job;
  }

  public async updateBatchJobId(jobId: string, batchJobId: string): Promise<void> {
    const key = this.buildKeys(jobId);
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: key,
        UpdateExpression: 'SET #batchJobId = :batchJobId',
        ExpressionAttributeNames: {
          '#batchJobId': 'batchJobId',
        },
        ExpressionAttributeValues: {
          ':batchJobId': batchJobId,
        },
      })
    );
  }

  public async updateBatchStage(jobId: string, batchStage: BatchStage): Promise<void> {
    const key = this.buildKeys(jobId);
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: key,
        UpdateExpression: 'SET #batchStage = :batchStage',
        ExpressionAttributeNames: {
          '#batchStage': 'batchStage',
        },
        ExpressionAttributeValues: {
          ':batchStage': batchStage,
        },
      })
    );
  }

  public async updateErrorMessage(jobId: string, errorMessage: string): Promise<void> {
    const key = this.buildKeys(jobId);
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: key,
        UpdateExpression: 'SET #errorMessage = :errorMessage',
        ExpressionAttributeNames: {
          '#errorMessage': 'errorMessage',
        },
        ExpressionAttributeValues: {
          ':errorMessage': errorMessage,
        },
      })
    );
  }

  private buildKeys(jobId: string): { PK: string; SK: string } {
    return {
      PK: `JOB#${jobId}`,
      SK: `JOB#${jobId}`,
    };
  }

  private mapToEntity(item: JobItem): Job {
    return {
      jobId: item.jobId,
      ...(item.batchJobId ? { batchJobId: item.batchJobId } : {}),
      ...(item.batchStage ? { batchStage: item.batchStage as BatchStage } : {}),
      originalFileName: item.originalFileName,
      fileSize: item.fileSize,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}),
    };
  }

  private mapToItem(job: Job): JobItem {
    return {
      ...this.buildKeys(job.jobId),
      Type: 'JOB',
      jobId: job.jobId,
      ...(job.batchJobId ? { batchJobId: job.batchJobId } : {}),
      ...(job.batchStage ? { batchStage: job.batchStage } : {}),
      originalFileName: job.originalFileName,
      fileSize: job.fileSize,
      createdAt: job.createdAt,
      expiresAt: job.expiresAt,
      ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
    };
  }
}
