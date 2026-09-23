/**
 * @jest-environment node
 */
/**
 * GET /api/push/pending のユニットテスト。
 *
 * ルートは listLatestUnconsumedByCharacter によりキャラごとの最新未消化通知を集約する。
 * - 未消化通知をキャラクターごとに集約し、各キャラ最新 1 件を返す
 * - 未消化なしの場合は空配列を返す
 * - 100 件を超える履歴があっても未消化通知を取りこぼさない
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
    ConsumedAt: undefined,
    CreatedAt: Date.now(),
    Ttl: Date.now() + 30 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

/**
 * リポジトリモックのファクトリ。
 * ルートは listLatestUnconsumedByCharacter を呼ぶため、
 * 集約済みの結果（各キャラ最新未消化 1 件）を直接返すモックを使う。
 */
function makeRepo(aggregatedResult: NotificationEventEntity[]): NotificationEventRepository {
  return {
    listLatestUnconsumedByCharacter: jest.fn(async () => aggregatedResult),
    listByUser: jest.fn(),
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

  it('キャラクターごとに最新未消化通知 1 件を集約して返す', async () => {
    mockGetSession.mockResolvedValue(validSession);

    // 集約済み結果（各キャラの最新未消化 1 件）
    const hiyoriEvent = makeEvent({
      NotifID: 'n-hiyori-1',
      CharacterID: 'hiyori',
      Body: 'ひよりの最新本文',
    });
    const agehaEvent = makeEvent({
      NotifID: 'n-ageha',
      CharacterID: 'ageha',
      Body: 'アゲハの本文',
    });

    mockGetNotificationEventRepo.mockReturnValue(makeRepo([hiyoriEvent, agehaEvent]));

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();

    // 2 キャラ分のエントリが返る
    expect(json).toHaveLength(2);

    // hiyori のエントリが含まれる
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

  it('listLatestUnconsumedByCharacter に getAllCharacterIds の結果が渡される', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const repo = makeRepo([]);
    mockGetNotificationEventRepo.mockReturnValue(repo);

    await GET(buildGetRequest());

    // getAllCharacterIds() の戻り値（hiyori, ageha）が渡されること
    expect(repo.listLatestUnconsumedByCharacter).toHaveBeenCalledWith(
      'g1',
      expect.arrayContaining(['hiyori', 'ageha'])
    );
  });

  it('100 件を超える履歴があっても未消化通知を取りこぼさない（ページング委譲確認）', async () => {
    mockGetSession.mockResolvedValue(validSession);

    // 100 件より後ろにある未消化通知がリポジトリ層で拾われ、集約済み結果として返るシナリオ
    const lateUnconsumed = makeEvent({
      NotifID: 'n-late-unconsumed',
      CharacterID: 'hiyori',
      Body: '101 件目の未消化通知',
    });
    mockGetNotificationEventRepo.mockReturnValue(makeRepo([lateUnconsumed]));

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();

    // リポジトリ層でページングを処理した結果が正しく返る
    expect(json).toHaveLength(1);
    expect(json[0].notifId).toBe('n-late-unconsumed');
    expect(json[0].body).toBe('101 件目の未消化通知');
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
