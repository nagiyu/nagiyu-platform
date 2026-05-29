import { applyCorrection, executePromotion } from '../../../src/memory/promotion.js';
import type { MemoryRepository } from '../../../src/repositories/memory.repository.interface.js';
import type { MemoryEntity } from '../../../src/entities/memory.entity.js';
import type { CorrectionResult } from '../../../src/memory/correction-detector.js';
import {
  CORRECTION_CONFIDENCE_PENALTY,
  MEMORY_AUTO_DELETE_THRESHOLD,
} from '../../../src/constants.js';

const FIXED_NOW = 1_750_000_000_000;

function makeMemory(
  id: string,
  confidence: number,
  tier: MemoryEntity['Tier'] = 'B'
): MemoryEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    MemoryID: id,
    Tier: tier,
    Category: 'food',
    Content: 'コーヒーが好き',
    Confidence: confidence,
    ReferencedCount: 2,
    CreatedAt: FIXED_NOW - 100000,
    UpdatedAt: FIXED_NOW - 10000,
  };
}

function makeRepo(overrides: Partial<MemoryRepository> = {}): MemoryRepository {
  return {
    put: jest.fn(),
    get: jest.fn(),
    listByTier: jest.fn(),
    listByCategory: jest.fn(),
    update: jest.fn(async (input) => ({ ...makeMemory(input.MemoryID, input.Confidence ?? 0.5) })),
    delete: jest.fn(async () => {}),
    promote: jest.fn(async (mem) => ({ ...mem, Tier: 'B' as const })),
    demote: jest.fn(),
    ...overrides,
  } as unknown as MemoryRepository;
}

describe('applyCorrection', () => {
  describe('detected: false', () => {
    it('detected が false なら何もしない', async () => {
      const repo = makeRepo();
      const correction: CorrectionResult = { detected: false, targetMemories: [] };
      await applyCorrection(correction, repo);
      expect(repo.update).not.toHaveBeenCalled();
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('targetMemories が空なら何もしない', async () => {
      const repo = makeRepo();
      const correction: CorrectionResult = { detected: true, targetMemories: [] };
      await applyCorrection(correction, repo);
      expect(repo.update).not.toHaveBeenCalled();
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('confidence 減算', () => {
    it(`confidence を ${CORRECTION_CONFIDENCE_PENALTY} 減算する`, async () => {
      const mem = makeMemory('m1', 0.8);
      const repo = makeRepo();
      await applyCorrection({ detected: true, targetMemories: [mem] }, repo);
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          MemoryID: 'm1',
          Confidence: 0.8 - CORRECTION_CONFIDENCE_PENALTY,
        })
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('newValue がある場合は Content も更新する', async () => {
      const mem = makeMemory('m1', 0.8);
      const repo = makeRepo();
      await applyCorrection(
        { detected: true, targetMemories: [mem], newValue: 'お茶が好き' },
        repo
      );
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          MemoryID: 'm1',
          Content: 'お茶が好き',
        })
      );
    });

    it('newValue がない場合は Content を更新しない', async () => {
      const mem = makeMemory('m1', 0.8);
      const repo = makeRepo();
      await applyCorrection({ detected: true, targetMemories: [mem] }, repo);
      const call = (repo.update as jest.Mock).mock.calls[0][0];
      expect(call.Content).toBeUndefined();
    });

    it('複数の Memory を並行して処理する', async () => {
      const mems = [makeMemory('m1', 0.8), makeMemory('m2', 0.7)];
      const repo = makeRepo();
      await applyCorrection({ detected: true, targetMemories: mems }, repo);
      expect(repo.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('自動削除（threshold 割れ）', () => {
    it(`confidence が ${MEMORY_AUTO_DELETE_THRESHOLD} 未満になる場合は削除する`, async () => {
      const threshold = MEMORY_AUTO_DELETE_THRESHOLD;
      const confidence = threshold + CORRECTION_CONFIDENCE_PENALTY - 0.01; // 減算後に threshold 未満
      const mem = makeMemory('m1', confidence);
      const repo = makeRepo();
      await applyCorrection({ detected: true, targetMemories: [mem] }, repo);
      expect(repo.delete).toHaveBeenCalledWith(
        expect.objectContaining({ memoryId: 'm1' })
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('confidence が 0.0 以下にならない（負にならない）', async () => {
      // confidence が既に 0.1 → 減算後に 0 未満になるが、Math.max(0, ...) で 0 になる
      const mem = makeMemory('m1', 0.1);
      const repo = makeRepo();
      // 0.1 - 0.3 = -0.2 → Math.max(0, -0.2) = 0 < threshold → 削除される
      await applyCorrection({ detected: true, targetMemories: [mem] }, repo);
      expect(repo.delete).toHaveBeenCalled();
    });
  });

  describe('エラーハンドリング', () => {
    it('update がエラーを投げても他の Memory の処理を続ける（fail-warn）', async () => {
      const mems = [makeMemory('m1', 0.8), makeMemory('m2', 0.8)];
      const repo = makeRepo({
        update: jest.fn()
          .mockRejectedValueOnce(new Error('DB error'))
          .mockResolvedValueOnce(makeMemory('m2', 0.5)),
      });
      await expect(applyCorrection({ detected: true, targetMemories: mems }, repo)).resolves.not.toThrow();
    });

    it('delete がエラーを投げても fail-warn で継続する', async () => {
      const mem = makeMemory('m1', 0.1); // 確実に削除対象
      const repo = makeRepo({
        delete: jest.fn(async () => { throw new Error('DB error'); }),
      });
      await expect(applyCorrection({ detected: true, targetMemories: [mem] }, repo)).resolves.not.toThrow();
    });
  });
});

describe('executePromotion', () => {
  it('昇格候補が空なら何もしない', async () => {
    const repo = makeRepo();
    await executePromotion([], repo);
    expect(repo.promote).not.toHaveBeenCalled();
  });

  it('Tier C → B に昇格する', async () => {
    const mem = makeMemory('c1', 0.5, 'C');
    const repo = makeRepo();
    await executePromotion([mem], repo);
    expect(repo.promote).toHaveBeenCalledWith(mem, 'B');
  });

  it('複数 Memory を並行して昇格する', async () => {
    const mems = [makeMemory('c1', 0.5, 'C'), makeMemory('c2', 0.6, 'C')];
    const repo = makeRepo();
    await executePromotion(mems, repo);
    expect(repo.promote).toHaveBeenCalledTimes(2);
  });

  it('promote がエラーを投げても fail-warn で継続する', async () => {
    const mems = [makeMemory('c1', 0.5, 'C'), makeMemory('c2', 0.6, 'C')];
    const repo = makeRepo({
      promote: jest.fn()
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ ...mems[1], Tier: 'B' }),
    });
    await expect(executePromotion(mems, repo)).resolves.not.toThrow();
    expect(repo.promote).toHaveBeenCalledTimes(2);
  });
});
