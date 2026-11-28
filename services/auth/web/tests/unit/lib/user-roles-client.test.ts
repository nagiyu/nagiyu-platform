import { USER_ROLES_CLIENT_MESSAGES, saveUserRoles } from '../../../src/lib/user-roles-client';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('saveUserRoles', () => {
  it('POST で呼び、成功なら ok を返す', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const result = await saveUserRoles('u 1', { roles: ['admin'] });

    expect(mockFetch).toHaveBeenCalledWith('/api/users/u%201/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: ['admin'] }),
    });
    expect(result).toEqual({ ok: true });
  });

  it('API のエラー文言をそのまま返す', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: '失敗' }) });

    expect(await saveUserRoles('u1', {})).toEqual({ ok: false, message: '失敗' });
  });

  it('応答が JSON でない場合は既定の文言にする', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    });

    expect(await saveUserRoles('u1', {})).toEqual({
      ok: false,
      message: USER_ROLES_CLIENT_MESSAGES.ASSIGN_FAILED,
    });
  });

  it('error が文字列でない場合は既定の文言にする', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: { code: 1 } }) });

    expect(await saveUserRoles('u1', {})).toEqual({
      ok: false,
      message: USER_ROLES_CLIENT_MESSAGES.ASSIGN_FAILED,
    });
  });

  it('通信に失敗したら通信失敗の文言にする', async () => {
    mockFetch.mockRejectedValue(new Error('network'));

    expect(await saveUserRoles('u1', {})).toEqual({
      ok: false,
      message: USER_ROLES_CLIENT_MESSAGES.REQUEST_FAILED,
    });
  });
});
