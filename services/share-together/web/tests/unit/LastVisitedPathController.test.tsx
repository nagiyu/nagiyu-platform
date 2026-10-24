import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import LastVisitedPathController from '@/components/LastVisitedPathController';
import {
  LAST_VISITED_PATH_STORAGE_KEY,
  SESSION_BOOTSTRAP_STORAGE_KEY,
  saveLastVisitedPath,
} from '@/lib/lastVisitedPath';

const mockUsePathname = jest.fn<string | null, []>();
const mockUseSearchParams = jest.fn<URLSearchParams | null, []>();
const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
  useRouter: () => mockRouter,
}));

describe('LastVisitedPathController', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockUsePathname.mockReset();
    mockReplace.mockReset();
    mockUseSearchParams.mockReset();
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  describe('セッション初回 effect の挙動', () => {
    it('トップ "/" 着地で前回値が通常パスなら復元 redirect し、現在地は保存しない', () => {
      saveLastVisitedPath('/lists');
      mockUsePathname.mockReturnValue('/');

      render(<LastVisitedPathController />);

      expect(mockReplace).toHaveBeenCalledWith('/lists');
      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe('/lists');
      expect(window.sessionStorage.getItem(SESSION_BOOTSTRAP_STORAGE_KEY)).toBe('1');
    });

    it('トップ "/" 着地で前回値も "/" なら redirect せず "/" を保存する', () => {
      saveLastVisitedPath('/');
      mockUsePathname.mockReturnValue('/');

      render(<LastVisitedPathController />);

      expect(mockReplace).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe('/');
      expect(window.sessionStorage.getItem(SESSION_BOOTSTRAP_STORAGE_KEY)).toBe('1');
    });

    it('トップ "/" 着地で前回値が無ければ redirect せず "/" を保存する', () => {
      mockUsePathname.mockReturnValue('/');

      render(<LastVisitedPathController />);

      expect(mockReplace).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe('/');
      expect(window.sessionStorage.getItem(SESSION_BOOTSTRAP_STORAGE_KEY)).toBe('1');
    });

    it('トップ以外のパス着地ではセッションをブートストラップしつつ redirect せず保存する', () => {
      saveLastVisitedPath('/groups');
      mockUsePathname.mockReturnValue('/lists');

      render(<LastVisitedPathController />);

      expect(mockReplace).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe('/lists');
      expect(window.sessionStorage.getItem(SESSION_BOOTSTRAP_STORAGE_KEY)).toBe('1');
    });
  });

  describe('セッション 2 回目以降 effect の挙動', () => {
    it('ブートストラップ済みなら "/" 着地で復元せず "/" を保存する', () => {
      saveLastVisitedPath('/lists');
      window.sessionStorage.setItem(SESSION_BOOTSTRAP_STORAGE_KEY, '1');
      mockUsePathname.mockReturnValue('/');

      render(<LastVisitedPathController />);

      expect(mockReplace).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe('/');
    });

    it('ブートストラップ済みなら通常パスは保存される', () => {
      window.sessionStorage.setItem(SESSION_BOOTSTRAP_STORAGE_KEY, '1');
      mockUsePathname.mockReturnValue('/groups/abc');

      render(<LastVisitedPathController />);

      expect(mockReplace).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe('/groups/abc');
    });
  });

  describe('クエリ付きの保存と復元', () => {
    it('クエリ付きのパスはクエリ込みで保存する', () => {
      window.sessionStorage.setItem(SESSION_BOOTSTRAP_STORAGE_KEY, '1');
      mockUsePathname.mockReturnValue('/lists');
      mockUseSearchParams.mockReturnValue(
        new URLSearchParams('scope=shared&groupId=group-1&listId=list-1')
      );

      render(<LastVisitedPathController />);

      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe(
        '/lists?scope=shared&groupId=group-1&listId=list-1'
      );
    });

    it('クエリが変わったら保存し直す', () => {
      window.sessionStorage.setItem(SESSION_BOOTSTRAP_STORAGE_KEY, '1');
      mockUsePathname.mockReturnValue('/lists');
      mockUseSearchParams.mockReturnValue(new URLSearchParams('listId=list-1'));
      const { rerender } = render(<LastVisitedPathController />);
      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe(
        '/lists?listId=list-1'
      );

      mockUseSearchParams.mockReturnValue(new URLSearchParams('listId=list-2'));
      rerender(<LastVisitedPathController />);

      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe(
        '/lists?listId=list-2'
      );
    });

    it('トップ "/" 着地で前回値がクエリ付きなら、クエリ込みで復元 redirect する', () => {
      saveLastVisitedPath('/lists?scope=shared&groupId=group-1&listId=list-1');
      mockUsePathname.mockReturnValue('/');

      render(<LastVisitedPathController />);

      expect(mockReplace).toHaveBeenCalledWith('/lists?scope=shared&groupId=group-1&listId=list-1');
    });

    it('useSearchParams が null を返してもパスだけを保存する', () => {
      window.sessionStorage.setItem(SESSION_BOOTSTRAP_STORAGE_KEY, '1');
      mockUsePathname.mockReturnValue('/groups');
      mockUseSearchParams.mockReturnValue(null);

      render(<LastVisitedPathController />);

      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe('/groups');
    });
  });

  describe('入力ガード', () => {
    it('pathname が null の場合は何もしない', () => {
      mockUsePathname.mockReturnValue(null);

      render(<LastVisitedPathController />);

      expect(mockReplace).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBeNull();
      expect(window.sessionStorage.getItem(SESSION_BOOTSTRAP_STORAGE_KEY)).toBeNull();
    });

    it('"/" で始まらない不正な pathname は何もしない', () => {
      mockUsePathname.mockReturnValue('lists');

      render(<LastVisitedPathController />);

      expect(mockReplace).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBeNull();
      expect(window.sessionStorage.getItem(SESSION_BOOTSTRAP_STORAGE_KEY)).toBeNull();
    });

    it('保存された前回値が "/" 始まりでない場合は復元 redirect しない', () => {
      window.localStorage.setItem(LAST_VISITED_PATH_STORAGE_KEY, 'corrupt-value');
      mockUsePathname.mockReturnValue('/');

      render(<LastVisitedPathController />);

      expect(mockReplace).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe('/');
    });
  });

  it('描画結果は何も出力しない', () => {
    mockUsePathname.mockReturnValue('/');

    const { container } = render(<LastVisitedPathController />);

    expect(container).toBeEmptyDOMElement();
  });
});
