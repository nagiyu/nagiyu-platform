import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import { JobMapper, type JobKey } from '../mappers/job.mapper.js';
import type { Job } from '../types.js';
import type { JobRepository, UpdateJobStatusInput } from './job.repository.interface.js';

/**
 * InMemory 版ジョブリポジトリ
 *
 * DynamoDB 版と同じ Mapper と EntityStore の振る舞いを使う。テスト環境で使用する。
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
