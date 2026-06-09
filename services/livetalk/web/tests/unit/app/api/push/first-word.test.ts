/**
 * @jest-environment node
 */
/**
 * GET /api/push/first-word のユニットテスト。
 *
 * Phase C 追加仕様:
 *   - ?characterId=<id> クエリで指定キャラクターの未消化最新を返す
 *   - レスポンスに characterId を含む
 *   - characterId 未指定時は 204 を返す
 *   - 未消化なし（全消化済み）の場合は 204 を返す
 */
import { GET } from '@/app/api/push/first-word/route';
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
function buildGetRequest(characterId?: string): Request {
  const url = characterId
    ? `http://localhost/api/push/first-word?characterId=${encodeURIComponent(characterId)}`
    : 'http://localhost/api/push/first-word';
  return new Request(url, { method: 'GET' });
}

describe('GET /api/push/first-word', () => {
  beforeEach(() => jest.clearAllMocks());

  it('未認証は 401 を返す', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await GET(buildGetRequest('hiyori'));
    expect(res.status).toBe(401);
  });

  it('characterId 未指定時は 204 を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    // characterId なしで呼ぶ（呼び出し側は常に characterId を付ける設計）
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(204);
  });

  it('指定キャラクターの未消化最新通知を返す（characterId フィルタ）', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const hiyoriEvent = makeEvent({
      NotifID: 'n-hiyori',
      CharacterID: 'hiyori',
      Body: 'ひよりの本文',
      KnowledgeID: 'k-hiyori',
    });
    const agehaEvent = makeEvent({
      NotifID: 'n-ageha',
      CharacterID: 'ageha',
      Body: 'アゲハの本文',
    });
    // listByUser は降順で返すため、最初が最新
    mockGetNotificationEventRepo.mockReturnValue(makeRepo([hiyoriEvent, agehaEvent]));

    const res = await GET(buildGetRequest('hiyori'));
    expect(res.status).toBe(200);

    const json = await res.json();
    // hiyori の通知が返る
    expect(json.notifId).toBe('n-hiyori');
    expect(json.body).toBe('ひよりの本文');
    expect(json.knowledgeId).toBe('k-hiyori');
    // レスポンスに characterId が含まれる（クロス汚染防止のため）
    expect(json.characterId).toBe('hiyori');
  });

  it('他キャラクター(ageha)のみ未消化の場合、hiyori を指定すると 204 を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const agehaEvent = makeEvent({
      NotifID: 'n-ageha',
      CharacterID: 'ageha',
      Body: 'アゲハの本文',
    });
    mockGetNotificationEventRepo.mockReturnValue(makeRepo([agehaEvent]));

    const res = await GET(buildGetRequest('hiyori'));
    expect(res.status).toBe(204);
  });

  it('全通知が消化済みの場合は 204 を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const consumedEvent = makeEvent({
      CharacterID: 'hiyori',
      ConsumedAt: Date.now() - 1000,
    });
    mockGetNotificationEventRepo.mockReturnValue(makeRepo([consumedEvent]));

    const res = await GET(buildGetRequest('hiyori'));
    expect(res.status).toBe(204);
  });

  it('通知がない場合は 204 を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    mockGetNotificationEventRepo.mockReturnValue(makeRepo([]));

    const res = await GET(buildGetRequest('hiyori'));
    expect(res.status).toBe(204);
  });

  it('knowledgeId がない通知の場合、レスポンスの knowledgeId は null になる', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const event = makeEvent({
      CharacterID: 'hiyori',
      KnowledgeID: undefined,
    });
    mockGetNotificationEventRepo.mockReturnValue(makeRepo([event]));

    const res = await GET(buildGetRequest('hiyori'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.knowledgeId).toBeNull();
  });

  it('消化済みと未消化が混在する場合、未消化の最新を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    // 降順: 最新が先頭（消化済み）、次が未消化
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

    const res = await GET(buildGetRequest('hiyori'));
    expect(res.status).toBe(200);
    const json = await res.json();
    // 消化済みをスキップして未消化を返す
    expect(json.notifId).toBe('n-unconsumed');
    expect(json.body).toBe('未消化の本文');
  });

  it('ageha 指定時は ageha の未消化通知を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const agehaEvent = makeEvent({
      NotifID: 'n-ageha',
      CharacterID: 'ageha',
      Body: 'アゲハの本文',
    });
    mockGetNotificationEventRepo.mockReturnValue(makeRepo([agehaEvent]));

    const res = await GET(buildGetRequest('ageha'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notifId).toBe('n-ageha');
    expect(json.characterId).toBe('ageha');
  });
});
