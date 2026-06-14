import { renderHook, act, waitFor } from '@testing-library/react';
import { useAccountDeletion } from '@/lib/account/useAccountDeletion';
import { ACCOUNT_API_ERROR_MESSAGES } from '@/lib/account/api-client';

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
}));

jest.mock('@/lib/account/api-client', () => ({
  ...jest.requireActual('@/lib/account/api-client'),
  deleteAccount: jest.fn(),
}));

jest.mock('@/lib/account/navigation', () => ({
  redirectToTop: jest.fn(),
}));

// モックの参照を取得するため import する
import { signOut } from 'next-auth/react';
import { deleteAccount } from '@/lib/account/api-client';
import { redirectToTop } from '@/lib/account/navigation';

// signOut はオーバーロードがあるため jest.fn() でキャストする
const mockSignOut = signOut as jest.Mock;
const mockDeleteAccount = deleteAccount as jest.MockedFunction<typeof deleteAccount>;
const mockRedirectToTop = redirectToTop as jest.MockedFunction<typeof redirectToTop>;

afterEach(() => {
  jest.clearAllMocks();
});

describe('useAccountDeletion', () => {
  describe('初期値', () => {
    it('loading の初期値は false', () => {
      const { result } = renderHook(() => useAccountDeletion());
      expect(result.current.loading).toBe(false);
    });

    it('error の初期値は null', () => {
      const { result } = renderHook(() => useAccountDeletion());
      expect(result.current.error).toBeNull();
    });
  });

  describe('requestDeletion 成功', () => {
    it('成功時は signOut でセッションを破棄し、ブラウザ側でトップへ遷移する', async () => {
      mockDeleteAccount.mockResolvedValue(undefined);
      mockSignOut.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAccountDeletion());

      await act(async () => {
        await result.current.requestDeletion();
      });

      // サーバ側リダイレクト解決を避けるため redirect: false で呼ぶ
      expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
      // 遷移はブラウザ側（redirectToTop）でトップへ移動する
      expect(mockRedirectToTop).toHaveBeenCalledTimes(1);
    });

    it('成功時は error が null のまま', async () => {
      mockDeleteAccount.mockResolvedValue(undefined);
      mockSignOut.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAccountDeletion());

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
      mockSignOut.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAccountDeletion());

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

      const { result } = renderHook(() => useAccountDeletion());

      await act(async () => {
        await result.current.requestDeletion();
      });

      expect(result.current.error).toBe(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED);
    });

    it('deleteAccount が失敗したとき signOut は呼ばれない', async () => {
      mockDeleteAccount.mockRejectedValue(new Error(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED));

      const { result } = renderHook(() => useAccountDeletion());

      await act(async () => {
        await result.current.requestDeletion();
      });

      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('失敗後は loading が false に戻る', async () => {
      mockDeleteAccount.mockRejectedValue(new Error(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED));

      const { result } = renderHook(() => useAccountDeletion());

      await act(async () => {
        await result.current.requestDeletion();
      });

      expect(result.current.loading).toBe(false);
    });

    it('Error インスタンスでない例外のとき汎用メッセージがセットされる', async () => {
      mockDeleteAccount.mockRejectedValue('文字列エラー');

      const { result } = renderHook(() => useAccountDeletion());

      await act(async () => {
        await result.current.requestDeletion();
      });

      expect(result.current.error).toBe(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED);
    });
  });

  describe('clearError', () => {
    it('セットされた error を null に戻す', async () => {
      mockDeleteAccount.mockRejectedValue(new Error(ACCOUNT_API_ERROR_MESSAGES.DELETE_FAILED));

      const { result } = renderHook(() => useAccountDeletion());

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
      mockSignOut.mockResolvedValue(undefined);

      const { result, rerender } = renderHook(() => useAccountDeletion());
      const firstRef = result.current.requestDeletion;
      rerender();
      expect(result.current.requestDeletion).toBe(firstRef);
    });
  });
});
