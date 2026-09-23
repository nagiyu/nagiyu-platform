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
    UserID: 'u1',
    CharacterID: 'hiyori',
    Query: 'コーヒー 効能',
    RawText: 'コーヒーには覚醒効果があります。',
    SourceUrls: ['https://example.com'],
    Origin: 'auto',
    ...overrides,
  });

  describe('put', () => {
    it('新規作成でき、TTL を 90 日後に設定する', async () => {
      const raw = await repo.put(makeInput());
      expect(raw.RawID).toBe('RAW-FIXED');
      expect(raw.CreatedAt).toBe(baseNow);

      const { pk, sk } = { pk: 'USER#u1', sk: 'CHAR#hiyori#WEBRAW#RAW-FIXED' };
      const item = store.get(pk, sk);
      expect(item?.TTL).toBe(Math.floor(baseNow / 1000) + WEBRAW_TTL_SECONDS);
    });

    it('明示的な RawID を尊重する', async () => {
      const raw = await repo.put(makeInput({ RawID: 'custom-raw' }));
      expect(raw.RawID).toBe('custom-raw');
    });
  });

  describe('listSince', () => {
    it('sinceMs=0 の場合は全件を時系列昇順で返す', async () => {
      await repo.put(makeInput({ RawID: 'raw-1' }));
      now += 1000;
      await repo.put(makeInput({ RawID: 'raw-2' }));

      const result = await repo.listSince('u1', 'hiyori', 0);
      expect(result.map((r) => r.RawID)).toEqual(['raw-1', 'raw-2']);
    });

    it('sinceMs 以降（exclusive）のみ返す', async () => {
      await repo.put(makeInput({ RawID: 'raw-old' }));
      const threshold = now;
      now += 1000;
      await repo.put(makeInput({ RawID: 'raw-new' }));

      const result = await repo.listSince('u1', 'hiyori', threshold);
      expect(result).toHaveLength(1);
      expect(result[0].RawID).toBe('raw-new');
    });

    it('別キャラの WebRaw は含まない', async () => {
      await repo.put(makeInput({ RawID: 'raw-hiyori', CharacterID: 'hiyori' }));
      await repo.put(makeInput({ RawID: 'raw-ageha', CharacterID: 'ageha' }));

      const result = await repo.listSince('u1', 'hiyori', 0);
      expect(result).toHaveLength(1);
      expect(result[0].RawID).toBe('raw-hiyori');
    });

    it('0 件の場合は空配列を返す', async () => {
      const result = await repo.listSince('u1', 'hiyori', 0);
      expect(result).toEqual([]);
    });

    it('Origin/RequestText/RequestedAt が put → listSince で保持される（甲-1）', async () => {
      await repo.put(
        makeInput({
          RawID: 'raw-request',
          Origin: 'request',
          RequestText: '最新アニメ情報を調べて',
          RequestedAt: baseNow - 1000,
        })
      );

      const result = await repo.listSince('u1', 'hiyori', 0);
      expect(result).toHaveLength(1);
      expect(result[0].Origin).toBe('request');
      expect(result[0].RequestText).toBe('最新アニメ情報を調べて');
      expect(result[0].RequestedAt).toBe(baseNow - 1000);
    });
  });
});
