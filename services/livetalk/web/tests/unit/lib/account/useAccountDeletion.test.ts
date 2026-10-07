import { renderHook, act, waitFor } from '@testing-library/react';
import { useAccountDeletion } from '@/lib/account/useAccountDeletion';
import { ACCOUNT_API_ERROR_MESSAGES } from '@/lib/account/api-client';

jest.mock('@/lib/account/api-client', () => ({
  ...jest.requireActual('@/lib/account/api-client'),
  deleteAccount: jest.fn(),
}));

jest.mock('@/lib/account/navigation', () => ({
  redirectToSignOut: jest.fn(),
}));

// モックの参照を取得するため import する
import { deleteAccount } from '@/lib/account/api-client';
import { redirectToSignOut } from '@/lib/account/navigation';

const AUTH_URL = 'https://auth.nagiyu.com';
const mockDeleteAccount = deleteAccount as jest.MockedFunction<typeof deleteAccount>;
const mockRedirectToSignOut = redirectToSignOut as jest.MockedFunction<typeof redirectToSignOut>;

afterEach(() => {
  jest.clearAllMocks();
});

describe('useAccountDeletion', () => {
  describe('初期値', () => {
    it('loading の初期値は false', () => {
      const { result } = renderHook(() => useAccountDeletion(AUTH_URL));
      expect(result.current.loading).toBe(false);
    });

    it('error の初期値は null', () => {
      const { result } = renderHook(() => useAccountDeletion(AUTH_URL));
      expect(result.current.error).toBeNull();
    });
  });

  describe('requestDeletion 成功', () => {
    it('成功時は auth サービスのサインアウト遷移を authUrl 付きで 1 回だけ呼ぶ', async () => {
      mockDeleteAccount.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAccountDeletion(AUTH_URL));

      await act(async () => {
        await result.current.requestDeletion();
      });

      expect(mockRedirectToSignOut).toHaveBeenCalledTimes(1);
      expect(mockRedirectToSignOut).toHaveBeenCalledWith(AUTH_URL);
    });

    it('成功時は error が null のまま', async () => {
      mockDeleteAccount.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAccountDeletion(AUTH_URL));

      await act(async () => {
        await result.current.requestDeletion();
      });

      expect(result.current.error).toBeNull();
    });

    it('処理中は loading が true になり、完了後に false に戻る', async () => {
      let resolveDeletion!: () => void;
      mockDeleteAccount.mockReturnValue(
        new Promise<void>((res) => {
          resolveDeletion = res;
        })
      );

      const { result } = renderHook(() => useAccountDeletion(AUTH_URL));

      // 処理開始
      let promise!: Promise<void>;
      act(() => {
        promise = result.current.requestDeletion();
      });

      // loading が true になるまで待つ
      await waitFor(() => expect(result.current.loading).toBe(true));

      // 処理完了
      act(() => {
        resolveDeletion();
      });

      await act(async () => {
        await promise;
      });

      expect(result.current.loading).toBe(false);
    });
  });

  describe('requestDeletion 失敗', () => {
    it('deleteAccount が失敗したとき error にメッセージがセットされる', async () => {
      mockDeleteAccount.mockRejectedValue(new Error(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED));

      const { result } = renderHook(() => useAccountDeletion(AUTH_URL));

      await act(async () => {
        await result.current.requestDeletion();
      });

      expect(result.current.error).toBe(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED);
    });

    it('deleteAccount が失敗したときサインアウト遷移は呼ばれない', async () => {
      mockDeleteAccount.mockRejectedValue(new Error(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED));

      const { result } = renderHook(() => useAccountDeletion(AUTH_URL));

      await act(async () => {
        await result.current.requestDeletion();
      });

      expect(mockRedirectToSignOut).not.toHaveBeenCalled();
    });

    it('失敗後は loading が false に戻る', async () => {
      mockDeleteAccount.mockRejectedValue(new Error(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED));

      const { result } = renderHook(() => useAccountDeletion(AUTH_URL));

      await act(async () => {
        await result.current.requestDeletion();
      });

      expect(result.current.loading).toBe(false);
    });

    it('Error インスタンスでない例外のとき汎用メッセージがセットされる', async () => {
      mockDeleteAccount.mockRejectedValue('文字列エラー');

      const { result } = renderHook(() => useAccountDeletion(AUTH_URL));

      await act(async () => {
        await result.current.requestDeletion();
      });

      expect(result.current.error).toBe(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED);
    });
  });

  describe('clearError', () => {
    it('セットされた error を null に戻す', async () => {
      mockDeleteAccount.mockRejectedValue(new Error(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED));

      const { result } = renderHook(() => useAccountDeletion(AUTH_URL));

      await act(async () => {
        await result.current.requestDeletion();
      });
      expect(result.current.error).toBe(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED);

      act(() => {
        result.current.clearError();
      });
      expect(result.current.error).toBeNull();
    });
  });

  describe('requestDeletion の安定性', () => {
    it('requestDeletion は安定した関数参照を持つ', () => {
      mockDeleteAccount.mockResolvedValue(undefined);

      const { result, rerender } = renderHook(() => useAccountDeletion(AUTH_URL));
      const firstRef = result.current.requestDeletion;
      rerender();
      expect(result.current.requestDeletion).toBe(firstRef);
    });
  });
});
