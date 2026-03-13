/**
 * utils.ts のユニットテスト
 */

import { getTimestamp, generateDefaultMylistName } from '../../src/utils';

describe('utils', () => {
  describe('getTimestamp', () => {
    it('ISO 8601形式のタイムスタンプを返す', () => {
      const timestamp = getTimestamp();

      // ISO 8601形式の検証: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('呼び出すたびに異なる値を返す', async () => {
      const timestamp1 = getTimestamp();
      await new Promise((resolve) => setTimeout(resolve, 10));
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
