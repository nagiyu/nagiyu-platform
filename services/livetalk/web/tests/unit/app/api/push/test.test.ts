/**
 * @jest-environment node
 */
/**
 * POST /api/push/test のユニットテスト（Issue #3491）。
 *
 * テスト観点:
 *   - 非 admin（未認証・livetalk:admin 権限なし）は withAuth で弾かれる
 *   - 不正 / 欠落 characterId → 400
 *   - 購読 0 件 → 200 `{ sent: 0 }`、push 未送信・NotificationEvent 未記録
 *   - 正常系 → 各サブスクへ送信、payload に data.characterId / data.url が入る、
 *     成功時 NotificationEvent が CharacterID 付きで記録、`{ sent }` を返す
 *   - 無効サブスク（false 戻り）→ delete される
 */
import { POST } from '@/app/api/push/test/route';
import { getSession } from '@/lib/server/session';
import {
  getPushSubscriptionRepository,
  getNotificationEventRepository,
} from '@/lib/server/repositories';
import { sendWebPushNotification } from '@nagiyu/common/push';
import { hasCharacter, getCharacterDefinition } from '@/lib/characters/registry';
import type {
  PushSubscriptionRepository,
  NotificationEventRepository,
  PushSubscriptionEntity,
} from '@nagiyu/livetalk-core';

// ---- モック設定 -------------------------------------------------------

jest.mock('@/lib/server/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/lib/server/repositories', () => ({
  getPushSubscriptionRepository: jest.fn(),
  getNotificationEventRepository: jest.fn(),
}));

jest.mock('@nagiyu/common/push', () => ({
  sendWebPushNotification: jest.fn(),
  getVapidConfig: jest.fn(() => ({
    publicKey: 'test-public-key',
    privateKey: 'test-private-key',
    subject: 'mailto:test@example.com',
  })),
}));

jest.mock('@/lib/characters/registry', () => ({
  hasCharacter: jest.fn(),
  getCharacterDefinition: jest.fn(),
}));

// livetalk-core の defaultUlidFactory と NOTIFICATION_EVENT_TTL_SECONDS をモック化する
jest.mock('@nagiyu/livetalk-core', () => ({
  defaultUlidFactory: jest.fn(() => 'test-ulid'),
  NOTIFICATION_EVENT_TTL_SECONDS: 2592000,
}));

// ---- 型付きモック変数 ---------------------------------------------------

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetPushSubscriptionRepo = getPushSubscriptionRepository as jest.MockedFunction<
  typeof getPushSubscriptionRepository
>;
const mockGetNotifEventRepo = getNotificationEventRepository as jest.MockedFunction<
  typeof getNotificationEventRepository
>;
const mockSendWebPushNotification = sendWebPushNotification as jest.MockedFunction<
  typeof sendWebPushNotification
>;
const mockHasCharacter = hasCharacter as jest.MockedFunction<typeof hasCharacter>;
const mockGetCharacterDefinition = getCharacterDefinition as jest.MockedFunction<
  typeof getCharacterDefinition
>;

// ---- テスト用定数 -------------------------------------------------------

