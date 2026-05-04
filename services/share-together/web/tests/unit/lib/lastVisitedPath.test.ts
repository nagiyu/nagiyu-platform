import {
  LAST_VISITED_PATH_STORAGE_KEY,
  clearLastVisitedPath,
  isPersistablePath,
  loadLastVisitedPath,
  saveLastVisitedPath,
} from '@/lib/lastVisitedPath';

describe('lastVisitedPath', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('isPersistablePath', () => {
    it('通常のページパスは保存対象として true を返す', () => {
      expect(isPersistablePath('/lists')).toBe(true);
      expect(isPersistablePath('/groups')).toBe(true);
      expect(isPersistablePath('/groups/abc-123')).toBe(true);
    });

    it('ルート "/" は復元先になりえないため false を返す', () => {
      expect(isPersistablePath('/')).toBe(false);
    });

    it('"/" で始まらない値は不正なパスとして false を返す', () => {
      expect(isPersistablePath('lists')).toBe(false);
      expect(isPersistablePath('https://example.com/lists')).toBe(false);
      expect(isPersistablePath('')).toBe(false);
    });
  });

  describe('save / load / clear', () => {
    it('保存した値を読み出せる', () => {
      saveLastVisitedPath('/lists');
      expect(loadLastVisitedPath()).toBe('/lists');
      expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe('/lists');
    });

    it('値が未保存の場合は null を返す', () => {
      expect(loadLastVisitedPath()).toBeNull();
    });

    it('clear によって値が削除される', () => {
      saveLastVisitedPath('/groups');
      clearLastVisitedPath();
      expect(loadLastVisitedPath()).toBeNull();
    });
  });
});
