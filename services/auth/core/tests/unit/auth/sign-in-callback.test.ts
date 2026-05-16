import { reportErrorEvent } from '@nagiyu/aws';

const mockUpsertUser = jest.fn();

const capturedCallbacks: { jwt?: Function } = {};

jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@nagiyu/nextjs', () => ({
  createAuthConfig: jest.fn().mockImplementation(({ jwt }) => {
    capturedCallbacks.jwt = jwt;
    return { callbacks: {} };
  }),
}));

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({
    handlers: {},
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../src/repositories/factory', () => ({
  createUserRepository: jest.fn().mockReturnValue({ upsertUser: mockUpsertUser }),
}));

describe('jwt コールバック', () => {
  let mockGetUserByGoogleId: jest.Mock;
  let mockUpdateLastLogin: jest.Mock;

  beforeAll(async () => {
    await import('../../../src/auth/auth');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (reportErrorEvent as jest.Mock).mockResolvedValue(null);
    mockGetUserByGoogleId = jest.fn();
    mockUpdateLastLogin = jest.fn();
    mockUpsertUser.mockResolvedValue({ userId: 'user-123' });
  });

  it('account と user がある場合はトークンにユーザー情報を設定する', async () => {
    const mockDbUser = { userId: 'db-user-123', roles: ['admin'] };
    mockGetUserByGoogleId.mockResolvedValueOnce(mockDbUser);
    mockUpdateLastLogin.mockResolvedValueOnce(undefined);

    const { createUserRepository } = await import('../../../src/repositories/factory');
    (createUserRepository as jest.Mock).mockReturnValueOnce({
      getUserByGoogleId: mockGetUserByGoogleId,
      updateLastLogin: mockUpdateLastLogin,
    });

    const token = {};
    const result = await capturedCallbacks.jwt!({
      token,
      user: { email: 'test@example.com', name: 'Test', image: null },
      account: { providerAccountId: 'google-123' },
    });

    expect(result.userId).toBe('db-user-123');
    expect(result.roles).toEqual(['admin']);
  });

  it('account がない場合はトークンをそのまま返す', async () => {
    const token = { existing: 'value' };
    const result = await capturedCallbacks.jwt!({ token, user: {}, account: null });
    expect(result).toEqual({ existing: 'value' });
  });

  it('dbUser が見つからない場合は roles を空配列に設定する', async () => {
    mockGetUserByGoogleId.mockResolvedValueOnce(null);

    const { createUserRepository } = await import('../../../src/repositories/factory');
    (createUserRepository as jest.Mock).mockReturnValueOnce({
      getUserByGoogleId: mockGetUserByGoogleId,
      updateLastLogin: mockUpdateLastLogin,
    });

    const token = {};
    const result = await capturedCallbacks.jwt!({
      token,
      user: {},
      account: { providerAccountId: 'google-123' },
    });

    expect(result.roles).toEqual([]);
    expect(mockUpdateLastLogin).not.toHaveBeenCalled();
  });
});

describe('redirect コールバック', () => {
  let redirect: Function;

  beforeAll(async () => {
    const { authConfig } = await import('../../../src/auth/auth');
    redirect = authConfig.callbacks!.redirect as Function;
  });

  it('baseUrl と同じ URL は許可する', async () => {
    const result = await redirect({
      url: 'https://auth.nagiyu.com/signin',
      baseUrl: 'https://auth.nagiyu.com',
    });
    expect(result).toBe('https://auth.nagiyu.com/signin');
  });

  it('*.nagiyu.com へのリダイレクトは許可する', async () => {
    const result = await redirect({
      url: 'https://admin.nagiyu.com/',
      baseUrl: 'https://auth.nagiyu.com',
    });
    expect(result).toBe('https://admin.nagiyu.com/');
  });

  it('外部 URL は baseUrl にフォールバックする', async () => {
    const result = await redirect({
      url: 'https://evil.example.com/',
      baseUrl: 'https://auth.nagiyu.com',
    });
    expect(result).toBe('https://auth.nagiyu.com');
  });
});

describe('signIn コールバック', () => {
  let signIn: Function;

  beforeAll(async () => {
    const { authConfig } = await import('../../../src/auth/auth');
    signIn = authConfig.callbacks!.signIn as Function;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (reportErrorEvent as jest.Mock).mockResolvedValue(null);
    mockUpsertUser.mockResolvedValue({ userId: 'user-123' });
  });

  it('account が null の場合は false を返し reportErrorEvent は呼ばない', async () => {
    const result = await signIn({
      user: { email: 'test@example.com', name: 'Test' },
      account: null,
    });

    expect(result).toBe(false);
    expect(reportErrorEvent).not.toHaveBeenCalled();
  });

  it('email が欠落している場合は reportErrorEvent を呼び false を返す', async () => {
    const result = await signIn({
      user: { email: null, name: 'Test' },
      account: { providerAccountId: 'google-secret-id' },
    });

    expect(result).toBe(false);
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'auth',
        severity: 'error',
        title: 'signIn: OAuth ユーザー情報に email がありません',
      })
    );
    const call = (reportErrorEvent as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(call.context)).not.toContain('google-secret-id');
    expect(JSON.stringify(call.context)).not.toContain('@');
  });

  it('name が欠落している場合は reportErrorEvent を呼び false を返す', async () => {
    const result = await signIn({
      user: { email: 'test@example.com', name: null },
      account: { providerAccountId: 'google-secret-id' },
    });

    expect(result).toBe(false);
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'auth',
        severity: 'error',
        title: 'signIn: OAuth ユーザー情報に name がありません',
      })
    );
    const call = (reportErrorEvent as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(call.context)).not.toContain('google-secret-id');
    expect(JSON.stringify(call.context)).not.toContain('@example.com');
  });

  it('upsertUser エラー時は reportErrorEvent を呼び false を返す', async () => {
    mockUpsertUser.mockRejectedValueOnce(new Error('DynamoDB error'));

    const result = await signIn({
      user: { email: 'test@example.com', name: 'Test' },
      account: { providerAccountId: 'google-secret-id' },
    });

    expect(result).toBe(false);
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'auth',
        severity: 'error',
        title: 'signIn: ユーザー upsert エラー',
        message: 'DynamoDB error',
      })
    );
    const call = (reportErrorEvent as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(call.context)).not.toContain('google-secret-id');
    expect(JSON.stringify(call.context)).not.toContain('@example.com');
  });

  it('upsertUser が Error 以外をスローした場合も false を返す', async () => {
    mockUpsertUser.mockRejectedValueOnce('string error from db');

    const result = await signIn({
      user: { email: 'test@example.com', name: 'Test' },
      account: { providerAccountId: 'google-secret-id' },
    });

    expect(result).toBe(false);
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'string error from db',
        context: expect.objectContaining({ errorStack: undefined }),
      })
    );
  });

  it('正常時は true を返し reportErrorEvent は呼ばない', async () => {
    const result = await signIn({
      user: { email: 'test@example.com', name: 'Test' },
      account: { providerAccountId: 'google-secret-id' },
    });

    expect(result).toBe(true);
    expect(reportErrorEvent).not.toHaveBeenCalled();
  });
});
