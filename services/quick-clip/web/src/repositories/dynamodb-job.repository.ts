import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDBDocumentClient, getTableName } from '@/lib/server/aws';
import { DOMAIN_ERROR_MESSAGES } from '@/lib/server/domain-services';
import type { JobRepository } from '@/types/repository';
import type { Job } from '@/types/quick-clip';

let cachedRepository: JobRepository | null = null;

export const getJobRepository = (): JobRepository => {
  if (!cachedRepository) {
    cachedRepository = new DynamoDBJobRepository(getTableName());
  }
  return cachedRepository;
};

type JobItem = {
  PK: string;
  SK: string;
  Type: 'JOB';
  jobId: string;
  status: Job['status'];
  originalFileName: string;
  fileSize: number;
  createdAt: number;
  expiresAt: number;
  errorMessage?: string;
};

class DynamoDBJobRepository implements JobRepository {
  private readonly tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  public async getById(jobId: string): Promise<Job | null> {
    const response = await getDynamoDBDocumentClient().send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.buildKeys(jobId),
      })
    );

    if (!response.Item) {
      return null;
    }

    return this.mapToEntity(response.Item as JobItem);
  }

  public async create(job: Job): Promise<Job> {
    await getDynamoDBDocumentClient().send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.mapToItem(job),
      })
    );
    return job;
  }

  public async updateStatus(
    jobId: string,
    status: Job['status'],
    errorMessage?: string
  ): Promise<Job> {
    const shouldSetError = status === 'FAILED' && typeof errorMessage === 'string';

    await getDynamoDBDocumentClient().send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: this.buildKeys(jobId),
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
      throw new Error(DOMAIN_ERROR_MESSAGES.JOB_UPDATED_FETCH_FAILED);
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
