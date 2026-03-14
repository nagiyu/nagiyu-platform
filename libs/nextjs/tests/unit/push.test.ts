import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createVapidPublicKeyRoute } from '../../src/push';

describe('createVapidPublicKeyRoute', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    delete process.env.VAPID_PUBLIC_KEY;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.VAPID_PUBLIC_KEY;
  });

  it('VAPID公開鍵が設定されている場合は200と公開鍵を返す', async () => {
    process.env.VAPID_PUBLIC_KEY = 'test-vapid-public-key';
    const GET = createVapidPublicKeyRoute();

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      publicKey: 'test-vapid-public-key',
    });
  });

  it('VAPID公開鍵が未設定の場合は500エラーを返す', async () => {
    const GET = createVapidPublicKeyRoute();

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'VAPID公開鍵が設定されていません',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('VAPID_PUBLIC_KEY is not configured');
  });
});
