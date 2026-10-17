import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type { AnalysisProgress, BatchStage, Job, JobKey } from '../types.js';
import type { JobRepository } from './job.repository.interface.js';
import { JobMapper } from '../mappers/job.mapper.js';

/**
 * InMemory Job Repository
 *
 * DynamoDB 版と同じ Mapper・同じ EntityStore の振る舞いを使う。テスト環境で使用
 */
export class InMemoryJobRepository implements JobRepository {
  private readonly entityStore: EntityStore<Job, JobKey>;

  constructor(store: InMemorySingleTableStore) {
    this.entityStore = new InMemoryEntityStore(store, new JobMapper());
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
