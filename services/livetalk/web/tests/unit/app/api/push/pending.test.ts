/**
 * @jest-environment node
 */
/**
 * GET /api/push/pending のユニットテスト。
 *
 * Phase C 追加 API:
 *   - 未消化通知をキャラクターごとに集約し、各キャラ最新 1 件を返す
 *   - 未消化なしの場合は空配列を返す
 *   - consume 済みはスキップする
 */
import { GET } from '@/app/api/push/pending/route';
import { getSession } from '@/lib/server/session';
import { getNotificationEventRepository } from '@/lib/server/repositories';
import type { NotificationEventEntity, NotificationEventRepository } from '@nagiyu/livetalk-core';

jest.mock('@/lib/server/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/lib/server/repositories', () => ({
  getNotificationEventRepository: jest.fn(),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetNotificationEventRepo = getNotificationEventRepository as jest.MockedFunction<
  typeof getNotificationEventRepository
>;

/** テスト用有効セッション */
const validSession = {
  user: {
    userId: 'u1',
    googleId: 'g1',
    email: 'u@example.com',
    name: 'U',
    roles: ['livetalk-user'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  expires: new Date(Date.now() + 60 * 1000).toISOString(),
};

/** 通知イベントエンティティのファクトリ */
function makeEvent(overrides: Partial<NotificationEventEntity> = {}): NotificationEventEntity {
  return {
    UserID: 'g1',
    NotifID: 'n1',
    CharacterID: 'hiyori',
    Kind: 'normal',
    Title: 'ひよりより',
    Body: 'テスト本文',
    KnowledgeID: undefined,
    ConsumedAt: undefined,
    CreatedAt: Date.now(),
    Ttl: Date.now() + 30 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

/** リポジトリモックのファクトリ */
function makeRepo(events: NotificationEventEntity[]): NotificationEventRepository {
  return {
    listByUser: jest.fn(async () => events),
    put: jest.fn(),
    get: jest.fn(),
    markConsumed: jest.fn(),
  } as unknown as NotificationEventRepository;
}

/** GET リクエストを組み立てるヘルパー */
function buildGetRequest(): Request {
  return new Request('http://localhost/api/push/pending', { method: 'GET' });
}

describe('GET /api/push/pending', () => {
  beforeEach(() => jest.clearAllMocks());

  it('未認証は 401 を返す', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(401);
  });

  it('未消化通知がない場合は空配列を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    mockGetNotificationEventRepo.mockReturnValue(makeRepo([]));

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('全通知が消化済みの場合は空配列を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const consumedEvent = makeEvent({
      CharacterID: 'hiyori',
      ConsumedAt: Date.now() - 1000,
    });
    mockGetNotificationEventRepo.mockReturnValue(makeRepo([consumedEvent]));

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('キャラクターごとに最新未消化通知 1 件を集約して返す', async () => {
    mockGetSession.mockResolvedValue(validSession);

    // hiyori: 2 件の未消化（降順なので n-hiyori-1 が最新）
    const hiyoriEvent1 = makeEvent({
      NotifID: 'n-hiyori-1',
      CharacterID: 'hiyori',
      Body: 'ひよりの最新本文',
    });
    const hiyoriEvent2 = makeEvent({
      NotifID: 'n-hiyori-2',
      CharacterID: 'hiyori',
      Body: 'ひよりの古い本文',
    });
    // ageha: 1 件の未消化
    const agehaEvent = makeEvent({
      NotifID: 'n-ageha',
      CharacterID: 'ageha',
      Body: 'アゲハの本文',
    });

    // listByUser は CreatedAt 降順で返す（最新が先頭）
    mockGetNotificationEventRepo.mockReturnValue(
      makeRepo([hiyoriEvent1, agehaEvent, hiyoriEvent2])
    );

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();

    // 2 キャラ分のエントリが返る
    expect(json).toHaveLength(2);

    // hiyori の最新（n-hiyori-1）が含まれる
    const hiyoriResult = json.find(
      (item: { characterId: string }) => item.characterId === 'hiyori'
    );
    expect(hiyoriResult).toBeDefined();
    expect(hiyoriResult.notifId).toBe('n-hiyori-1');
    expect(hiyoriResult.body).toBe('ひよりの最新本文');

    // ageha のエントリが含まれる
    const agehaResult = json.find((item: { characterId: string }) => item.characterId === 'ageha');
    expect(agehaResult).toBeDefined();
    expect(agehaResult.notifId).toBe('n-ageha');
  });

  it('消化済みと未消化が混在する場合、未消化のみ集約する', async () => {
    mockGetSession.mockResolvedValue(validSession);

    // hiyori: 消化済みが先頭（最新）、未消化が 2 番目
    const consumedEvent = makeEvent({
      NotifID: 'n-consumed',
      CharacterID: 'hiyori',
      ConsumedAt: Date.now() - 500,
    });
    const unconsumedEvent = makeEvent({
      NotifID: 'n-unconsumed',
      CharacterID: 'hiyori',
      Body: '未消化の本文',
    });

    mockGetNotificationEventRepo.mockReturnValue(makeRepo([consumedEvent, unconsumedEvent]));

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();

    // 未消化のみが集約される
    expect(json).toHaveLength(1);
    expect(json[0].notifId).toBe('n-unconsumed');
  });

  it('レスポンスの各エントリに characterId, notifId, body が含まれる', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const event = makeEvent({
      NotifID: 'n1',
      CharacterID: 'hiyori',
      Body: '本文テスト',
    });
    mockGetNotificationEventRepo.mockReturnValue(makeRepo([event]));

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json[0]).toMatchObject({
      characterId: 'hiyori',
      notifId: 'n1',
      body: '本文テスト',
    });
  });

  it('複数キャラクター全員未消化の場合、全キャラ分を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const hiyoriEvent = makeEvent({ NotifID: 'n-h', CharacterID: 'hiyori' });
    const agehaEvent = makeEvent({ NotifID: 'n-a', CharacterID: 'ageha' });
    mockGetNotificationEventRepo.mockReturnValue(makeRepo([hiyoriEvent, agehaEvent]));

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);

    const characterIds = json.map((item: { characterId: string }) => item.characterId);
    expect(characterIds).toContain('hiyori');
    expect(characterIds).toContain('ageha');
  });
});
