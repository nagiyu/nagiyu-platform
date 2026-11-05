/**
 * @jest-environment node
 */
const mockAuth = jest.fn();
jest.mock('@/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

import { getSession } from '@/lib/auth';

const SESSION = {
  user: { id: 'u1', email: 'a@example.com', name: 'A', roles: [] },
  expires: '2999-01-01T00:00:00.000Z',
};

describe('getSession', () => {
  const originalSkip = process.env.SKIP_AUTH_CHECK;

  beforeEach(() => {
    mockAuth.mockReset();
    delete process.env.SKIP_AUTH_CHECK;
  });

  afterAll(() => {
    if (originalSkip === undefined) delete process.env.SKIP_AUTH_CHECK;
    else process.env.SKIP_AUTH_CHECK = originalSkip;
  });

  it('ログイン中はセッションを返す', async () => {
    mockAuth.mockResolvedValue(SESSION);
    await expect(getSession()).resolves.toEqual(SESSION);
  });

  it('未ログインは null を返す', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(getSession()).resolves.toBeNull();
  });

  it('user を持たないセッションは null を返す', async () => {
    mockAuth.mockResolvedValue({ expires: SESSION.expires });
    await expect(getSession()).resolves.toBeNull();
  });

  it('セッションの検証が例外になっても null を返して落とさない', async () => {
    mockAuth.mockRejectedValue(new Error('MissingSecret'));
    await expect(getSession()).resolves.toBeNull();
  });

  it('SKIP_AUTH_CHECK=true では auth を呼ばずテストセッションを返す', async () => {
    process.env.SKIP_AUTH_CHECK = 'true';
    const session = await getSession();
    expect(session?.user.id).toBeDefined();
    expect(mockAuth).not.toHaveBeenCalled();
  });
});
