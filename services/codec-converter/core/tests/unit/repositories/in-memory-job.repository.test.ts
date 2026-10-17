import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InMemorySingleTableStore,
} from '@nagiyu/aws';
import { InMemoryJobRepository } from '../../../src/repositories/in-memory-job.repository';
import type { Job } from '../../../src/types';

const NOW = 1704067300000;
const CREATED_AT = 1704067200000;
const EXPIRES_AT = 1704153600000;

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    jobId: 'job-123',
    status: 'PENDING',
    inputFile: 'uploads/job-123/input.mp4',
    outputCodec: 'h264',
    fileName: 'sample.mp4',
    fileSize: 1024,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

describe('InMemoryJobRepository', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryJobRepository;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    store = new InMemorySingleTableStore();
    repository = new InMemoryJobRepository(store);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('作成したジョブを取得できる (updatedAt は書き込み時刻になる)', async () => {
    const created = await repository.create(buildJob());

    expect(created).toEqual(buildJob({ updatedAt: NOW }));
    expect(await repository.getById('job-123')).toEqual(buildJob({ updatedAt: NOW }));
  });

  it('なければ null を返す', async () => {
    expect(await repository.getById('missing')).toBeNull();
  });

  it('同じ jobId を作成すると EntityAlreadyExistsError にする', async () => {
    await repository.create(buildJob());

    await expect(repository.create(buildJob())).rejects.toThrow(EntityAlreadyExistsError);
  });

  it('ステータスを更新し、未指定の項目は保つ', async () => {
    await repository.create(buildJob());

    const processing = await repository.updateStatus('job-123', { status: 'PROCESSING' });
    expect(processing.status).toBe('PROCESSING');

    jest.setSystemTime(NOW + 1000);
    const completed = await repository.updateStatus('job-123', {
      status: 'COMPLETED',
      outputFile: 'outputs/job-123/output.mp4',
    });

    expect(completed).toEqual(
      buildJob({
        status: 'COMPLETED',
        outputFile: 'outputs/job-123/output.mp4',
        updatedAt: NOW + 1000,
      })
    );
    expect(await repository.getById('job-123')).toEqual(completed);
  });

  it('errorMessage を保存する', async () => {
    await repository.create(buildJob());

    const failed = await repository.updateStatus('job-123', {
      status: 'FAILED',
      errorMessage: '失敗',
    });

    expect(failed.errorMessage).toBe('失敗');
  });

  it('対象がなければ EntityNotFoundError にする', async () => {
    await expect(repository.updateStatus('missing', { status: 'PROCESSING' })).rejects.toThrow(
      EntityNotFoundError
    );
  });

  it('旧形式のアイテムを読み、更新すると新形式に置き換える', async () => {
    store.putByKey(
      { jobId: 'job-123' },
      {
        jobId: 'job-123',
        status: 'PENDING',
        inputFile: 'uploads/job-123/input.mp4',
        outputCodec: 'h264',
        fileName: 'sample.mp4',
        fileSize: 1024,
        createdAt: 1704067200,
        updatedAt: 1704067200,
        expiresAt: 1704153600,
      }
    );

    expect(await repository.getById('job-123')).toEqual(buildJob());

    await repository.updateStatus('job-123', { status: 'PROCESSING' });

    const stored = store.getByKey({ jobId: 'job-123' });
    expect(stored).toMatchObject({ Status: 'PROCESSING', UpdatedAt: NOW });
    expect(stored).not.toHaveProperty('status');
    expect(stored).not.toHaveProperty('updatedAt');
  });
});
