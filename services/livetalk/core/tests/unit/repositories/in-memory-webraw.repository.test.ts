import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryWebRawRepository } from '../../../src/repositories/in-memory-webraw.repository.js';
import { WEBRAW_TTL_SECONDS } from '../../../src/constants.js';
import type { CreateWebRawInput } from '../../../src/entities/webraw.entity.js';

describe('InMemoryWebRawRepository', () => {
  const baseNow = 1_700_000_000_000;
  let now = baseNow;
  let store: InMemorySingleTableStore;
  let repo: InMemoryWebRawRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = baseNow;
    repo = new InMemoryWebRawRepository(
      store,
      () => 'RAW-FIXED',
      () => now
    );
  });

  const makeInput = (overrides: Partial<CreateWebRawInput> = {}): CreateWebRawInput => ({
    userId: 'u1',
    characterId: 'hiyori',
    query: 'コーヒー 効能',
    rawText: 'コーヒーには覚醒効果があります。',
    sourceUrls: ['https://example.com'],
    origin: 'auto',
    ...overrides,
  });

  describe('put', () => {
    it('新規作成でき、TTL を 90 日後に設定する', async () => {
      const raw = await repo.put(makeInput());
      expect(raw.rawId).toBe('RAW-FIXED');
      expect(raw.createdAt).toBe(baseNow);

      const { pk, sk } = { pk: 'USER#u1', sk: 'CHAR#hiyori#WEBRAW#RAW-FIXED' };
      const item = store.get(pk, sk);
      expect(item?.TTL).toBe(Math.floor(baseNow / 1000) + WEBRAW_TTL_SECONDS);
    });

    it('expiresAt を作成から 90 日後 (ミリ秒) で返す', async () => {
      const raw = await repo.put(makeInput());
      expect(raw.expiresAt).toBe(baseNow + WEBRAW_TTL_SECONDS * 1000);
    });

    it('明示的な rawId を尊重する', async () => {
      const raw = await repo.put(makeInput({ rawId: 'custom-raw' }));
      expect(raw.rawId).toBe('custom-raw');
    });
  });

  describe('listSince', () => {
    it('sinceMs=0 の場合は全件を時系列昇順で返す', async () => {
      await repo.put(makeInput({ rawId: 'raw-1' }));
      now += 1000;
      await repo.put(makeInput({ rawId: 'raw-2' }));

      const result = await repo.listSince('u1', 'hiyori', 0);
      expect(result.map((r) => r.rawId)).toEqual(['raw-1', 'raw-2']);
    });

    it('sinceMs 以降（exclusive）のみ返す', async () => {
      await repo.put(makeInput({ rawId: 'raw-old' }));
      const threshold = now;
      now += 1000;
      await repo.put(makeInput({ rawId: 'raw-new' }));

      const result = await repo.listSince('u1', 'hiyori', threshold);
      expect(result).toHaveLength(1);
      expect(result[0].rawId).toBe('raw-new');
    });

    it('別キャラの WebRaw は含まない', async () => {
      await repo.put(makeInput({ rawId: 'raw-hiyori', characterId: 'hiyori' }));
      await repo.put(makeInput({ rawId: 'raw-ageha', characterId: 'ageha' }));

      const result = await repo.listSince('u1', 'hiyori', 0);
      expect(result).toHaveLength(1);
      expect(result[0].rawId).toBe('raw-hiyori');
    });

    it('0 件の場合は空配列を返す', async () => {
      const result = await repo.listSince('u1', 'hiyori', 0);
      expect(result).toEqual([]);
    });

    it('origin/requestText/requestedAt が put → listSince で保持される', async () => {
      await repo.put(
        makeInput({
          rawId: 'raw-request',
          origin: 'request',
          requestText: '最新アニメ情報を調べて',
          requestedAt: baseNow - 1000,
        })
      );

      const result = await repo.listSince('u1', 'hiyori', 0);
      expect(result).toHaveLength(1);
      expect(result[0].origin).toBe('request');
      expect(result[0].requestText).toBe('最新アニメ情報を調べて');
      expect(result[0].requestedAt).toBe(baseNow - 1000);
    });
  });
});
