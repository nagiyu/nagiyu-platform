/**
 * @jest-environment node
 */
import { reportErrorEvent, resetErrorEventWriter } from '@nagiyu/aws';
import { createErrorEventReader, resetErrorEventReader } from '@nagiyu/admin-core';

// admin-core の index は Web Push 送信も読み込む。ここで使わないため、web の Jest が解決できない
// `@nagiyu/common/push` はスタブにする
jest.mock('@nagiyu/common/push', () => ({}), { virtual: true });

// InMemory のとき、実物の reportErrorEvent が書いたイベントを
// 実物の Reader が読めること (Writer と Reader が別の実装・別のモジュールにあるため)
describe('InMemory のエラーイベントの書き込みと参照', () => {
  const originalUseInMemory = process.env.USE_IN_MEMORY_DB;
  const originalTableName = process.env.ERROR_EVENTS_TABLE_NAME;

  beforeEach(() => {
    process.env.USE_IN_MEMORY_DB = 'true';
    // InMemory でも未設定だと書き込まずに null を返す
    process.env.ERROR_EVENTS_TABLE_NAME = 'error-events-test';
    resetErrorEventWriter();
    resetErrorEventReader();
  });

  afterEach(() => {
    resetErrorEventWriter();
    resetErrorEventReader();
    if (originalUseInMemory === undefined) {
      delete process.env.USE_IN_MEMORY_DB;
    } else {
      process.env.USE_IN_MEMORY_DB = originalUseInMemory;
    }
    if (originalTableName === undefined) {
      delete process.env.ERROR_EVENTS_TABLE_NAME;
    } else {
      process.env.ERROR_EVENTS_TABLE_NAME = originalTableName;
    }
  });

  it('reportErrorEvent が書いたイベントを list で読める', async () => {
    const written = await reportErrorEvent({
      serviceId: 'stock-tracker',
      severity: 'error',
      title: '取得に失敗しました',
      message: '取得処理で例外が発生しました',
    });

    expect(written).not.toBeNull();
    const result = await createErrorEventReader().list({});
    expect(result.items.map((e) => e.eventId)).toEqual([written!.eventId]);
    expect(result.items[0]).toMatchObject({
      serviceId: 'stock-tracker',
      title: '取得に失敗しました',
    });
  });

  it('reportErrorEvent が書いたイベントを findById で読める', async () => {
    const written = await reportErrorEvent({
      serviceId: 'stock-tracker',
      severity: 'error',
      title: '取得に失敗しました',
      message: '取得処理で例外が発生しました',
    });

    const found = await createErrorEventReader().findById(
      written!.eventId,
      written!.occurredAt,
      'stock-tracker'
    );

    expect(found).toEqual(written);
  });
});