/** 非 admin セッション（livetalk:admin 権限なし） */
const livetalkUserSession = {
  user: {
    userId: 'u1',
    googleId: 'g1',
    email: 'user@example.com',
    name: 'User',
    roles: ['livetalk-user'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  expires: new Date(Date.now() + 60 * 1000).toISOString(),
};

/** admin セッション */
const adminSession = {
  user: {
    userId: 'u1',
    googleId: 'g1',
    email: 'admin@example.com',
    name: 'Admin',
    roles: ['livetalk-admin'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  expires: new Date(Date.now() + 60 * 1000).toISOString(),
};

/** サブスクリプションエンティティのファクトリ */
function makeSubscription(overrides: Partial<PushSubscriptionEntity> = {}): PushSubscriptionEntity {
  return {
    UserID: 'g1',
    SubscriptionID: 'sub-1',
    Endpoint: 'https://push.example.com/sub-1',
    P256dhKey: 'p256dh-key',
    AuthKey: 'auth-key',
    CreatedAt: Date.now(),
    ...overrides,
  };
}

/** PushSubscriptionRepository モックのファクトリ */
function makePushRepo(subscriptions: PushSubscriptionEntity[]): PushSubscriptionRepository {
  return {
    listByUser: jest.fn(async () => subscriptions),
    put: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  } as unknown as PushSubscriptionRepository;
}

/** NotificationEventRepository モックのファクトリ */
function makeNotifEventRepo(): NotificationEventRepository {
  return {
    put: jest.fn(),
    get: jest.fn(),
    listByUser: jest.fn(),
    markConsumed: jest.fn(),
  } as unknown as NotificationEventRepository;
}

/** POST リクエストを組み立てるヘルパー */
function buildPostRequest(body: unknown): Request {
  return new Request('http://localhost/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** hiyori のキャラクター定義モック */
const hiyoriDefinition = {
  id: 'hiyori',
  displayName: '桃瀬ひより',
  notificationName: 'ひより',
} as ReturnType<typeof getCharacterDefinition>;

// ---- テスト -------------------------------------------------------

describe('POST /api/push/test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // デフォルトでは hiyori が有効なキャラクターとして設定する
    mockHasCharacter.mockImplementation((id) => id === 'hiyori' || id === 'ageha');
    mockGetCharacterDefinition.mockReturnValue(hiyoriDefinition);
  });

  describe('認証・認可チェック', () => {
    it('未認証は 401 を返す', async () => {
      mockGetSession.mockResolvedValueOnce(null);
      const res = await POST(buildPostRequest({ characterId: 'hiyori' }));
      expect(res.status).toBe(401);
    });

    it('livetalk:admin 権限なし（livetalk-user のみ）は 403 を返す', async () => {
      mockGetSession.mockResolvedValueOnce(livetalkUserSession);
      const res = await POST(buildPostRequest({ characterId: 'hiyori' }));
      expect(res.status).toBe(403);
    });
  });

  describe('バリデーション（admin セッション前提）', () => {
    it('リクエストボディが不正な JSON → 400', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      const req = new Request('http://localhost/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json',
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('INVALID_REQUEST');
    });

    it('characterId が欠落 → 400', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      const res = await POST(buildPostRequest({}));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('INVALID_REQUEST');
      expect(json.message).toContain('characterId');
    });

    it('characterId が空文字列 → 400', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      const res = await POST(buildPostRequest({ characterId: '' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('INVALID_REQUEST');
    });

    it('未登録の characterId → 400', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockHasCharacter.mockReturnValue(false);
      const res = await POST(buildPostRequest({ characterId: 'unknown-char' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('UNKNOWN_CHARACTER');
    });
  });

  describe('購読 0 件の場合', () => {
    it('送信せずに 200 で { sent: 0, characterId } を返す', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      const pushRepo = makePushRepo([]);
      mockGetPushSubscriptionRepo.mockReturnValue(pushRepo);

      const res = await POST(buildPostRequest({ characterId: 'hiyori' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sent).toBe(0);
      expect(json.characterId).toBe('hiyori');
    });

    it('購読 0 件のとき sendWebPushNotification は呼ばれない', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockGetPushSubscriptionRepo.mockReturnValue(makePushRepo([]));

      await POST(buildPostRequest({ characterId: 'hiyori' }));
      expect(mockSendWebPushNotification).not.toHaveBeenCalled();
    });

    it('購読 0 件のとき NotificationEvent は記録されない', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockGetPushSubscriptionRepo.mockReturnValue(makePushRepo([]));
      const notifRepo = makeNotifEventRepo();
      mockGetNotifEventRepo.mockReturnValue(notifRepo);

      await POST(buildPostRequest({ characterId: 'hiyori' }));
      expect(notifRepo.put).not.toHaveBeenCalled();
    });
  });

  describe('正常系（送信成功）', () => {
    it('各サブスクリプションへ sendWebPushNotification を呼ぶ', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      const sub1 = makeSubscription({ SubscriptionID: 'sub-1' });
      const sub2 = makeSubscription({
        SubscriptionID: 'sub-2',
        Endpoint: 'https://push.example.com/sub-2',
      });
      mockGetPushSubscriptionRepo.mockReturnValue(makePushRepo([sub1, sub2]));
      mockGetNotifEventRepo.mockReturnValue(makeNotifEventRepo());
      mockSendWebPushNotification.mockResolvedValue(true);

      await POST(buildPostRequest({ characterId: 'hiyori' }));

      expect(mockSendWebPushNotification).toHaveBeenCalledTimes(2);
    });

    it('payload の data に characterId と url=/?character=<id> が含まれる', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockGetPushSubscriptionRepo.mockReturnValue(makePushRepo([makeSubscription()]));
      mockGetNotifEventRepo.mockReturnValue(makeNotifEventRepo());
      mockSendWebPushNotification.mockResolvedValue(true);

      await POST(buildPostRequest({ characterId: 'hiyori' }));

      const callArgs = mockSendWebPushNotification.mock.calls[0];
      const payload = callArgs[1];
      expect(payload.data).toMatchObject({
        characterId: 'hiyori',
        url: '/?character=hiyori',
      });
    });

    it('送信成功時に { sent: <成功数>, characterId } を返す', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      const sub1 = makeSubscription({ SubscriptionID: 'sub-1' });
      const sub2 = makeSubscription({
        SubscriptionID: 'sub-2',
        Endpoint: 'https://push.example.com/sub-2',
      });
      mockGetPushSubscriptionRepo.mockReturnValue(makePushRepo([sub1, sub2]));
      mockGetNotifEventRepo.mockReturnValue(makeNotifEventRepo());
      mockSendWebPushNotification.mockResolvedValue(true);

      const res = await POST(buildPostRequest({ characterId: 'hiyori' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sent).toBe(2);
      expect(json.characterId).toBe('hiyori');
    });

    it('成功時に NotificationEvent が CharacterID 付きで記録される', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockGetPushSubscriptionRepo.mockReturnValue(makePushRepo([makeSubscription()]));
      const notifRepo = makeNotifEventRepo();
      mockGetNotifEventRepo.mockReturnValue(notifRepo);
      mockSendWebPushNotification.mockResolvedValue(true);

      await POST(buildPostRequest({ characterId: 'hiyori' }));

      expect(notifRepo.put).toHaveBeenCalledTimes(1);
      const putArg = (notifRepo.put as jest.Mock).mock.calls[0][0];
      expect(putArg.CharacterID).toBe('hiyori');
      expect(putArg.UserID).toBe('g1');
      expect(putArg.Kind).toBe('normal');
    });

    it('テストと分かる文面（title/body）で送信される', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockGetPushSubscriptionRepo.mockReturnValue(makePushRepo([makeSubscription()]));
      mockGetNotifEventRepo.mockReturnValue(makeNotifEventRepo());
      mockSendWebPushNotification.mockResolvedValue(true);

      await POST(buildPostRequest({ characterId: 'hiyori' }));

      const callArgs = mockSendWebPushNotification.mock.calls[0];
      const payload = callArgs[1];
      // notificationName を使ったタイトル
      expect(payload.title).toBe('ひよりより');
      // テスト送信であることが明確に分かる body
      expect(payload.body).toContain('テスト送信');
      expect(payload.body).toContain('桃瀬ひより');
    });
  });

  describe('無効サブスクリプションの処理', () => {
    it('false を返すサブスクリプションは delete される', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      const validSub = makeSubscription({ SubscriptionID: 'sub-valid' });
      const invalidSub = makeSubscription({
        SubscriptionID: 'sub-invalid',
        Endpoint: 'https://push.example.com/sub-invalid',
      });
      const pushRepo = makePushRepo([validSub, invalidSub]);
      mockGetPushSubscriptionRepo.mockReturnValue(pushRepo);
      const notifRepo = makeNotifEventRepo();
      mockGetNotifEventRepo.mockReturnValue(notifRepo);

      // 最初のサブスク(valid)は成功、2番目(invalid)は false（無効）を返す
      mockSendWebPushNotification.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const res = await POST(buildPostRequest({ characterId: 'hiyori' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      // 有効なサブスクリプション 1 件のみ成功
      expect(json.sent).toBe(1);

      // 無効サブスクが delete される
      expect(pushRepo.delete).toHaveBeenCalledWith({
        userId: 'g1',
        subscriptionId: 'sub-invalid',
      });
    });

    it('全サブスク無効（sent=0）のとき NotificationEvent は記録されない', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockGetPushSubscriptionRepo.mockReturnValue(makePushRepo([makeSubscription()]));
      const notifRepo = makeNotifEventRepo();
      mockGetNotifEventRepo.mockReturnValue(notifRepo);
      mockSendWebPushNotification.mockResolvedValue(false);

      const res = await POST(buildPostRequest({ characterId: 'hiyori' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sent).toBe(0);
      expect(notifRepo.put).not.toHaveBeenCalled();
    });
  });

  describe('送信例外の処理', () => {
    it('一部サブスクで例外が発生しても他を送信し続ける', async () => {
      mockGetSession.mockResolvedValue(adminSession);
      const sub1 = makeSubscription({ SubscriptionID: 'sub-1' });
      const sub2 = makeSubscription({
        SubscriptionID: 'sub-2',
        Endpoint: 'https://push.example.com/sub-2',
      });
      mockGetPushSubscriptionRepo.mockReturnValue(makePushRepo([sub1, sub2]));
      const notifRepo = makeNotifEventRepo();
      mockGetNotifEventRepo.mockReturnValue(notifRepo);

      // sub-1 で例外、sub-2 は成功
      mockSendWebPushNotification
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce(true);

      const res = await POST(buildPostRequest({ characterId: 'hiyori' }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sent).toBe(1);
    });
  });
});
