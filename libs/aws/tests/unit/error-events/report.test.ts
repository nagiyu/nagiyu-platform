/**
 * reportErrorEvent / createErrorReporter の単体テスト
 */

import { reportErrorEvent, createErrorReporter } from '../../../src/error-events/report.js';
import {
  createErrorEventWriter,
  resetErrorEventWriter,
} from '../../../src/error-events/factory.js';
import { InMemoryErrorEventWriter } from '../../../src/error-events/in-memory-writer.js';

const TABLE_NAME = 'test-error-events';

function getInMemoryWriter(): InMemoryErrorEventWriter {
  return createErrorEventWriter() as InMemoryErrorEventWriter;
}

describe('reportErrorEvent', () => {
  beforeEach(() => {
    process.env.USE_IN_MEMORY_DB = 'true';
    process.env.ERROR_EVENTS_TABLE_NAME = TABLE_NAME;
    resetErrorEventWriter();
  });

  afterEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.ERROR_EVENTS_TABLE_NAME;
    resetErrorEventWriter();
  });

  describe('デフォルト値', () => {
    it('source のデフォルトは application', async () => {
      const event = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'テストエラー',
        message: 'エラーが発生しました',
      });

      expect(event.source).toBe('application');
    });

    it('context 未指定のとき "{}" が保存される', async () => {
      const event = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'テスト',
        message: 'メッセージ',
      });

      expect(event.context).toBe('{}');
    });

    it('eventId は自動採番される（UUID 形式）', async () => {
      const event = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'テスト',
        message: 'メッセージ',
      });

      expect(event.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('occurredAt は ISO-8601 UTC 形式で自動設定される', async () => {
      const before = new Date().toISOString();
      const event = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'テスト',
        message: 'メッセージ',
      });
      const after = new Date().toISOString();

      expect(event.occurredAt >= before).toBe(true);
      expect(event.occurredAt <= after).toBe(true);
    });
  });

  describe('任意パラメータの明示指定', () => {
    it('source を manual に指定できる', async () => {
      const event = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'info',
        title: 'テスト',
        message: 'メッセージ',
        source: 'manual',
      });

      expect(event.source).toBe('manual');
    });

    it('context オブジェクトが JSON 文字列に変換される', async () => {
      const ctx = { userId: '123', action: 'insert', count: 5 };
      const event = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'warning',
        title: 'テスト',
        message: 'メッセージ',
        context: ctx,
      });

      expect(event.context).toBe(JSON.stringify(ctx));
    });

    it('occurredAt を明示指定できる', async () => {
      const ts = '2026-05-13T00:00:00.000Z';
      const event = await reportErrorEvent({
        serviceId: 'codec-converter',
        severity: 'info',
        title: 'テスト',
        message: 'メッセージ',
        occurredAt: ts,
      });

      expect(event.occurredAt).toBe(ts);
    });

    it('eventId を明示指定できる', async () => {
      const event = await reportErrorEvent({
        serviceId: 'codec-converter',
        severity: 'info',
        title: 'テスト',
        message: 'メッセージ',
        eventId: 'custom-event-id',
      });

      expect(event.eventId).toBe('custom-event-id');
    });
  });

  describe('ライターへの書き込み', () => {
    it('イベントが InMemoryErrorEventWriter に書き込まれる', async () => {
      await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'テスト書き込み',
        message: 'メッセージ',
      });

      const writer = getInMemoryWriter();
      expect(writer.getRecords()).toHaveLength(1);
      expect(writer.getRecords()[0].serviceId).toBe('stock-tracker');
      expect(writer.getRecords()[0].title).toBe('テスト書き込み');
    });

    it('返り値と書き込まれたイベントが一致する', async () => {
      const returned = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'critical',
        title: 'クリティカルエラー',
        message: '詳細メッセージ',
      });

      const writer = getInMemoryWriter();
      const stored = writer.getRecords()[0];
      expect(returned).toEqual(stored);
    });

    it('ライターのエラーは呼び出し元に伝播する', async () => {
      const writer = getInMemoryWriter();
      jest.spyOn(writer, 'put').mockRejectedValueOnce(new Error('書き込み失敗'));

      await expect(
        reportErrorEvent({
          serviceId: 'stock-tracker',
          severity: 'error',
          title: 'テスト',
          message: 'メッセージ',
        })
      ).rejects.toThrow('書き込み失敗');
    });
  });

  describe('環境変数チェック', () => {
    it('ERROR_EVENTS_TABLE_NAME 未設定のとき例外を投げる', async () => {
      delete process.env.ERROR_EVENTS_TABLE_NAME;

      await expect(
        reportErrorEvent({
          serviceId: 'stock-tracker',
          severity: 'error',
          title: 'テスト',
          message: 'メッセージ',
        })
      ).rejects.toThrow('ERROR_EVENTS_TABLE_NAME が設定されていません');
    });
  });
});

describe('createErrorReporter', () => {
  beforeEach(() => {
    process.env.USE_IN_MEMORY_DB = 'true';
    process.env.ERROR_EVENTS_TABLE_NAME = TABLE_NAME;
    resetErrorEventWriter();
  });

  afterEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.ERROR_EVENTS_TABLE_NAME;
    resetErrorEventWriter();
  });

  it('デフォルト serviceId が使われる', async () => {
    const reporter = createErrorReporter({ serviceId: 'stock-tracker' });
    const event = await reporter.report({
      severity: 'error',
      title: 'テスト',
      message: 'メッセージ',
    });

    expect(event.serviceId).toBe('stock-tracker');
  });

  it('呼び出し側で serviceId をオーバーライドできる', async () => {
    const reporter = createErrorReporter({ serviceId: 'default-service' });
    const event = await reporter.report({
      serviceId: 'override-service',
      severity: 'warning',
      title: 'テスト',
      message: 'メッセージ',
    });

    expect(event.serviceId).toBe('override-service');
  });

  it('source デフォルトは application', async () => {
    const reporter = createErrorReporter({ serviceId: 'stock-tracker' });
    const event = await reporter.report({
      severity: 'info',
      title: 'テスト',
      message: 'メッセージ',
    });

    expect(event.source).toBe('application');
  });

  it('複数回呼び出せる', async () => {
    const reporter = createErrorReporter({ serviceId: 'codec-converter' });
    await reporter.report({ severity: 'error', title: '1回目', message: 'msg' });
    await reporter.report({ severity: 'warning', title: '2回目', message: 'msg' });

    const writer = getInMemoryWriter();
    expect(writer.getRecords()).toHaveLength(2);
  });
});
