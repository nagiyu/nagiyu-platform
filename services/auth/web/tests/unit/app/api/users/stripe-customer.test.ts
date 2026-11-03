/**
 * Unit tests for DELETE /api/users/[userId]/stripe-customer endpoint
 *
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { EntityNotFoundError, OptimisticLockError } from '@nagiyu/aws';
import { DELETE } from '../../../../../src/app/api/users/[userId]/stripe-customer/route';

const mockGetSession = jest.fn();
const mockUpdateRolesAndGrants = jest.fn();
const mockHasPermission = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);

jest.mock('@nagiyu/auth-core', () => ({
  createUserRepository: jest.fn(() => ({
    updateRolesAndGrants: (...args: unknown[]) => mockUpdateRolesAndGrants(...args),
  })),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: (...args: unknown[]) => mockReportErrorEvent(...args),
}));

jest.mock('@nagiyu/common', () => ({
  ...jest.requireActual('@nagiyu/common'),
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
}));

jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: () => mockGetSession(),
}));

const context = { params: Promise.resolve({ userId: 'user-456' }) };
const createRequest = () =>
  new NextRequest('http://localhost/api/users/user-456/stripe-customer', { method: 'DELETE' });

beforeEach(() => {
  jest.clearAllMocks();
  mockReportErrorEvent.mockResolvedValue(null);
  mockGetSession.mockResolvedValue({ user: { id: 'admin-123', roles: ['admin'] } });
  mockHasPermission.mockReturnValue(true);
});

describe('DELETE /api/users/[userId]/stripe-customer', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await DELETE(createRequest(), context);

    expect(response.status).toBe(401);
    expect(mockUpdateRolesAndGrants).not.toHaveBeenCalled();
  });

  it('roles:assign が無い場合は 403 を返す', async () => {
    mockHasPermission.mockReturnValue(false);

    const response = await DELETE(createRequest(), context);

    expect(response.status).toBe(403);
    expect(mockHasPermission).toHaveBeenCalledWith(['admin'], 'roles:assign');
    expect(mockUpdateRolesAndGrants).not.toHaveBeenCalled();
  });

  it('対応を外し、Stripe 由来の有効な権利を取り消す内容で書く', async () => {
    mockUpdateRolesAndGrants.mockImplementation(
      async (_id: string, compute: (user: unknown) => { roleGrants: unknown }) => {
        const change = compute({
          userId: 'user-456',
          stripeCustomerId: 'cus_1',
          roleGrants: [
            {
              grantId: 'g1',
              roleId: 'livetalk-premium',
              source: 'stripe',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        });
        return { userId: 'user-456', roleGrants: change.roleGrants };
      }
    );

    const response = await DELETE(createRequest(), context);

    expect(response.status).toBe(200);
    expect(mockUpdateRolesAndGrants).toHaveBeenCalledWith('user-456', expect.any(Function));
    const body = await response.json();
    expect(body.roleGrants[0].revokedAt).toEqual(expect.any(Number));
  });

  it('対応が無いユーザーは 404 を返す', async () => {
    mockUpdateRolesAndGrants.mockImplementation(
      async (_id: string, compute: (user: unknown) => { roleGrants: unknown }) =>
        compute({ userId: 'user-456' })
    );

    const response = await DELETE(createRequest(), context);

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('このユーザーは Stripe の顧客と対応していません');
  });

  it('ユーザーが存在しない場合は 404 を返す', async () => {
    mockUpdateRolesAndGrants.mockRejectedValue(new EntityNotFoundError('User', 'user-456'));

    expect((await DELETE(createRequest(), context)).status).toBe(404);
  });

  it('競合が解けない場合は 409 を返す', async () => {
    mockUpdateRolesAndGrants.mockRejectedValue(new OptimisticLockError('User', 'user-456'));

    expect((await DELETE(createRequest(), context)).status).toBe(409);
  });

  it('想定外のエラーは 500 を返しエラーイベントを送る', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockUpdateRolesAndGrants.mockRejectedValue(new Error('DB error'));

    const response = await DELETE(createRequest(), context);

    expect(response.status).toBe(500);
    expect(mockReportErrorEvent).toHaveBeenCalled();
  });
});
