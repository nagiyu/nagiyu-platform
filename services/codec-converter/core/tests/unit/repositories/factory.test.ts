import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createJobRepository, resetInMemoryRepositories } from '../../../src/repositories/factory';
import { DynamoDBJobRepository } from '../../../src/repositories/dynamodb-job.repository';
import { InMemoryJobRepository } from '../../../src/repositories/in-memory-job.repository';
import type { Job } from '../../../src/types';

const docClient = { send: jest.fn() } as unknown as DynamoDBDocumentClient;

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    jobId: 'job-123',
    status: 'PENDING',
    inputFile: 'uploads/job-123/input.mp4',
    outputCodec: 'h264',
    fileName: 'sample.mp4',
    fileSize: 1024,
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
    expiresAt: 1704153600000,
    ...overrides,
  };
}

describe('Job リポジトリの factory', () => {
  const originalUseInMemory = process.env.USE_IN_MEMORY_DB;

  beforeEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
    resetInMemoryRepositories();
  });

  afterAll(() => {
    if (originalUseInMemory === undefined) {
      delete process.env.USE_IN_MEMORY_DB;
    } else {
      process.env.USE_IN_MEMORY_DB = originalUseInMemory;
    }
    resetInMemoryRepositories();
  });

  it('USE_IN_MEMORY_DB=true の場合、InMemoryJobRepository を返す', () => {
    process.env.USE_IN_MEMORY_DB = 'true';

    expect(createJobRepository()).toBeInstanceOf(InMemoryJobRepository);
  });

  it('docClient と tableName を明示した場合、DynamoDBJobRepository を返す', () => {
    expect(createJobRepository(docClient, 'test-table')).toBeInstanceOf(DynamoDBJobRepository);
  });

  it('tableName が空文字の場合は例外を投げる', () => {
    expect(() => createJobRepository(docClient, '')).toThrow(
      'DynamoDB 実装には docClient と tableName が必要です'
    );
  });

  it('同じ呼び出しでは singleton として同じインスタンスを返す', () => {
    process.env.USE_IN_MEMORY_DB = 'true';

    expect(createJobRepository()).toBe(createJobRepository());
  });

  it('resetInMemoryRepositories 後は新しいインスタンスと空の store になる', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const before = createJobRepository();
    await before.create(buildJob());

    resetInMemoryRepositories();

    const after = createJobRepository();
    expect(after).not.toBe(before);
    expect(await after.getById('job-123')).toBeNull();
  });
});
