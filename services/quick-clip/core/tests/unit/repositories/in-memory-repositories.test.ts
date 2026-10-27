import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InMemorySingleTableStore,
  InvalidEntityDataError,
} from '@nagiyu/aws';
import { InMemoryHighlightRepository } from '../../../src/repositories/in-memory-highlight.repository.js';
import { InMemoryJobRepository } from '../../../src/repositories/in-memory-job.repository.js';
import type { Highlight, Job } from '../../../src/types.js';

const CREATED_AT = 1704067200000;
const EXPIRES_AT = 1704153600000;

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    jobId: 'job-1',
    originalFileName: 'movie.mp4',
    fileSize: 1024,
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function buildHighlight(overrides: Partial<Highlight> = {}): Highlight {
  return {
    highlightId: 'h-1',
    jobId: 'job-1',
    order: 1,
    startSec: 10,
    endSec: 20,
    source: 'motion',
    status: 'unconfirmed',
    clipStatus: 'PENDING',
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

describe('InMemoryJobRepository', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryJobRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryJobRepository(store);
  });

  it('create したジョブを getById で取得できる', async () => {
    const created = await repository.create(buildJob({ durationSec: 30 }));

    expect(created).toEqual(buildJob({ durationSec: 30 }));
    expect(await repository.getById('job-1')).toEqual(created);
  });

  it('存在しないジョブは null を返す', async () => {
    expect(await repository.getById('missing')).toBeNull();
  });

  it('既に存在するジョブの create は EntityAlreadyExistsError を投げる', async () => {
    await repository.create(buildJob());

    await expect(repository.create(buildJob())).rejects.toBeInstanceOf(EntityAlreadyExistsError);
  });

  it('各 update メソッドが該当項目だけを更新する', async () => {
    await repository.create(buildJob());

    await repository.updateBatchJobId('job-1', 'batch-1');
    await repository.updateBatchStage('job-1', 'analyzing');
    await repository.updateErrorMessage('job-1', 'エラー');
    await repository.updateAnalysisProgress('job-1', {
      motion: { status: 'done' },
      volume: { status: 'in_progress', completed: 1, total: 2 },
    });

    expect(await repository.getById('job-1')).toEqual(
      buildJob({
        batchJobId: 'batch-1',
        batchStage: 'analyzing',
        errorMessage: 'エラー',
        analysisProgress: {
          motion: { status: 'done' },
          volume: { status: 'in_progress', completed: 1, total: 2 },
        },
      })
    );
  });

  it('旧形式のアイテムを update すると、更新した項目の旧名が消えて新名だけが残る', async () => {
    const key = { PK: 'JOB#job-9', SK: 'JOB#job-9' };
    store.putByKey(key, {
      ...key,
      Type: 'JOB',
      jobId: 'job-9',
      batchStage: 'downloading',
      originalFileName: 'old.mp4',
      fileSize: 1,
      createdAt: CREATED_AT / 1000,
      expiresAt: EXPIRES_AT / 1000,
    });

    await repository.updateBatchStage('job-9', 'clipping');

    const item = store.getByKey(key)!;
    expect(item.BatchStage).toBe('clipping');
    expect(item).not.toHaveProperty('batchStage');
    // 更新していない項目は旧名のまま残り、読み取りでは引き続き受け付ける
    expect(item).toHaveProperty('jobId', 'job-9');
    expect(await repository.getById('job-9')).toMatchObject({
      jobId: 'job-9',
      batchStage: 'clipping',
      createdAt: CREATED_AT,
    });
  });

  it('存在しないジョブの update は EntityNotFoundError を投げ、アイテムを作らない', async () => {
    await expect(repository.updateBatchStage('missing', 'clipping')).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    expect(await repository.getById('missing')).toBeNull();
  });

  it('TTL はエポック秒、旧形式のアイテムも読める', async () => {
    await repository.create(buildJob());
    expect(store.getByKey({ PK: 'JOB#job-1', SK: 'JOB#job-1' })).toMatchObject({
      JobID: 'job-1',
      TTL: EXPIRES_AT / 1000,
    });

    store.putByKey(
      { PK: 'JOB#job-2', SK: 'JOB#job-2' },
      {
        PK: 'JOB#job-2',
        SK: 'JOB#job-2',
        Type: 'JOB',
        jobId: 'job-2',
        originalFileName: 'old.mp4',
        fileSize: 1,
        createdAt: CREATED_AT / 1000,
        expiresAt: EXPIRES_AT / 1000,
      }
    );
    expect(await repository.getById('job-2')).toEqual(
      buildJob({ jobId: 'job-2', originalFileName: 'old.mp4', fileSize: 1 })
    );
  });

  it('読めないデータは InvalidEntityDataError を投げる', async () => {
    store.putByKey(
      { PK: 'JOB#job-3', SK: 'JOB#job-3' },
      { PK: 'JOB#job-3', SK: 'JOB#job-3', Type: 'JOB', JobID: 'job-3' }
    );

    await expect(repository.getById('job-3')).rejects.toBeInstanceOf(InvalidEntityDataError);
  });
});

