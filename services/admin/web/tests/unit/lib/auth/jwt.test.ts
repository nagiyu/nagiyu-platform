import { verifyJWT } from '@/lib/auth/jwt';
import type { JWTVerifyResult } from 'jose';

// Mock jose module before import
jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
}));

import { jwtVerify } from 'jose';

describe('verifyJWT', () => {
  const mockJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Set environment variables
    process.env.NEXTAUTH_SECRET = 'test-secret';
    process.env.NEXTAUTH_URL = 'https://auth.test.com';
  });

  afterEach(() => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_URL;
  });

  it('有効な JWT トークンを検証できる', async () => {
    const mockPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      roles: ['admin'],
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };

    mockJwtVerify.mockResolvedValue({
      payload: mockPayload,
      protectedHeader: {},
    } as JWTVerifyResult);

    const result = await verifyJWT('valid-token');

    expect(result).toEqual(mockPayload);
    expect(mockJwtVerify).toHaveBeenCalledWith('valid-token', expect.anything(), {
      issuer: 'https://auth.test.com',
    });
  });

  it('期限切れの JWT トークンは null を返す', async () => {
    mockJwtVerify.mockRejectedValue(new Error('Token expired'));

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await verifyJWT('expired-token');

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith('JWT検証に失敗しました', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('署名が不正な JWT トークンは null を返す', async () => {
    mockJwtVerify.mockRejectedValue(new Error('Invalid signature'));

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await verifyJWT('invalid-signature-token');

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith('JWT検証に失敗しました', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('空文字列のトークンは null を返す', async () => {
    mockJwtVerify.mockRejectedValue(new Error('Empty token'));

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await verifyJWT('');

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'JWT検証に失敗しました',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('NEXTAUTH_SECRET が未設定の場合は null を返す', async () => {
    delete process.env.NEXTAUTH_SECRET;

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await verifyJWT('some-token');

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith('NEXTAUTH_SECRET 環境変数が設定されていません');

    consoleErrorSpy.mockRestore();
  });

  it('NEXTAUTH_URL が未設定の場合は null を返す', async () => {
    delete process.env.NEXTAUTH_URL;

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await verifyJWT('some-token');

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith('NEXTAUTH_URL 環境変数が設定されていません');

    consoleErrorSpy.mockRestore();
  });
});
