/**
 * @jest-environment node
 */
import { GET } from '@/app/api/push/vapid-public-key/route';
import { reportErrorEvent } from '@nagiyu/aws';

jest.mock('@nagiyu/aws', () => ({ reportErrorEvent: jest.fn().mockResolvedValue(null) }));

describe('GET /api/push/vapid-public-key', () => {
  const original = process.env.VAPID_PUBLIC_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (original === undefined) {
      delete process.env.VAPID_PUBLIC_KEY;
    } else {
      process.env.VAPID_PUBLIC_KEY = original;
    }
  });

  it('公開鍵が設定されていれば 200 で返し、報告しない', async () => {
    process.env.VAPID_PUBLIC_KEY = 'public';

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ publicKey: 'public' });
    expect(reportErrorEvent).not.toHaveBeenCalled();
  });

  it('公開鍵が未設定なら 500 を返し、VAPID 公開鍵取得エラーとして報告する', async () => {
    delete process.env.VAPID_PUBLIC_KEY;

    const res = await GET();

    expect(res.status).toBe(500);
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        title: 'Web API: VAPID 公開鍵取得エラー',
      })
    );
  });
});
