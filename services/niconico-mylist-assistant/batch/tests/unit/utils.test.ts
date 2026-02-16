/**
 * utils.ts のユニットテスト
 */

import { sleep, retry, getTimestamp, generateDefaultMylistName } from '../../src/utils';

describe('utils', () => {
  describe('sleep', () => {
    it('指定されたミリ秒間待機する', async () => {
      const startTime = Date.now();
      const delay = 100;

      await sleep(delay);

      const elapsedTime = Date.now() - startTime;
      // 100ms前後の誤差を許容（システム負荷による）
      expect(elapsedTime).toBeGreaterThanOrEqual(delay - 10);
      expect(elapsedTime).toBeLessThan(delay + 50);
    });

    it('負の値を指定した場合は0として扱う', async () => {
      const startTime = Date.now();

      await sleep(-100);

      const elapsedTime = Date.now() - startTime;
      // ほぼ即座に完了する
      expect(elapsedTime).toBeLessThan(50);
    });

    it('0を指定した場合は即座に完了する', async () => {
      const startTime = Date.now();

      await sleep(0);

      const elapsedTime = Date.now() - startTime;
      // ほぼ即座に完了する
      expect(elapsedTime).toBeLessThan(50);
    });
  });

  describe('retry', () => {
    it('成功した場合は結果を返す', async () => {
      const successFn = jest.fn().mockResolvedValue('success');

      const result = await retry(successFn);

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    it('失敗した場合はリトライする', async () => {
      const failTwiceThenSucceed = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await retry(failTwiceThenSucceed, {
        maxRetries: 3,
        retryDelay: 10, // テストを高速化
      });

      expect(result).toBe('success');
      expect(failTwiceThenSucceed).toHaveBeenCalledTimes(3);
    });

    it('最大リトライ回数を超えた場合はエラーをスローする', async () => {
      const alwaysFail = jest.fn().mockRejectedValue(new Error('always fail'));

      await expect(
        retry(alwaysFail, {
          maxRetries: 2,
          retryDelay: 10,
        })
      ).rejects.toThrow('always fail');

      // 初回 + リトライ2回 = 合計3回実行
      expect(alwaysFail).toHaveBeenCalledTimes(3);
    });

    it('リトライ間に指定された時間待機する', async () => {
      const failOnceThenSucceed = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      const retryDelay = 100;

      await retry(failOnceThenSucceed, {
        maxRetries: 1,
        retryDelay,
      });

      const elapsedTime = Date.now() - startTime;
      // リトライ間隔の待機時間を含む
      expect(elapsedTime).toBeGreaterThanOrEqual(retryDelay - 10);
    });

    it('デフォルトのリトライ設定を使用する', async () => {
      const failTwiceThenSucceed = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await retry(failTwiceThenSucceed);

      expect(result).toBe('success');
      // デフォルトの maxRetries は 3
      expect(failTwiceThenSucceed).toHaveBeenCalledTimes(3);
    });

    it('Error以外の例外もハンドリングする', async () => {
      const throwString = jest.fn().mockRejectedValue('string error');

      await expect(
        retry(throwString, {
          maxRetries: 1,
          retryDelay: 10,
        })
      ).rejects.toThrow('string error');
    });
  });

  describe('getTimestamp', () => {
    it('ISO 8601形式のタイムスタンプを返す', () => {
      const timestamp = getTimestamp();

      // ISO 8601形式の検証: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('呼び出すたびに異なる値を返す', async () => {
      const timestamp1 = getTimestamp();
      await sleep(10); // 少し待機
      const timestamp2 = getTimestamp();

      expect(timestamp1).not.toBe(timestamp2);
    });

    it('有効なDate文字列を返す', () => {
      const timestamp = getTimestamp();
      const date = new Date(timestamp);

      expect(date.toString()).not.toBe('Invalid Date');
    });
  });

  describe('generateDefaultMylistName', () => {
    it('正しいフォーマットのマイリスト名を生成する', () => {
      const mylistName = generateDefaultMylistName();

      // フォーマット: "自動登録 YYYY/MM/DD HH:MM:SS"
      expect(mylistName).toMatch(/^自動登録 \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('プレフィックスが"自動登録"で始まる', () => {
      const mylistName = generateDefaultMylistName();

      expect(mylistName).toMatch(/^自動登録 /);
    });

    it('現在の日時を含む', () => {
      const now = new Date();
      const mylistName = generateDefaultMylistName();

      // 年が含まれることを確認
      const year = now.getFullYear();
      expect(mylistName).toContain(year.toString());
    });

    it('月が2桁でゼロパディングされている', () => {
      // モックを使用して1月をテスト
      const mockDate = new Date(2024, 0, 15, 10, 30, 45); // 2024年1月15日
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const mylistName = generateDefaultMylistName();

      expect(mylistName).toContain('2024/01/15');

      jest.restoreAllMocks();
    });

    it('日が2桁でゼロパディングされている', () => {
      // モックを使用して1日をテスト
      const mockDate = new Date(2024, 5, 1, 10, 30, 45); // 2024年6月1日
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const mylistName = generateDefaultMylistName();

      expect(mylistName).toContain('2024/06/01');

      jest.restoreAllMocks();
    });

    it('時刻が2桁でゼロパディングされている', () => {
      // モックを使用して午前1時2分3秒をテスト
      const mockDate = new Date(2024, 5, 15, 1, 2, 3); // 2024年6月15日 01:02:03
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const mylistName = generateDefaultMylistName();

      expect(mylistName).toBe('自動登録 2024/06/15 01:02:03');

      jest.restoreAllMocks();
    });

    it('呼び出すたびに異なる値を返す', () => {
      // Dateをモックして時間経過を再現
      const mockDate1 = new Date(2024, 5, 15, 10, 30, 45);
      const mockDate2 = new Date(2024, 5, 15, 10, 30, 46); // 1秒後

      jest.spyOn(global, 'Date').mockImplementationOnce(() => mockDate1 as any);
      const name1 = generateDefaultMylistName();

      jest.spyOn(global, 'Date').mockImplementationOnce(() => mockDate2 as any);
      const name2 = generateDefaultMylistName();

      expect(name1).not.toBe(name2);
      expect(name1).toBe('自動登録 2024/06/15 10:30:45');
      expect(name2).toBe('自動登録 2024/06/15 10:30:46');

      jest.restoreAllMocks();
    });
  });
});
