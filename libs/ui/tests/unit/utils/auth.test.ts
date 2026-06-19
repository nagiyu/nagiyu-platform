import { buildSignOutUrl, buildRefreshUrl } from '../../../src/utils/auth';

describe('buildSignOutUrl', () => {
  describe('callbackUrl なし', () => {
    it('基本的な authUrl からサインアウト URL を生成する', () => {
      const result = buildSignOutUrl('https://auth.nagiyu.com');
      expect(result).toBe('https://auth.nagiyu.com/api/auth/signout');
    });

    it('callbackUrl が undefined の場合クエリパラメータを付与しない', () => {
      const result = buildSignOutUrl('https://auth.nagiyu.com', undefined);
      expect(result).toBe('https://auth.nagiyu.com/api/auth/signout');
    });

    it('callbackUrl が空文字の場合クエリパラメータを付与しない', () => {
      const result = buildSignOutUrl('https://auth.nagiyu.com', '');
      expect(result).toBe('https://auth.nagiyu.com/api/auth/signout');
    });
  });

  describe('callbackUrl あり', () => {
    it('callbackUrl を encodeURIComponent してクエリパラメータに付与する', () => {
      const result = buildSignOutUrl('https://auth.nagiyu.com', 'https://live-talk.nagiyu.com');
      expect(result).toBe(
        'https://auth.nagiyu.com/api/auth/signout?callbackUrl=https%3A%2F%2Flive-talk.nagiyu.com'
      );
    });

    it('callbackUrl にパスが含まれる場合も正しく encode する', () => {
      const result = buildSignOutUrl(
        'https://auth.nagiyu.com',
        'https://live-talk.nagiyu.com/notes'
      );
      expect(result).toBe(
        'https://auth.nagiyu.com/api/auth/signout?callbackUrl=https%3A%2F%2Flive-talk.nagiyu.com%2Fnotes'
      );
    });

    it('callbackUrl に特殊文字が含まれる場合も正しく encode する', () => {
      const result = buildSignOutUrl(
        'https://auth.nagiyu.com',
        'https://example.com/page?foo=bar&baz=qux'
      );
      expect(result).toBe(
        'https://auth.nagiyu.com/api/auth/signout?callbackUrl=https%3A%2F%2Fexample.com%2Fpage%3Ffoo%3Dbar%26baz%3Dqux'
      );
    });
  });

  describe('authUrl の末尾スラッシュ正規化', () => {
    it('authUrl の末尾スラッシュを除去して二重スラッシュを防ぐ', () => {
      const result = buildSignOutUrl('https://auth.nagiyu.com/');
      expect(result).toBe('https://auth.nagiyu.com/api/auth/signout');
    });

    it('authUrl の複数の末尾スラッシュも除去する', () => {
      const result = buildSignOutUrl('https://auth.nagiyu.com///');
      expect(result).toBe('https://auth.nagiyu.com/api/auth/signout');
    });

    it('末尾スラッシュ正規化後も callbackUrl を正しく付与する', () => {
      const result = buildSignOutUrl('https://auth.nagiyu.com/', 'https://live-talk.nagiyu.com');
      expect(result).toBe(
        'https://auth.nagiyu.com/api/auth/signout?callbackUrl=https%3A%2F%2Flive-talk.nagiyu.com'
      );
    });
  });

  describe('開発環境 URL の対応', () => {
    it('dev 環境のサブドメインでも正しく URL を生成する', () => {
      const result = buildSignOutUrl(
        'https://dev-auth.nagiyu.com',
        'https://dev-live-talk.nagiyu.com'
      );
      expect(result).toBe(
        'https://dev-auth.nagiyu.com/api/auth/signout?callbackUrl=https%3A%2F%2Fdev-live-talk.nagiyu.com'
      );
    });

    it('authUrl が空文字の場合でも例外を投げずに処理する（未設定フォールバック対応）', () => {
      const result = buildSignOutUrl('');
      expect(result).toBe('/api/auth/signout');
    });
  });
});

describe('buildRefreshUrl', () => {
  describe('callbackUrl なし', () => {
    it('基本的な authUrl からリフレッシュ URL を生成する', () => {
      const result = buildRefreshUrl('https://auth.nagiyu.com');
      expect(result).toBe('https://auth.nagiyu.com/refresh');
    });

    it('callbackUrl が undefined の場合クエリパラメータを付与しない', () => {
      const result = buildRefreshUrl('https://auth.nagiyu.com', undefined);
      expect(result).toBe('https://auth.nagiyu.com/refresh');
    });

    it('callbackUrl が空文字の場合クエリパラメータを付与しない', () => {
      const result = buildRefreshUrl('https://auth.nagiyu.com', '');
      expect(result).toBe('https://auth.nagiyu.com/refresh');
    });
  });

  describe('callbackUrl あり', () => {
    it('callbackUrl を encodeURIComponent してクエリパラメータに付与する', () => {
      const result = buildRefreshUrl('https://auth.nagiyu.com', 'https://live-talk.nagiyu.com');
      expect(result).toBe(
        'https://auth.nagiyu.com/refresh?callbackUrl=https%3A%2F%2Flive-talk.nagiyu.com'
      );
    });

    it('callbackUrl にパスが含まれる場合も正しく encode する', () => {
      const result = buildRefreshUrl(
        'https://auth.nagiyu.com',
        'https://live-talk.nagiyu.com/notes'
      );
      expect(result).toBe(
        'https://auth.nagiyu.com/refresh?callbackUrl=https%3A%2F%2Flive-talk.nagiyu.com%2Fnotes'
      );
    });

    it('callbackUrl に特殊文字が含まれる場合も正しく encode する', () => {
      const result = buildRefreshUrl(
        'https://auth.nagiyu.com',
        'https://example.com/page?foo=bar&baz=qux'
      );
      expect(result).toBe(
        'https://auth.nagiyu.com/refresh?callbackUrl=https%3A%2F%2Fexample.com%2Fpage%3Ffoo%3Dbar%26baz%3Dqux'
      );
    });
  });

  describe('authUrl の末尾スラッシュ正規化', () => {
    it('authUrl の末尾スラッシュを除去して二重スラッシュを防ぐ', () => {
      const result = buildRefreshUrl('https://auth.nagiyu.com/');
      expect(result).toBe('https://auth.nagiyu.com/refresh');
    });

    it('authUrl の複数の末尾スラッシュも除去する', () => {
      const result = buildRefreshUrl('https://auth.nagiyu.com///');
      expect(result).toBe('https://auth.nagiyu.com/refresh');
    });

    it('末尾スラッシュ正規化後も callbackUrl を正しく付与する', () => {
      const result = buildRefreshUrl('https://auth.nagiyu.com/', 'https://live-talk.nagiyu.com');
      expect(result).toBe(
        'https://auth.nagiyu.com/refresh?callbackUrl=https%3A%2F%2Flive-talk.nagiyu.com'
      );
    });
  });

  describe('開発環境 URL の対応', () => {
    it('dev 環境のサブドメインでも正しく URL を生成する', () => {
      const result = buildRefreshUrl(
        'https://dev-auth.nagiyu.com',
        'https://dev-live-talk.nagiyu.com'
      );
      expect(result).toBe(
        'https://dev-auth.nagiyu.com/refresh?callbackUrl=https%3A%2F%2Fdev-live-talk.nagiyu.com'
      );
    });

    it('authUrl が空文字の場合でも例外を投げずに処理する（未設定フォールバック対応）', () => {
      const result = buildRefreshUrl('');
      expect(result).toBe('/refresh');
    });
  });
});
