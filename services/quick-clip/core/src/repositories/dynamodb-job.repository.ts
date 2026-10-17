import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, type EntityStore } from '@nagiyu/aws';
import type { AnalysisProgress, BatchStage, Job, JobKey } from '../types.js';
import type { JobRepository } from './job.repository.interface.js';
import { JobMapper } from '../mappers/job.mapper.js';

/**
 * DynamoDB Job Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せる
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

  public async updateBatchJobId(jobId: string, batchJobId: string): Promise<void> {
    await this.entityStore.update({ jobId }, { batchJobId });
  }

  public async updateBatchStage(jobId: string, batchStage: BatchStage): Promise<void> {
    await this.entityStore.update({ jobId }, { batchStage });
  }

  public async updateErrorMessage(jobId: string, errorMessage: string): Promise<void> {
    await this.entityStore.update({ jobId }, { errorMessage });
  }

  public async updateAnalysisProgress(jobId: string, progress: AnalysisProgress): Promise<void> {
    await this.entityStore.update({ jobId }, { analysisProgress: progress });
  }
}
