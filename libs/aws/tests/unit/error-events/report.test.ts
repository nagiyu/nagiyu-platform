/**
 * reportErrorEvent / createErrorReporter の単体テスト
 */

import { reportErrorEvent, createErrorReporter } from '../../../src/error-events/report.js';
import {
  createErrorEventWriter,
  resetErrorEventWriter,
} from '../../../src/error-events/factory.js';
import { InMemoryErrorEventWriter } from '../../../src/error-events/in-memory-writer.js';
import { logger } from '@nagiyu/common';

const TABLE_NAME = 'test-error-events';

function getInMemoryWriter(): InMemoryErrorEventWriter {
  return createErrorEventWriter() as InMemoryErrorEventWriter;
}

describe('reportErrorEvent', () => {
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.USE_IN_MEMORY_DB = 'true';
    process.env.ERROR_EVENTS_TABLE_NAME = TABLE_NAME;
    resetErrorEventWriter();
    loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.ERROR_EVENTS_TABLE_NAME;
    resetErrorEventWriter();
    loggerErrorSpy.mockRestore();
  });

  describe('例外を投げない', () => {
    it('循環参照を含む context でも代替値で書き込みを続ける', async () => {
      const context: Record<string, unknown> = {};
      context.self = context;

      const event = await reportErrorEvent({
        serviceId: 'svc',
        severity: 'error',
        title: 't',
        message: 'm',
        context,
      });

      expect(event).not.toBeNull();
      expect(JSON.parse(event!.context)).toHaveProperty('contextSerializeError');
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('BigInt を含む context でも例外を投げない', async () => {
      await expect(
        reportErrorEvent({
          serviceId: 'svc',
          severity: 'error',
          title: 't',
          message: 'm',
          context: { n: BigInt(1) },
        })
      ).resolves.not.toBeNull();
    });
  });

  describe('デフォルト値', () => {
    it('source のデフォルトは application', async () => {
      const event = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'テストエラー',
        message: 'エラーが発生しました',
      });

      expect(event?.source).toBe('application');
    });

    it('context 未指定のとき "{}" が保存される', async () => {
      const event = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'テスト',
        message: 'メッセージ',
      });

      expect(event?.context).toBe('{}');
    });

    it('eventId は自動採番される（UUID 形式）', async () => {
      const event = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'テスト',
        message: 'メッセージ',
      });

      expect(event?.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('occurredAt は epoch ミリ秒で自動設定される', async () => {
      const before = Date.now();
      const event = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'テスト',
        message: 'メッセージ',
      });
      const after = Date.now();

      expect(event!.occurredAt >= before).toBe(true);
      expect(event!.occurredAt <= after).toBe(true);
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

      expect(event?.source).toBe('manual');
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

      expect(event?.context).toBe(JSON.stringify(ctx));
    });

    it('ISO 文字列の occurredAt を epoch ミリ秒に変換する', async () => {
      const ts = '2026-05-13T00:00:00.000Z';
      const event = await reportErrorEvent({
        serviceId: 'codec-converter',
        severity: 'info',
        title: 'テスト',
        message: 'メッセージ',
        occurredAt: ts,
      });

      expect(event?.occurredAt).toBe(Date.parse(ts));
    });

    it('数値の occurredAt はそのまま epoch ミリ秒として使う', async () => {
      const event = await reportErrorEvent({
        serviceId: 'codec-converter',
        severity: 'info',
        title: 'テスト',
        message: 'メッセージ',
        occurredAt: 1778630400000,
      });

      expect(event?.occurredAt).toBe(1778630400000);
    });

    it('解釈できない occurredAt は null を返し logger.error で警告する', async () => {
      const event = await reportErrorEvent({
        serviceId: 'codec-converter',
        severity: 'info',
        title: 'テスト',
        message: 'メッセージ',
        occurredAt: 'not-a-date',
      });

      expect(event).toBeNull();
      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(getInMemoryWriter().getRecords()).toHaveLength(0);
    });

    it('eventId を明示指定できる', async () => {
      const event = await reportErrorEvent({
        serviceId: 'codec-converter',
        severity: 'info',
        title: 'テスト',
        message: 'メッセージ',
        eventId: 'custom-event-id',
      });

      expect(event?.eventId).toBe('custom-event-id');
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

    it('ライターのエラーは null を返し logger.error で警告する', async () => {
      const writer = getInMemoryWriter();
      jest.spyOn(writer, 'put').mockRejectedValueOnce(new Error('書き込み失敗'));

      const result = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'テスト',
        message: 'メッセージ',
      });

      expect(result).toBeNull();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        '[reportErrorEvent] DynamoDB 書き込みに失敗しました',
        expect.objectContaining({ error: '書き込み失敗' })
      );
    });

    it('ライターのエラーで例外を投げない', async () => {
      const writer = getInMemoryWriter();
      jest.spyOn(writer, 'put').mockRejectedValueOnce(new Error('DynamoDB 障害'));

      await expect(
        reportErrorEvent({
          serviceId: 'stock-tracker',
          severity: 'error',
          title: 'テスト',
          message: 'メッセージ',
        })
      ).resolves.toBeNull();
    });
  });

  describe('環境変数チェック', () => {
    it('ERROR_EVENTS_TABLE_NAME 未設定のとき null を返す', async () => {
      delete process.env.ERROR_EVENTS_TABLE_NAME;

      const result = await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'テスト',
        message: 'メッセージ',
      });

      expect(result).toBeNull();
    });

    it('ERROR_EVENTS_TABLE_NAME 未設定のとき logger.error で警告する', async () => {
      delete process.env.ERROR_EVENTS_TABLE_NAME;

      await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'テスト',
        message: 'メッセージ',
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith('ERROR_EVENTS_TABLE_NAME が設定されていません');
    });

    it('ERROR_EVENTS_TABLE_NAME 未設定のとき例外を投げない', async () => {
      delete process.env.ERROR_EVENTS_TABLE_NAME;

      await expect(
        reportErrorEvent({
          serviceId: 'stock-tracker',
          severity: 'error',
          title: 'テスト',
          message: 'メッセージ',
        })
      ).resolves.toBeNull();
    });
  });
});

