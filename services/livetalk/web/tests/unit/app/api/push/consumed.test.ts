/**
 * @jest-environment node
 */
/**
 * PATCH /api/push/consumed のユニットテスト。
 *
 * テスト観点:
 *   - 未認証は 401
 *   - notifId が文字列で渡されたときだけ consumedAt を記録する
 *   - 対象の通知が存在しなければ 404 を返す
 *   - 壊れた JSON・null・配列・notifId の欠落や型違いは 400 で、記録しない
 */
import { NextRequest } from 'next/server';
import { EntityNotFoundError } from '@nagiyu/aws';
import { PATCH } from '@/app/api/push/consumed/route';
import { getSession } from '@/lib/server/session';
import { getNotificationEventRepository } from '@/lib/server/repositories';
import type { NotificationEventRepository } from '@nagiyu/livetalk-core';

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
    id: 'u1',
    email: 'u@example.com',
    name: 'U',
    roles: ['livetalk-user'],
  },
  expires: new Date(Date.now() + 60 * 1000).toISOString(),
};

/** リポジトリモックのファクトリ */
function makeRepo(): NotificationEventRepository {
  return {
    listByUser: jest.fn(),
    put: jest.fn(),
    get: jest.fn(),
    markConsumed: jest.fn(),
  } as unknown as NotificationEventRepository;
}

/** PATCH リクエストを組み立てるヘルパー。文字列はそのまま本文にする */
function buildPatchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/push/consumed', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('PATCH /api/push/consumed', () => {
  beforeEach(() => jest.clearAllMocks());

  it('未認証は 401 を返し、記録しない', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const repo = makeRepo();
    mockGetNotificationEventRepo.mockReturnValue(repo);

    const res = await PATCH(buildPatchRequest({ notifId: 'n1' }));
    expect(res.status).toBe(401);
    expect(repo.markConsumed).not.toHaveBeenCalled();
  });

  it('notifId を指定すると消化済みとして記録し 200 を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const repo = makeRepo();
    mockGetNotificationEventRepo.mockReturnValue(repo);

    const res = await PATCH(buildPatchRequest({ notifId: 'n1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(repo.markConsumed).toHaveBeenCalledWith(
      { userId: 'u1', notifId: 'n1' },
      expect.any(Number)
    );
  });

  it('対象の通知が存在しない場合は 404 を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const repo = makeRepo();
    (repo.markConsumed as jest.Mock).mockRejectedValueOnce(
      new EntityNotFoundError('NotificationEvent', 'USER#u1#NOTIF#missing')
    );
    mockGetNotificationEventRepo.mockReturnValue(repo);

    const res = await PATCH(buildPatchRequest({ notifId: 'missing' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: 'NOT_FOUND',
      message: '指定された通知が見つかりません',
    });
  });

  it('存在しない以外の失敗は 404 にせず、そのまま失敗させる', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const repo = makeRepo();
    (repo.markConsumed as jest.Mock).mockRejectedValueOnce(new Error('DB 障害'));
    mockGetNotificationEventRepo.mockReturnValue(repo);

    const res = await PATCH(buildPatchRequest({ notifId: 'n1' }));
    expect(res.status).toBe(500);
  });

  it.each([
    ['壊れた JSON', 'invalid-json'],
    ['null', 'null'],
    ['配列', '[{"notifId":"n1"}]'],
    ['文字列', '"n1"'],
    ['notifId が欠落', {}],
    ['notifId が数値', { notifId: 1 }],
    ['notifId が配列', { notifId: ['n1'] }],
    ['notifId が null', { notifId: null }],
  ])('body が %s の場合は 400 で記録しない', async (_label, body) => {
    mockGetSession.mockResolvedValue(validSession);
    const repo = makeRepo();
    mockGetNotificationEventRepo.mockReturnValue(repo);

    const res = await PATCH(buildPatchRequest(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('INVALID_REQUEST');
    expect(json.message).toBe('notifId が必要です');
    expect(repo.markConsumed).not.toHaveBeenCalled();
  });
});
