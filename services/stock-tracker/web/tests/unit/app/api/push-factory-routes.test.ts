import { NextRequest } from 'next/server';
import * as awsModule from '@nagiyu/aws';
import { GET } from '../../../../app/api/push/vapid-public-key/route';
import { POST } from '../../../../app/api/push/subscribe/route';
import { getSession } from '../../../../lib/auth';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

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
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        title: 'Web API: VAPID 公開鍵取得エラー',
      })
    );
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
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        title: 'Web API: Push 購読登録エラー',
      })
    );
  });
});
