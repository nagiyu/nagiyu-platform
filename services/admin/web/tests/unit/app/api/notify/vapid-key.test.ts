/**
 * @jest-environment node
 */
import { GET } from '@/app/api/notify/vapid-key/route';

const mockReportErrorEvent = jest.fn();

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(),
  reportErrorEvent: (...args: unknown[]) => mockReportErrorEvent(...args),
}));

describe('GET /api/notify/vapid-key', () => {
  const original = process.env.VAPID_PUBLIC_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReportErrorEvent.mockResolvedValue(null);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (original === undefined) {
      delete process.env.VAPID_PUBLIC_KEY;
    } else {
      process.env.VAPID_PUBLIC_KEY = original;
    }
  });

  it('公開鍵が設定されていれば 200 を返し、報告しない', async () => {
    process.env.VAPID_PUBLIC_KEY = 'public-key';

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publicKey: 'public-key' });
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('公開鍵が未設定なら 500 を返し、serviceId admin で報告する', async () => {
    delete process.env.VAPID_PUBLIC_KEY;

    const response = await GET();

    expect(response.status).toBe(500);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'admin',
        title: 'Web API: VAPID 公開鍵取得エラー',
      })
    );
  });
});
