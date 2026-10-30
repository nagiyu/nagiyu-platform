import { NextRequest } from 'next/server';
import { GET } from '../../../../app/api/push/vapid-public-key/route';
import { POST } from '../../../../app/api/push/subscribe/route';
import { getSession } from '../../../../lib/auth';
import { errorReporter } from '../../../../lib/api-error-reporting';

jest.mock('../../../../lib/api-error-reporting', () => ({
  errorReporter: {
    report: jest.fn(),
    onError: jest.fn(() => jest.fn()),
  },
}));

/**
 * ルート読み込み時に onError へ渡された報告関数を、タイトルで引けるように控える。
 * beforeEach のモックのリセットで呼び出し履歴が消えるため、ここで取り出しておく。
 */
const onErrorMock = errorReporter.onError as jest.Mock;
const handlerByTitle = new Map<string, jest.Mock>(
  onErrorMock.mock.calls.map(([title]: [string], index: number) => [
    title,
    onErrorMock.mock.results[index].value as jest.Mock,
  ])
);

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

describe('Push 系ルートの 500 報告', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('VAPID 公開鍵が未設定なら 500 を返し、報告する', async () => {
    const response = await GET();

    expect(response.status).toBe(500);
    expect(handlerByTitle.get('Web API: VAPID 公開鍵取得エラー')).toHaveBeenCalledTimes(1);
  });

  it('VAPID 鍵が未設定の購読登録は 500 を返し、報告する', async () => {
    (getSession as jest.Mock).mockResolvedValue({
      user: { id: 'test-user', roles: ['stock-user'] },
    });
    const request = new NextRequest('http://localhost/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        subscription: {
          endpoint: 'https://example.com/endpoint',
          keys: { p256dh: 'p256dh', auth: 'auth' },
        },
      }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    expect(handlerByTitle.get('Web API: Push 購読登録エラー')).toHaveBeenCalledTimes(1);
  });
});
