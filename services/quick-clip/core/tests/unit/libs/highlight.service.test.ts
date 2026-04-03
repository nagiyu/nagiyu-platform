import { HighlightService } from '../../../src/libs/highlight.service.js';
import type { HighlightRepository } from '../../../src/repositories/highlight.repository.interface.js';
import type { Highlight } from '../../../src/types.js';

const createRepositoryMock = (): jest.Mocked<HighlightRepository> => ({
  getByJobId: jest.fn(),
  getById: jest.fn(),
  update: jest.fn(),
});

const baseHighlight: Highlight = {
  highlightId: 'h1',
  jobId: 'job-1',
  order: 1,
  startSec: 10,
  endSec: 20,
  source: 'motion',
  status: 'unconfirmed',
  clipStatus: 'PENDING',
};

describe('HighlightService', () => {
  it('jobId で見どころ一覧を取得する', async () => {
    const repository = createRepositoryMock();
    const service = new HighlightService(repository);
    repository.getByJobId.mockResolvedValue([baseHighlight]);

    const result = await service.getHighlights('job-1');

    expect(result).toEqual([baseHighlight]);
    expect(repository.getByJobId).toHaveBeenCalledWith('job-1');
  });

  it('更新項目が空の場合はエラー', async () => {
    const repository = createRepositoryMock();
    const service = new HighlightService(repository);

    await expect(service.updateHighlight('job-1', 'h1', {})).rejects.toThrow(
      '更新内容が指定されていません'
    );
  });

  it('開始時刻が負数の場合はエラー', async () => {
    const repository = createRepositoryMock();
    const service = new HighlightService(repository);

    await expect(service.updateHighlight('job-1', 'h1', { startSec: -1 })).rejects.toThrow(
      '開始時刻と終了時刻は0以上で指定してください'
    );
  });

  it('見どころが存在しない場合はエラー', async () => {
    const repository = createRepositoryMock();
    const service = new HighlightService(repository);
    repository.getById.mockResolvedValue(null);

    await expect(service.updateHighlight('job-1', 'h1', { status: 'accepted' })).rejects.toThrow(
      '見どころが見つかりません'
    );
  });

  it('更新後の開始時刻が終了時刻以上の場合はエラー', async () => {
    const repository = createRepositoryMock();
    const service = new HighlightService(repository);
    repository.getById.mockResolvedValue(baseHighlight);

    await expect(service.updateHighlight('job-1', 'h1', { startSec: 30 })).rejects.toThrow(
      '開始時刻は終了時刻より小さくしてください'
    );
  });

  it('見どころを更新して返す', async () => {
    const repository = createRepositoryMock();
    const service = new HighlightService(repository);
    const updated: Highlight = {
      ...baseHighlight,
      startSec: 11,
      endSec: 21,
      status: 'accepted',
    };

    repository.getById.mockResolvedValue(baseHighlight);
    repository.update.mockResolvedValue(updated);

    const result = await service.updateHighlight('job-1', 'h1', {
      startSec: 11,
      endSec: 21,
      status: 'accepted',
    });

    expect(repository.update).toHaveBeenCalledWith('job-1', 'h1', {
      startSec: 11,
      endSec: 21,
      status: 'accepted',
    });
    expect(result).toEqual(updated);
  });

  it('clipStatus のみでも更新できる', async () => {
    const repository = createRepositoryMock();
    const service = new HighlightService(repository);
    const updated: Highlight = {
      ...baseHighlight,
      clipStatus: 'GENERATING',
    };
    repository.getById.mockResolvedValue(baseHighlight);
    repository.update.mockResolvedValue(updated);

    const result = await service.updateHighlight('job-1', 'h1', {
      clipStatus: 'GENERATING',
    });

    expect(repository.update).toHaveBeenCalledWith('job-1', 'h1', {
      clipStatus: 'GENERATING',
    });
    expect(result).toEqual(updated);
  });
});
