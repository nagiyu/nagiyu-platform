import { deleteAccount, ACCOUNT_API_ERROR_MESSAGES } from '@/lib/account/api-client';

afterEach(() => {
  jest.clearAllMocks();
});

describe('deleteAccount', () => {
  it('DELETE /api/account を呼び出す', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await deleteAccount();

    expect(global.fetch).toHaveBeenCalledWith('/api/account', { method: 'DELETE' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('res.ok が true のとき void を返す（例外を throw しない）', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await expect(deleteAccount()).resolves.toBeUndefined();
  });

  it('res.ok が false のとき DELETE_FAILED エラーを throw する', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(deleteAccount()).rejects.toThrow(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED);
  });

  it('ネットワークエラーのとき例外が伝播する', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ネットワークエラー'));

    await expect(deleteAccount()).rejects.toThrow('ネットワークエラー');
  });
});

describe('ACCOUNT_API_ERROR_MESSAGES', () => {
  it('DELETE_FAILED が日本語メッセージを持つ', () => {
    expect(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED).toBeTruthy();
    expect(typeof ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED).toBe('string');
  });
});
