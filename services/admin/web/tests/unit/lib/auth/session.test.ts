import { getSession } from '../../../../src/lib/auth/session';

describe('getSession', () => {
  it('should return mock session data in Phase 1', async () => {
    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session?.user).toBeDefined();
    expect(session?.user.email).toBe('test@example.com');
    expect(session?.user.roles).toEqual(['admin']);
  });

  it('should return user with email', async () => {
    const session = await getSession();

    expect(session?.user.email).toMatch(/@/);
  });

  it('should return user with at least one role', async () => {
    const session = await getSession();

    expect(session?.user.roles.length).toBeGreaterThan(0);
  });
});