describe('createErrorReporter', () => {
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.USE_IN_MEMORY_DB = 'true';
    process.env.ERROR_EVENTS_TABLE_NAME = TABLE_NAME;
    resetErrorEventWriter();
    loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.ERROR_EVENTS_TABLE_NAME;
    resetErrorEventWriter();
    loggerErrorSpy.mockRestore();
  });

  it('固定した serviceId・既定の severity・source で報告する', async () => {
    const reporter = createErrorReporter({ serviceId: 'stock-tracker' });
    const event = await reporter.report('タイトル', new Error('失敗'));

    expect(event).toMatchObject({
      serviceId: 'stock-tracker',
      severity: 'error',
      source: 'application',
      title: 'タイトル',
      message: '失敗',
    });
  });

  it('context に例外の errorName / errorMessage / errorStack を入れる', async () => {
    const error = new TypeError('型が違います');
    const reporter = createErrorReporter({ serviceId: 'stock-tracker' });
    const event = await reporter.report('タイトル', error);

    expect(JSON.parse(event?.context ?? '{}')).toEqual({
      errorName: 'TypeError',
      errorMessage: '型が違います',
      errorStack: error.stack,
    });
  });

  it('Error 以外の例外でも報告でき、errorStack を含めない', async () => {
    const reporter = createErrorReporter({ serviceId: 'stock-tracker' });
    const event = await reporter.report('タイトル', 'oops');

    expect(event?.message).toBe('oops');
    expect(JSON.parse(event?.context ?? '{}')).toEqual({
      errorName: 'string',
      errorMessage: 'oops',
    });
  });

  it('options で severity・message・context を指定できる', async () => {
    const reporter = createErrorReporter({ serviceId: 'stock-tracker' });
    const event = await reporter.report('タイトル', new Error('失敗'), {
      severity: 'warning',
      message: '指定メッセージ',
      context: { market: 'US' },
    });

    expect(event?.severity).toBe('warning');
    expect(event?.message).toBe('指定メッセージ');
    expect(JSON.parse(event?.context ?? '{}')).toMatchObject({
      market: 'US',
      errorMessage: '失敗',
    });
  });

  it('context の同名キーは例外から組み立てた項目が優先される', async () => {
    const reporter = createErrorReporter({ serviceId: 'stock-tracker' });
    const event = await reporter.report('タイトル', new Error('実際の失敗'), {
      context: { errorMessage: '呼び出し側の値' },
    });

    expect(JSON.parse(event?.context ?? '{}').errorMessage).toBe('実際の失敗');
  });

  it('onError は report(title, error) と同じ内容を報告する', async () => {
    const reporter = createErrorReporter({ serviceId: 'stock-tracker' });
    await reporter.onError('Push 購読の登録に失敗しました')(new Error('失敗'));

    const records = getInMemoryWriter().getRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      serviceId: 'stock-tracker',
      severity: 'error',
      title: 'Push 購読の登録に失敗しました',
      message: '失敗',
    });
  });

  it('複数回呼び出せる', async () => {
    const reporter = createErrorReporter({ serviceId: 'codec-converter' });
    await reporter.report('1回目', new Error('a'));
    await reporter.report('2回目', new Error('b'), { severity: 'warning' });

    expect(getInMemoryWriter().getRecords()).toHaveLength(2);
  });

  it('書き込み失敗時は null を返し、onError も例外を投げない', async () => {
    const writer = getInMemoryWriter();
    jest.spyOn(writer, 'put').mockRejectedValue(new Error('書き込み失敗'));

    const reporter = createErrorReporter({ serviceId: 'stock-tracker' });

    await expect(reporter.report('タイトル', new Error('x'))).resolves.toBeNull();
    await expect(reporter.onError('タイトル')(new Error('x'))).resolves.toBeUndefined();
  });
});
