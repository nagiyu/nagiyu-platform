import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  createHighlightRepository,
  createJobRepository,
  resetInMemoryRepositories,
} from '../../../src/repositories/factory.js';
import { DynamoDBHighlightRepository } from '../../../src/repositories/dynamodb-highlight.repository.js';
import { DynamoDBJobRepository } from '../../../src/repositories/dynamodb-job.repository.js';
import { InMemoryHighlightRepository } from '../../../src/repositories/in-memory-highlight.repository.js';
import { InMemoryJobRepository } from '../../../src/repositories/in-memory-job.repository.js';
import type { Highlight, Job } from '../../../src/types.js';

const CREATED_AT = 1704067200000;
const EXPIRES_AT = 1704153600000;

const buildJob = (): Job => ({
  jobId: 'job-1',
  originalFileName: 'movie.mp4',
  fileSize: 1024,
  createdAt: CREATED_AT,
  expiresAt: EXPIRES_AT,
});

const buildHighlight = (): Highlight => ({
  highlightId: 'h-1',
  jobId: 'job-1',
  order: 1,
  startSec: 10,
  endSec: 20,
  source: 'motion',
  status: 'unconfirmed',
  clipStatus: 'PENDING',
  expiresAt: EXPIRES_AT,
});

describe('リポジトリ生成の口', () => {
  const docClient = { send: jest.fn() } as unknown as DynamoDBDocumentClient;

  beforeEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.DYNAMODB_TABLE_NAME;
    resetInMemoryRepositories();
  });

  afterAll(() => {
    delete process.env.USE_IN_MEMORY_DB;
    resetInMemoryRepositories();
  });

  describe('InMemory / DynamoDB の切り替え', () => {
    it('USE_IN_MEMORY_DB=true なら InMemory 実装を返す', () => {
      process.env.USE_IN_MEMORY_DB = 'true';

      expect(createJobRepository()).toBeInstanceOf(InMemoryJobRepository);
      expect(createHighlightRepository()).toBeInstanceOf(InMemoryHighlightRepository);
    });

    it('docClient と tableName を明示すると DynamoDB 実装を返す', () => {
      expect(createJobRepository(docClient, 'test-table')).toBeInstanceOf(DynamoDBJobRepository);
      expect(createHighlightRepository(docClient, 'test-table')).toBeInstanceOf(
        DynamoDBHighlightRepository
      );
    });

    it('tableName を env から解決できる', () => {
      process.env.DYNAMODB_TABLE_NAME = 'env-table';

      expect(createJobRepository(docClient)).toBeInstanceOf(DynamoDBJobRepository);
    });

    it('tableName が引数と env のどちらにも無ければ例外を投げる', () => {
      expect(() => createJobRepository(docClient)).toThrow();
    });
  });

  describe('シングルトンと reset', () => {
    it('同じ口からは同じインスタンスを返す', () => {
      process.env.USE_IN_MEMORY_DB = 'true';

      expect(createJobRepository()).toBe(createJobRepository());
      expect(createHighlightRepository()).toBe(createHighlightRepository());
    });

    it('reset 後は新しいインスタンスを返す', () => {
      process.env.USE_IN_MEMORY_DB = 'true';
      const jobBefore = createJobRepository();
      const highlightBefore = createHighlightRepository();

      resetInMemoryRepositories();

      expect(createJobRepository()).not.toBe(jobBefore);
      expect(createHighlightRepository()).not.toBe(highlightBefore);
    });

    it('reset で共有 store の中身も捨てる', async () => {
      process.env.USE_IN_MEMORY_DB = 'true';
      await createJobRepository().create(buildJob());
      await createHighlightRepository().createMany([buildHighlight()]);

      resetInMemoryRepositories();

      expect(await createJobRepository().getById('job-1')).toBeNull();
      expect(await createHighlightRepository().getByJobId('job-1')).toEqual([]);
    });
  });

  describe('共有 store', () => {
    it('Job と Highlight は同じ store を使い、互いのデータを壊さない', async () => {
      process.env.USE_IN_MEMORY_DB = 'true';

      await createJobRepository().create(buildJob());
      await createHighlightRepository().createMany([buildHighlight()]);

      expect(await createJobRepository().getById('job-1')).toEqual(buildJob());
      expect(await createHighlightRepository().getByJobId('job-1')).toEqual([buildHighlight()]);
    });
  });
});
