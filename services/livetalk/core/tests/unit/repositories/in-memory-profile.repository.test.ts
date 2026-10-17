import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryProfileRepository } from '../../../src/repositories/in-memory-profile.repository.js';
import type { UserConsents } from '../../../src/entities/profile.entity.js';

describe('InMemoryProfileRepository', () => {
  let store: InMemorySingleTableStore;
  let repo: InMemoryProfileRepository;
  const baseNow = 1_700_000_000_000;
  let now = baseNow;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = baseNow;
    repo = new InMemoryProfileRepository(store, () => now);
  });

  it('nowMs を省略した場合は Date.now が使われる', async () => {
    const localStore = new InMemorySingleTableStore();
    const repo = new InMemoryProfileRepository(localStore);
    const before = Date.now();
    const result = await repo.upsert({ userId: 'u1' });
    expect(result.createdAt).toBeGreaterThanOrEqual(before);
  });

  it('初回 upsert で新規作成され、LastActiveAt 未指定なら現在時刻が入る', async () => {
    const first = await repo.upsert({ userId: 'u1' });
    expect(first.userId).toBe('u1');
    expect(first.createdAt).toBe(baseNow);
    expect(first.updatedAt).toBe(baseNow);
    expect(first.lastActiveAt).toBe(baseNow);
  });

  it('再 upsert は CreatedAt を保持し UpdatedAt / LastActiveAt のみ更新する', async () => {
    await repo.upsert({ userId: 'u1', lastActiveAt: baseNow });

    now += 1000;
    const updated = await repo.upsert({ userId: 'u1' }, { lastActiveAt: now });

    expect(updated.createdAt).toBe(baseNow);
    expect(updated.updatedAt).toBe(baseNow + 1000);
    expect(updated.lastActiveAt).toBe(baseNow + 1000);
  });

  it('getById は未登録なら null を返す', async () => {
    expect(await repo.getById({ userId: 'unknown' })).toBeNull();
  });

  it('getById は登録済みデータを返す', async () => {
    await repo.upsert({ userId: 'u1' });
    const got = await repo.getById({ userId: 'u1' });
    expect(got?.userId).toBe('u1');
    expect(got?.lastActiveAt).toBe(baseNow);
  });

  it('Auth 側情報を渡さなくても upsert が成立する（PII は LiveTalk に持ち込まない）', async () => {
    const result = await repo.upsert({ userId: 'u1' });
    // 余計な属性がリポジトリ側で勝手に生成されていないこと
    expect(Object.keys(result).sort()).toEqual(
      ['createdAt', 'lastActiveAt', 'updatedAt', 'userId'].sort()
    );
  });

  it('初回 upsert で Consents が undefined のまま保存される', async () => {
    const result = await repo.upsert({ userId: 'u2' });
    expect(result.consents).toBeUndefined();
  });

  it('upsert で Consents を更新できる', async () => {
    await repo.upsert({ userId: 'u3' });
    const consents: UserConsents = {
      termsAgreed: { version: '1.0.0', agreedAt: baseNow + 1 },
      privacyAgreed: { version: '1.0.0', agreedAt: baseNow + 2 },
      ageVerified: { value: true, verifiedAt: baseNow + 3 },
    };
    const updated = await repo.upsert({ userId: 'u3' }, { consents });
    expect(updated.consents).toEqual(consents);
  });

  describe('listAllUserIds', () => {
    it('upsert した複数ユーザーが全件返る', async () => {
      await repo.upsert({ userId: 'user-a' });
      await repo.upsert({ userId: 'user-b' });
      await repo.upsert({ userId: 'user-c' });

      const result = await repo.listAllUserIds();

      expect(result.sort()).toEqual(['user-a', 'user-b', 'user-c']);
    });

    it('ユーザーが 0 件のとき空配列を返す', async () => {
      const result = await repo.listAllUserIds();
      expect(result).toEqual([]);
    });

    it('upsert したユーザーの UserID（生の ID）が返る（USER# プレフィックスなし）', async () => {
      await repo.upsert({ userId: 'google-xyz' });
      const result = await repo.listAllUserIds();
      expect(result).toContain('google-xyz');
      expect(result.some((id) => id.startsWith('USER#'))).toBe(false);
    });
  });
  describe('保存形式', () => {
    it('保存する属性は PascalCase で、GSI1 とネストした Consents も保存の形になる', async () => {
      await repo.upsert(
        { userId: 'u1' },
        { consents: { ageVerified: { value: true, verifiedAt: baseNow + 1 } } }
      );

      expect(store.get('USER#u1', 'PROFILE')).toEqual({
        PK: 'USER#u1',
        SK: 'PROFILE',
        Type: 'Profile',
        UserID: 'u1',
        LastActiveAt: baseNow,
        CreatedAt: baseNow,
        UpdatedAt: baseNow,
        GSI1PK: 'PROFILE',
        GSI1SK: 'u1',
        Consents: { AgeVerified: { Value: true, VerifiedAt: baseNow + 1 } },
      });
    });

    it('時刻がエポック秒で保存された旧データも読め、次の upsert でミリ秒に置き換わる', async () => {
      const legacySeconds = (baseNow - 5000) / 1000;
      store.put({
        PK: 'USER#u1',
        SK: 'PROFILE',
        Type: 'Profile',
        UserID: 'u1',
        LastActiveAt: legacySeconds,
        CreatedAt: legacySeconds,
        UpdatedAt: legacySeconds,
        GSI1PK: 'PROFILE',
        GSI1SK: 'u1',
      });

      expect((await repo.getById({ userId: 'u1' }))?.createdAt).toBe(baseNow - 5000);

      await repo.upsert({ userId: 'u1' });

      expect(store.get('USER#u1', 'PROFILE')).toMatchObject({
        CreatedAt: baseNow - 5000,
        UpdatedAt: baseNow,
      });
    });
  });
});
