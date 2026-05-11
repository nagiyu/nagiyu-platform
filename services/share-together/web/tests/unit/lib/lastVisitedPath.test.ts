import {
  LAST_VISITED_PATH_STORAGE_KEY,
  SESSION_BOOTSTRAP_STORAGE_KEY,
  clearLastVisitedPath,
  isRecordablePath,
  loadLastVisitedPath,
  saveLastVisitedPath,
} from '@/lib/lastVisitedPath';

describe('lastVisitedPath', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('isRecordablePath', () => {
    it('"/" で始まる任意のパスは記録対象として true を返す', () => {
      expect(isRecordablePath('/')).toBe(true);
      expect(isRecordablePath('/lists')).toBe(true);
      expect(isRecordablePath('/groups')).toBe(true);
      expect(isRecordablePath('/groups/abc-123')).toBe(true);
    });

    it('"/" で始まらない値は不正なパスとして false を返す', () => {
      expect(isRecordablePath('lists')).toBe(false);
      expect(isRecordablePath('https://example.com/lists')).toBe(false);
      expect(isRecordablePath('')).toBe(false);
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

  describe('SESSION_BOOTSTRAP_STORAGE_KEY', () => {
    it('PR #2982 で導入された既存セッションのフラグを引き継ぐためキー値を維持している', () => {
      expect(SESSION_BOOTSTRAP_STORAGE_KEY).toBe('share-together:home-redirect-checked');
    });
  });
});
