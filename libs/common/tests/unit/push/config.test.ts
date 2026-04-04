import { getVapidConfig } from '../../../src/push/config.js';

describe('getVapidConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('環境変数が設定されている場合、正しい VapidConfig を返す', () => {
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';

    const config = getVapidConfig();

    expect(config.publicKey).toBe('test-public-key');
    expect(config.privateKey).toBe('test-private-key');
    expect(config.subject).toBe('mailto:support@nagiyu.com');
  });

  test('環境変数が未設定の場合、publicKey と privateKey に空文字列を返す', () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const config = getVapidConfig();

    expect(config.publicKey).toBe('');
    expect(config.privateKey).toBe('');
    expect(config.subject).toBe('mailto:support@nagiyu.com');
  });
});
