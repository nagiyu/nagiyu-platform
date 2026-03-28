import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Job, JobRepository, JobStatus } from '@nagiyu/quick-clip-core';

type JobItem = {
  PK: string;
  SK: string;
  Type: 'JOB';
  jobId: string;
  status: JobStatus;
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

  public async updateStatus(
    jobId: string,
    status: JobStatus,
    errorMessage?: string | undefined
  ): Promise<Job> {
    const key = this.buildKeys(jobId);
    const shouldSetError = status === 'FAILED' && typeof errorMessage === 'string';

    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: key,
        UpdateExpression: shouldSetError
          ? 'SET #status = :status, #errorMessage = :errorMessage'
          : 'SET #status = :status REMOVE #errorMessage',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#errorMessage': 'errorMessage',
        },
        ...(shouldSetError
          ? {
              ExpressionAttributeValues: {
                ':status': status,
                ':errorMessage': errorMessage,
              },
            }
          : {
              ExpressionAttributeValues: {
                ':status': status,
              },
            }),
      })
    );

    const updated = await this.getById(jobId);
    if (!updated) {
      throw new Error('ジョブが見つかりません');
    }
    return updated;
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
      status: item.status,
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
      status: job.status,
      originalFileName: job.originalFileName,
      fileSize: job.fileSize,
      createdAt: job.createdAt,
      expiresAt: job.expiresAt,
      ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
    };
  }
}