describe('InMemoryHighlightRepository', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryHighlightRepository;
  let jobRepository: InMemoryJobRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryHighlightRepository(store);
    jobRepository = new InMemoryJobRepository(store);
  });

  it('createMany した見どころを getById で取得できる', async () => {
    await repository.createMany([buildHighlight({ dominantEmotion: 'laugh', source: 'emotion' })]);

    expect(await repository.getById('job-1', 'h-1')).toEqual(
      buildHighlight({ dominantEmotion: 'laugh', source: 'emotion' })
    );
    expect(await repository.getById('job-1', 'missing')).toBeNull();
  });

  it('createMany は既存の見どころを置き換える (upsert)', async () => {
    await repository.createMany([buildHighlight()]);
    await repository.createMany([buildHighlight({ startSec: 99, endSec: 100 })]);

    expect(await repository.getById('job-1', 'h-1')).toMatchObject({ startSec: 99, endSec: 100 });
  });

  it('getByJobId は同じジョブの見どころだけを order 順に返す', async () => {
    await jobRepository.create(buildJob());
    await jobRepository.create(buildJob({ jobId: 'job-2' }));
    await repository.createMany([
      buildHighlight({ highlightId: 'h-b', order: 2 }),
      buildHighlight({ highlightId: 'h-a', order: 1 }),
      buildHighlight({ highlightId: 'h-c', jobId: 'job-2', order: 1 }),
    ]);

    const result = await repository.getByJobId('job-1');

    expect(result.map((h) => h.highlightId)).toEqual(['h-a', 'h-b']);
    expect(await repository.getByJobId('none')).toEqual([]);
  });

  it('getByJobId は 100 件を超える見どころも全件返す', async () => {
    await repository.createMany(
      Array.from({ length: 120 }, (_, i) => buildHighlight({ highlightId: `h-${i}`, order: i }))
    );

    expect(await repository.getByJobId('job-1')).toHaveLength(120);
  });

  it('update は更新後の Entity を返す', async () => {
    await repository.createMany([buildHighlight()]);

    const result = await repository.update('job-1', 'h-1', {
      startSec: 12,
      status: 'accepted',
      clipStatus: 'GENERATED',
    });

    expect(result).toEqual(
      buildHighlight({ startSec: 12, status: 'accepted', clipStatus: 'GENERATED' })
    );
    expect(await repository.getById('job-1', 'h-1')).toEqual(result);
  });

  it('旧形式のアイテムを update すると、更新した項目の旧名が消えて新名だけが残る', async () => {
    const key = { PK: 'JOB#job-1', SK: 'HIGHLIGHT#h-old' };
    store.putByKey(key, {
      ...key,
      Type: 'HIGHLIGHT',
      highlightId: 'h-old',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      source: 'motion',
      status: 'unconfirmed',
      clipStatus: 'PENDING',
      expiresAt: EXPIRES_AT / 1000,
    });

    const result = await repository.update('job-1', 'h-old', { status: 'accepted' });

    const item = store.getByKey(key)!;
    expect(item.Status).toBe('accepted');
    expect(item).not.toHaveProperty('status');
    expect(item).toHaveProperty('startSec', 10);
    expect(result).toEqual(buildHighlight({ highlightId: 'h-old', status: 'accepted' }));
  });

  it('clipGeneratingStartedAt を update で保存して読み戻せる', async () => {
    await repository.createMany([buildHighlight()]);

    const result = await repository.update('job-1', 'h-1', {
      clipStatus: 'GENERATING',
      clipGeneratingStartedAt: 1700000000000,
    });

    expect(result).toEqual(
      buildHighlight({ clipStatus: 'GENERATING', clipGeneratingStartedAt: 1700000000000 })
    );
    expect(await repository.getById('job-1', 'h-1')).toEqual(result);
  });

  it('存在しない見どころの update は EntityNotFoundError を投げる', async () => {
    await expect(repository.update('job-1', 'missing', { startSec: 1 })).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });
});
