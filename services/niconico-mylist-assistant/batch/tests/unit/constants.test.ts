/**
 * constants.ts のユニットテスト
 */

import {
  ERROR_MESSAGES,
  NICONICO_URLS,
  DEFAULT_RETRY_CONFIG,
  TIMEOUTS,
  VIDEO_REGISTRATION_WAIT,
  TWO_FACTOR_AUTH_POLL_INTERVAL,
} from '../../src/constants';

describe('constants', () => {
  describe('ERROR_MESSAGES', () => {
    it('全てのエラーメッセージが日本語である', () => {
      const messages = Object.values(ERROR_MESSAGES);

      messages.forEach((message) => {
        expect(message).toMatch(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/);
      });
    });

    it('ログイン関連のエラーメッセージが定義されている', () => {
      expect(ERROR_MESSAGES.LOGIN_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.LOGIN_TIMEOUT).toBeDefined();
      expect(ERROR_MESSAGES.INVALID_CREDENTIALS).toBeDefined();
      expect(ERROR_MESSAGES.TWO_FACTOR_AUTH_REQUIRED).toBeDefined();
      expect(ERROR_MESSAGES.TWO_FACTOR_AUTH_TIMEOUT).toBeDefined();
    });

    it('マイリスト操作関連のエラーメッセージが定義されている', () => {
      expect(ERROR_MESSAGES.MYLIST_CREATE_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.MYLIST_DELETE_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.VIDEO_REGISTRATION_FAILED).toBeDefined();
    });

    it('パラメータ関連のエラーメッセージが定義されている', () => {
      expect(ERROR_MESSAGES.MISSING_ENV_VARS).toBeDefined();
      expect(ERROR_MESSAGES.INVALID_PARAMETERS).toBeDefined();
    });

    it('暗号化関連のエラーメッセージが定義されている', () => {
      expect(ERROR_MESSAGES.DECRYPTION_FAILED).toBeDefined();
    });

    it('その他のエラーメッセージが定義されている', () => {
      expect(ERROR_MESSAGES.BROWSER_LAUNCH_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.SCREENSHOT_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.UNKNOWN_ERROR).toBeDefined();
    });

    it('エラーメッセージに具体的な内容が含まれる', () => {
      expect(ERROR_MESSAGES.LOGIN_FAILED).toContain('ログイン');
      expect(ERROR_MESSAGES.MYLIST_CREATE_FAILED).toContain('マイリスト');
      expect(ERROR_MESSAGES.DECRYPTION_FAILED).toContain('復号化');
    });
  });

  describe('NICONICO_URLS', () => {
    it('全てのURLがhttpsで始まる', () => {
      const urls = Object.values(NICONICO_URLS);

      urls.forEach((url) => {
        expect(url).toMatch(/^https:\/\//);
      });
    });

    it('ログインURLが正しい', () => {
      expect(NICONICO_URLS.LOGIN).toBe('https://account.nicovideo.jp/login');
    });

    it('マイリストURLが正しい', () => {
      expect(NICONICO_URLS.MYLIST).toBe('https://www.nicovideo.jp/my/mylist');
    });

    it('動画URLが正しい', () => {
      expect(NICONICO_URLS.VIDEO).toBe('https://www.nicovideo.jp/watch/');
    });

    it('全てのURLがnicovideo.jpドメインである', () => {
      const urls = Object.values(NICONICO_URLS);

      urls.forEach((url) => {
        expect(url).toMatch(/nicovideo\.jp/);
      });
    });
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('maxRetriesが正の整数である', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBeGreaterThan(0);
      expect(Number.isInteger(DEFAULT_RETRY_CONFIG.maxRetries)).toBe(true);
    });

    it('retryDelayが正の整数である', () => {
      expect(DEFAULT_RETRY_CONFIG.retryDelay).toBeGreaterThan(0);
      expect(Number.isInteger(DEFAULT_RETRY_CONFIG.retryDelay)).toBe(true);
    });

    it('適切なリトライ回数が設定されている', () => {
      // 3回が推奨値
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
    });

    it('適切なリトライ間隔が設定されている', () => {
      // 2000ms（2秒）が推奨値
      expect(DEFAULT_RETRY_CONFIG.retryDelay).toBe(2000);
    });
  });

  describe('TIMEOUTS', () => {
    it('全てのタイムアウト値が正の整数である', () => {
      const timeouts = Object.values(TIMEOUTS);

      timeouts.forEach((timeout) => {
        expect(timeout).toBeGreaterThan(0);
        expect(Number.isInteger(timeout)).toBe(true);
      });
    });

    it('ログインタイムアウトが30秒である', () => {
      expect(TIMEOUTS.LOGIN).toBe(30000);
    });

    it('ナビゲーションタイムアウトが30秒である', () => {
      expect(TIMEOUTS.NAVIGATION).toBe(30000);
    });

    it('動画登録タイムアウトが10秒である', () => {
      expect(TIMEOUTS.VIDEO_REGISTRATION).toBe(10000);
    });

    it('二段階認証待機タイムアウトが5分である', () => {
      expect(TIMEOUTS.TWO_FACTOR_AUTH_WAIT).toBe(300000); // 5分 = 300秒 = 300000ms
    });

    it('タイムアウト値がミリ秒単位で適切である', () => {
      // 最短でも1秒以上であるべき
      expect(TIMEOUTS.VIDEO_REGISTRATION).toBeGreaterThanOrEqual(1000);
      // 最長でも10分以下であるべき
      expect(TIMEOUTS.TWO_FACTOR_AUTH_WAIT).toBeLessThanOrEqual(600000);
    });
  });

  describe('VIDEO_REGISTRATION_WAIT', () => {
    it('2秒である', () => {
      expect(VIDEO_REGISTRATION_WAIT).toBe(2000);
    });

    it('正の整数である', () => {
      expect(VIDEO_REGISTRATION_WAIT).toBeGreaterThan(0);
      expect(Number.isInteger(VIDEO_REGISTRATION_WAIT)).toBe(true);
    });
  });

  describe('TWO_FACTOR_AUTH_POLL_INTERVAL', () => {
    it('5秒である', () => {
      expect(TWO_FACTOR_AUTH_POLL_INTERVAL).toBe(5000);
    });

    it('正の整数である', () => {
      expect(TWO_FACTOR_AUTH_POLL_INTERVAL).toBeGreaterThan(0);
      expect(Number.isInteger(TWO_FACTOR_AUTH_POLL_INTERVAL)).toBe(true);
    });

    it('タイムアウト値より小さい', () => {
      // ポーリング間隔は二段階認証待機タイムアウトより小さいべきである
      expect(TWO_FACTOR_AUTH_POLL_INTERVAL).toBeLessThan(TIMEOUTS.TWO_FACTOR_AUTH_WAIT);
    });
  });

  describe('定数の一貫性', () => {
    it('動画登録待機時間がリトライ間隔と同じである', () => {
      // ニコニコ動画サーバーへの配慮として2秒待機が推奨
      expect(VIDEO_REGISTRATION_WAIT).toBe(DEFAULT_RETRY_CONFIG.retryDelay);
    });

    it('全ての時間関連定数がミリ秒単位である', () => {
      // ミリ秒単位であることを確認（秒単位の値は100以上になるはず）
      expect(VIDEO_REGISTRATION_WAIT).toBeGreaterThanOrEqual(1000);
      expect(TWO_FACTOR_AUTH_POLL_INTERVAL).toBeGreaterThanOrEqual(1000);
      expect(DEFAULT_RETRY_CONFIG.retryDelay).toBeGreaterThanOrEqual(1000);
    });
  });
});
