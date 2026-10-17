import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, type EntityStore } from '@nagiyu/aws';
import { JobMapper, type JobKey } from '../mappers/job.mapper.js';
import type { Job } from '../types.js';
import type { JobRepository, UpdateJobStatusInput } from './job.repository.interface.js';

/**
 * DynamoDB 版ジョブリポジトリ
 *
 * 単一アイテムの CRUD は EntityStore に任せる。
 */
export class DynamoDBJobRepository implements JobRepository {
  private readonly entityStore: EntityStore<Job, JobKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, new JobMapper());
  }

  public async getById(jobId: string): Promise<Job | null> {
    return this.entityStore.get({ jobId });
  }

  public async create(job: Job): Promise<Job> {
    return this.entityStore.create(job);
  }

  public async updateStatus(jobId: string, input: UpdateJobStatusInput): Promise<Job> {
    return this.entityStore.update(
      { jobId },
      {
        status: input.status,
        outputFile: input.outputFile,
        errorMessage: input.errorMessage,
      }
    );
  }
}
